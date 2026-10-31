"""Bounded, one-shot host prototype. Importing it performs no I/O.

This file must be reviewed before installation. It is NOT wired into boot.sh.
"""
import argparse
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import re
import socket
import stat
import struct
import subprocess
import tempfile
import time

CONTAINER = 's2s-ttt-cs2'
ROOT = Path('/home/ghirakawa/s2s-ttt-staging')
VERSION = '0.7.0+interop-fix.10379521277a'
EXPECTED = frozenset(
    ['@edgegamers/ttt-' + n for n in ('bodies', 'communication', 'core', 'items', 'karma',
     'public-api-probe', 'reports', 'shop', 'special', 'ui', 'world')] +
    ['@s2script/' + n for n in ('adminhelp', 'adminmenu', 'antiflood', 'basebans',
     'basechat', 'basecomm', 'basecommands', 'basetriggers', 'basevotes',
     'clientprefs', 'funcommands', 'playercommands', 'reservedslots', 'zones')])
MAPS = frozenset({'de_inferno'})
STAMP = re.compile(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z\Z')

class Refused(Exception):
    """Only fixed reason codes, never external output, cross this boundary."""


def valid_stamp(value, *, allow_zero=False):
    if not isinstance(value, str) or not STAMP.fullmatch(value): return False
    whole, _, fraction = value[:-1].partition('.')
    try: dt.datetime.strptime(whole, '%Y-%m-%dT%H:%M:%S')
    except ValueError: return False
    if whole.startswith('0001-'):
        return allow_zero and whole == '0001-01-01T00:00:00' and not fraction.strip('0')
    return True


def valid_container_id(value):
    return isinstance(value, str) and re.fullmatch(r'[0-9a-f]{64}', value) is not None


def valid_stopped_identity(value):
    return (isinstance(value, list) and len(value) == 3 and valid_container_id(value[0])
            and valid_stamp(value[1], allow_zero=True) and valid_stamp(value[2], allow_zero=True))


def orchestrate(backend, ledger, *, target, start=False, seed=None, timeout=180):
    """All effects are injected. Same-StartedAt unknown map effects never repeat."""
    if target not in MAPS or not 1 <= timeout <= 600:
        return 'refused:arguments'
    end = backend.monotonic() + timeout
    def budget():
        if backend.monotonic() >= end: raise Refused('deadline')
    def io(call, *args):
        budget()
        result = call(*args)
        budget()
        return result
    def pause():
        remaining = end - backend.monotonic()
        if remaining <= 0: raise Refused('deadline')
        backend.sleep(min(1, remaining))
    def state():
        return io(backend.inspect)
    def running(s):
        return s['Running'] is True and s['Status'] == 'running' and type(s['Pid']) is int and s['Pid'] > 0
    try:
        with ledger:
            data = ledger.load()
            s = state()
            if not running(s):
                if seed is not None: raise Refused('seed_stopped')
                if not (s['Running'] is False and type(s['Pid']) is int and s['Pid'] == 0 and s['Status'] in ('created', 'exited')):
                    raise Refused('container_state')
                if not start: raise Refused('stopped')
                stopped = [s['Id'], s['StartedAt'], s['FinishedAt']]
                if not valid_stopped_identity(stopped): raise Refused('container_state')
                if data.get('start_pending') == stopped: raise Refused('start_pending')
                fresh = state()
                if fresh != s: raise Refused('container_changed')
                # Definitively stopped/Pid0 is the zero-human proof for this mutation.
                data['start_pending'] = stopped
                ledger.save(data)
                io(backend.start)
                while True:
                    fresh = state()
                    if fresh['Id'] != s['Id']: raise Refused('container_changed')
                    if running(fresh): break
                    pause()
                s = fresh
            identity = (s['Id'], s['StartedAt'])
            if not valid_container_id(identity[0]) or not valid_stamp(identity[1]):
                raise Refused('start_identity')
            def same():
                fresh = state()
                if not running(fresh) or (fresh['Id'], fresh['StartedAt']) != identity:
                    raise Refused('container_changed')
            key = identity[1]
            entries = data['starts']
            if key not in entries:
                if len(entries) >= 64: raise Refused('ledger_full')
                entries[key] = {'container_id': identity[0], 'bootstrap': 'new', 'cycle': 'new', 'target': target}
            entry = entries[key]
            if entry['container_id'] != identity[0] or entry['target'] != target:
                raise Refused('ledger_identity')
            def zero():
                same()
                humans = io(backend.status)
                same()
                if humans is None: raise Refused('rcon_unavailable')
                if type(humans) is not int or humans != 0: raise Refused('humans')
            def ready():
                same()
                ok = io(backend.readiness)
                info = io(backend.info)
                same()
                if info is not None and info['humans'] != 0: raise Refused('humans')
                return bool(ok and info is not None and info['app_id'] == 730)
            # Bootstrap has its own pending receipt. A subsequent read-only status
            # may resolve it; unavailable status never authorizes redispatch.
            humans = io(backend.status)
            same()
            if humans is None:
                if seed is not None: raise Refused('seed_rcon')
                if entry['cycle'] != 'new': raise Refused('cycle_' + entry['cycle'])
                if entry['bootstrap'] != 'new': raise Refused('bootstrap_' + entry['bootstrap'])
                while True:
                    same()
                    info = io(backend.info)
                    same()
                    if info is not None:
                        if info['app_id'] != 730 or info['humans'] != 0: raise Refused('humans')
                        break
                    pause()
                entry['bootstrap'] = 'pending'
                ledger.save(data)
                # Persistence may take time; repeat fresh zero-human/native identity
                # observation immediately before the protected helper mutation.
                same()
                info = io(backend.info)
                same()
                if info is None or info['app_id'] != 730 or info['humans'] != 0:
                    raise Refused('bootstrap_guard')
                io(backend.bootstrap)
                while io(backend.status) is None:
                    same(); pause()
                zero()
            elif type(humans) is not int or humans != 0:
                raise Refused('humans')
            entry['bootstrap'] = 'ready'
            ledger.save(data)
            while not ready(): pause()
            zero()
            if entry['cycle'] == 'ready':
                return 'already_ready'
            if seed is not None:
                if entry['cycle'] != 'new' or seed != key: raise Refused('seed_identity')
                info = io(backend.info); same(); zero()
                if info is None or info['map'] != target or info['humans'] != 0: raise Refused('seed_map')
                entry.update(cycle='ready', confirmation='operator_seed')
                ledger.save(data)
                return 'seeded'
            if entry['cycle'] == 'new':
                cursor = io(backend.cursor)
                if not valid_stamp(cursor): raise Refused('cursor')
                zero()
                entry.update(cycle='pending', cursor=cursor)
                ledger.save(data)
                zero()  # fresh guard after durable admission, before dispatch
                io(backend.cycle, target)
            # Includes read-only reconciliation of a previously unknown dispatch.
            while True:
                same()
                marked = io(backend.markers, entry['cursor'], target)
                if marked and ready():
                    info = io(backend.info); same(); zero()
                    if info is not None and info['map'] == target and info['humans'] == 0:
                        entry.update(cycle='ready', confirmation='new_map_lifecycle')
                        ledger.save(data)
                        return 'primed'
                pause()
    except Refused as e:
        return 'refused:' + str(e)
    except Exception:
        # External exceptions may contain passwords/argv/output; never print them.
        return 'refused:adapter_or_io_failure'


def stamp_key(value):
    # Fixed-width normalized UTC tuple preserves Docker nanoseconds exactly.
    whole, dot, fraction = value[:-1].partition('.')
    return whole, fraction.ljust(9, '0') if dot else '000000000'


def parse_status(text):
    rows = re.findall(r'^\s*players\s*:\s*(\d+) humans,\s*(\d+) bots\s*(?:\(.*\))?\s*$', text, re.M)
    if len(rows) != 1: return None
    h, b = map(int, rows[0])
    return h if h + b <= 255 else None


def plugins_ready(text):
    rows = re.findall(r'^\[s2script\]\s+\d+\s+"([^"\r\n]+)"\s+\(([^)]+)\)\s*$', text, re.M)
    # Reject any malformed plugin row rather than silently ignoring it.
    candidates = re.findall(r'^\[s2script\]\s+\d+\s+.*$', text, re.M)
    return (len(rows) == len(candidates) == 25 and len({n for n, _ in rows}) == 25
            and {n for n, _ in rows} == EXPECTED and all(s == 'running' for _, s in rows))


def runtime_ready(text):
    rows = re.findall(r'^\s*\[\d+\] s2script \(([^)]+)\) by s2script\s*$', text, re.M)
    return rows == [VERSION]


def parse_info(packet):
    """Strict unsplit modern A2S_INFO; all mandatory/advertised fields present."""
    if not packet.startswith(b'\xff\xff\xff\xffI'): raise Refused('a2s_header')
    i = 5
    def take(n):
        nonlocal i
        if i+n > len(packet): raise Refused('a2s_truncated')
        value = packet[i:i+n]; i += n; return value
    def string():
        nonlocal i
        end = packet.find(b'\0', i, min(len(packet), i+513))
        if end < 0: raise Refused('a2s_string')
        try: value = packet[i:end].decode('utf-8', 'strict')
        except UnicodeError: raise Refused('a2s_string')
        i = end+1; return value
    if take(1) != b'\x11': raise Refused('a2s_protocol')
    string(); map_name = string(); string(); string()
    app_id = struct.unpack('<H', take(2))[0]
    players, maximum, bots = take(3)
    if bots > players or players > maximum: raise Refused('a2s_counts')
    server_type, environment, visibility, vac = take(4)
    if server_type not in b'dlp' or environment not in b'lwm' or visibility > 1 or vac > 1:
        raise Refused('a2s_fields')
    string()  # server version
    if i < len(packet):
        flags = take(1)[0]
        if flags & ~0xf1: raise Refused('a2s_edf')
        if flags & 0x80: take(2)
        if flags & 0x10: take(8)
        if flags & 0x40: take(2); string()
        if flags & 0x20: string()
        if flags & 0x01: take(8)
    if i != len(packet) or app_id != 730: raise Refused('a2s_game')
    return {'app_id': app_id, 'map': map_name, 'humans': players-bots}


def query_info(sock_factory=socket.socket):
    request = b'\xff\xff\xff\xffTSource Engine Query\0'
    with sock_factory(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.settimeout(2)
        # Connected UDP filters responses to this exact endpoint in the kernel.
        sock.connect(('127.0.0.1', 27025))
        def exchange(payload):
            sock.send(payload)
            packet, _, flags, _ = sock.recvmsg(8192)
            if flags & socket.MSG_TRUNC: raise Refused('a2s_truncated')
            return packet
        packet = exchange(request)
        if packet.startswith(b'\xff\xff\xff\xffA'):
            if len(packet) != 9: raise Refused('a2s_challenge')
            packet = exchange(request + packet[5:])
        return parse_info(packet)


class Ledger:
    """Owner-only directory, nonblocking process lock, fsync+atomic replace."""
    def __init__(self, directory): self.directory = Path(directory); self.lock = None
    def __enter__(self):
        try: self.directory.mkdir(mode=0o700)
        except FileExistsError: pass
        s = self.directory.lstat()
        if not stat.S_ISDIR(s.st_mode) or s.st_uid != os.getuid() or stat.S_IMODE(s.st_mode) != 0o700:
            raise Refused('ledger_permissions')
        self.lock = os.open(self.directory/'lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        s = os.fstat(self.lock)
        if not stat.S_ISREG(s.st_mode) or s.st_uid != os.getuid() or stat.S_IMODE(s.st_mode) != 0o600:
            os.close(self.lock); self.lock = None; raise Refused('ledger_permissions')
        try: fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            os.close(self.lock); self.lock = None; raise Refused('busy')
        return self
    def __exit__(self, *args):
        if self.lock is not None: os.close(self.lock); self.lock = None
    def load(self):
        try: fd = os.open(self.directory/'state.json', os.O_RDONLY | os.O_NOFOLLOW)
        except FileNotFoundError: return {'version': 1, 'starts': {}}
        with os.fdopen(fd) as f:
            s = os.fstat(f.fileno())
            if s.st_uid != os.getuid() or not stat.S_ISREG(s.st_mode) or stat.S_IMODE(s.st_mode) != 0o600 or s.st_size > 65536:
                raise Refused('ledger_permissions')
            value = json.load(f)
        if (not isinstance(value, dict) or type(value.get('version')) is not int or value['version'] != 1
            or not isinstance(value.get('starts'), dict) or len(value['starts']) > 64
            or ('start_pending' in value and not valid_stopped_identity(value['start_pending']))):
            raise Refused('ledger_invalid')
        for key, entry in value['starts'].items():
            if (not valid_stamp(key) or not isinstance(entry, dict)
                or entry.get('bootstrap') not in ('new', 'pending', 'ready')
                or entry.get('cycle') not in ('new', 'pending', 'ready')
                or entry.get('target') not in MAPS or not valid_container_id(entry.get('container_id'))
                or (entry.get('cycle') == 'pending' and not valid_stamp(entry.get('cursor')))):
                raise Refused('ledger_invalid')
        return value
    def save(self, value):
        raw = json.dumps(value, sort_keys=True, separators=(',', ':')).encode()
        if len(raw) > 65536: raise Refused('ledger_full')
        fd, name = tempfile.mkstemp(prefix='.state-', dir=self.directory)
        try:
            with os.fdopen(fd, 'wb') as f:
                f.write(raw); f.flush(); os.fsync(f.fileno())
            os.replace(name, self.directory/'state.json')
            d = os.open(self.directory, os.O_RDONLY)
            try: os.fsync(d)
            finally: os.close(d)
        finally:
            if os.path.exists(name): os.unlink(name)


class Host:
    """Fixed existing public tools only. Never reads or logs password contents."""
    monotonic = staticmethod(time.monotonic)
    sleep = staticmethod(time.sleep)
    def __init__(self, password_file): self.password_file = str(password_file)
    def command(self, args, *, merge_stderr=False):
        # Output is private and never echoed. Spooled to private anonymous files
        # to avoid an unbounded PIPE allocation; only bounded output is read.
        with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
            try: result = subprocess.run(args, stdout=out, stderr=subprocess.STDOUT if merge_stderr else err, timeout=6, check=False)
            except (OSError, subprocess.TimeoutExpired): raise Refused('command_unknown')
            if result.returncode != 0: raise Refused('command_failed')
            if out.tell() > 262144 or err.tell() > 262144: raise Refused('output_bound')
            out.seek(0)
            return out.read().decode('utf-8', 'strict')
    def inspect(self):
        raw = self.command(['docker', 'inspect', '--format', '{{json .State}}|{{.Id}}', CONTAINER])
        state_text, identity = raw.strip().split('|', 1)
        value = json.loads(state_text)
        if not re.fullmatch(r'[0-9a-f]{64}', identity): raise Refused('container_identity')
        value['Id'] = identity
        return value
    def start(self): self.command(['docker', 'start', CONTAINER])
    def rcon(self, command):
        return self.command(['python3', str(ROOT/'rcon.py'), '--password-file', self.password_file, command])
    def status(self):
        try: return parse_status(self.rcon('status'))
        except Refused: return None
    def info(self):
        try: return query_info()
        except (TimeoutError, ConnectionError, OSError): return None
    def bootstrap(self):
        self.command(['python3', str(ROOT/'console-bootstrap.py'), '--password-file', self.password_file])
    def readiness(self):
        try: return plugins_ready(self.rcon('sm plugins list')) and runtime_ready(self.rcon('meta list'))
        except Refused: return False
    def cursor(self): return dt.datetime.now(dt.timezone.utc).isoformat(timespec='microseconds').replace('+00:00', 'Z')
    def cycle(self, target):
        if target not in MAPS: raise Refused('target')
        self.rcon('changelevel ' + target)
    def markers(self, cursor, target):
        text = self.command(['docker', 'logs', '--timestamps', '--since', cursor, '--tail', '2000', CONTAINER], merge_stderr=True)
        # --since cursor excludes prior startup markers; timestamp comparison also
        # excludes equal boundaries. Require map-start followed by activation.
        phase = 0
        for line in text.splitlines():
            timestamp, _, message = line.partition(' ')
            if not STAMP.fullmatch(timestamp) or stamp_key(timestamp) <= stamp_key(cursor): continue
            if re.fullmatch(r'\[s2script\] map start: ' + re.escape(target) + r' \(maxClients=\d+\)', message): phase = 1
            elif phase == 1 and re.fullmatch(r'Host activate: Changelevel \(' + re.escape(target) + r'\)', message): return True
        return False


def main():
    class PrivateParser(argparse.ArgumentParser):
        def error(self, message): self.exit(2, '{"result":"refused:arguments"}\n')
    p = PrivateParser(description='Review-only prototype: one startup prime per Docker StartedAt.')
    p.add_argument('--target-map', required=True, choices=sorted(MAPS))
    p.add_argument('--password-file', required=True, type=Path)
    p.add_argument('--state-dir', required=True, type=Path)
    p.add_argument('--start-if-stopped', action='store_true')
    p.add_argument('--seed-already-primed-started-at')
    p.add_argument('--timeout', type=int, default=180)
    args = p.parse_args()
    result = orchestrate(Host(args.password_file), Ledger(args.state_dir), target=args.target_map,
                         start=args.start_if_stopped, seed=args.seed_already_primed_started_at, timeout=args.timeout)
    print(json.dumps({'result': result}))
    return 0 if result in ('primed', 'already_ready', 'seeded') else 2

if __name__ == '__main__': raise SystemExit(main())
