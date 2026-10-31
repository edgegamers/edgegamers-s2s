import copy
import tempfile
import unittest
from pathlib import Path
import prime

class MemoryLedger:
    def __init__(self): self.data = {'version': 1, 'starts': {}}; self.busy = False
    def __enter__(self):
        if self.busy: raise prime.Refused('busy')
        self.busy = True
        return self
    def __exit__(self, *args): self.busy = False
    def load(self): return copy.deepcopy(self.data)
    def save(self, data): self.data = copy.deepcopy(data)

class Fake:
    def __init__(self):
        self.started = '2026-10-04T22:00:00.000000000Z'
        self.running = True; self.pid = 1; self.auth = False; self.humans = 0
        self.now = 0; self.actions = []; self.marker = False; self.fail_cycle = False
        self.plugin_ok = True; self.runtime_ok = True; self.map = 'de_inferno'
        self.on_bootstrap = None; self.on_cycle = None; self.on_ready = None
    def inspect(self): return {'Id': 'a'*64, 'Running': self.running, 'Pid': self.pid, 'Status': 'running' if self.running else 'exited', 'StartedAt': self.started, 'FinishedAt': '2026-10-04T21:00:00Z'}
    def start(self): self.actions.append('start'); self.running = True; self.pid = 2
    def status(self): return self.humans if self.auth else None
    def info(self): return {'humans': self.humans, 'map': self.map, 'app_id': 730}
    def bootstrap(self):
        self.actions.append('bootstrap'); self.auth = True
        if self.on_bootstrap: self.on_bootstrap()
    def readiness(self):
        if self.on_ready: self.on_ready()
        return self.plugin_ok and self.runtime_ok
    def cursor(self): return '2026-10-04T22:10:00.000000000Z'
    def cycle(self, target):
        self.actions.append('cycle'); self.map = target
        if self.on_cycle: self.on_cycle()
        if self.fail_cycle: raise RuntimeError('SECRET must not escape')
        self.marker = True
    def markers(self, cursor, target): return self.marker
    def monotonic(self): return self.now
    def sleep(self, seconds): self.now += seconds

class WorkflowTests(unittest.TestCase):
    def test_seed_never_bootstraps_when_authenticated_status_disappears(self):
        b, l = Fake(), MemoryLedger()
        self.assertEqual(prime.orchestrate(b, l, target='de_inferno', seed=b.started), 'refused:seed_rcon')
        self.assertEqual(b.actions, [])

    def test_seed_never_starts_a_stopped_container_even_with_start_flag(self):
        b, l = Fake(), MemoryLedger(); b.running = False; b.pid = 0
        self.assertEqual(prime.orchestrate(b, l, target='de_inferno', seed=b.started, start=True), 'refused:seed_stopped')
        self.assertEqual(b.actions, [])

    def test_first_boot_cycles_once_then_noop(self):
        b, l = Fake(), MemoryLedger()
        self.assertEqual(prime.orchestrate(b, l, target='de_inferno'), 'primed')
        self.assertEqual(prime.orchestrate(b, l, target='de_inferno'), 'already_ready')
        self.assertEqual(b.actions, ['bootstrap', 'cycle'])

    def run_fake(self, b, l=None, **kw):
        return prime.orchestrate(b, l or MemoryLedger(), target='de_inferno', timeout=3, **kw)
    def test_human_refuses_bootstrap_and_cycle(self):
        for auth in (False, True):
            b = Fake(); b.auth = auth; b.humans = 1
            self.assertEqual(self.run_fake(b), 'refused:humans'); self.assertEqual(b.actions, [])
    def test_wrong_25_identities_or_version_never_cycle(self):
        for field in ('plugin_ok', 'runtime_ok'):
            b = Fake(); b.auth = True; setattr(b, field, False)
            self.assertEqual(self.run_fake(b), 'refused:deadline'); self.assertEqual(b.actions, [])
    def test_new_start_identity_allows_new_once(self):
        b, l = Fake(), MemoryLedger(); self.assertEqual(self.run_fake(b, l), 'primed')
        b.started = '2026-10-04T23:00:00Z'; b.marker = False
        self.assertEqual(self.run_fake(b, l), 'primed'); self.assertEqual(b.actions.count('cycle'), 2)
    def test_unknown_cycle_pending_never_dispatches_again(self):
        b, l = Fake(), MemoryLedger(); b.fail_cycle = True
        self.assertEqual(self.run_fake(b, l), 'refused:adapter_or_io_failure')
        self.assertEqual(l.data['starts'][b.started]['cycle'], 'pending')
        self.assertEqual(self.run_fake(b, l), 'refused:deadline')
        self.assertEqual(b.actions.count('cycle'), 1)
    def test_pending_can_resolve_readonly_after_late_markers(self):
        b, l = Fake(), MemoryLedger(); b.fail_cycle = True
        self.run_fake(b, l); b.marker = True
        self.assertEqual(self.run_fake(b, l), 'primed'); self.assertEqual(b.actions.count('cycle'), 1)
    def test_bootstrap_unknown_independent_of_cycle(self):
        b, l = Fake(), MemoryLedger()
        def fail(): raise RuntimeError('secret')
        b.on_bootstrap = fail
        self.assertEqual(self.run_fake(b, l), 'refused:adapter_or_io_failure')
        self.assertEqual(l.data['starts'][b.started]['bootstrap'], 'pending')
        self.assertEqual(l.data['starts'][b.started]['cycle'], 'new')
        self.assertEqual(self.run_fake(b, l), 'primed'); self.assertEqual(b.actions.count('bootstrap'), 1)
    def test_bootstrap_unresolved_does_not_repeat(self):
        b, l = Fake(), MemoryLedger()
        def fail(): b.auth = False; raise RuntimeError('secret')
        b.on_bootstrap = fail
        self.run_fake(b, l)
        self.assertEqual(self.run_fake(b, l), 'refused:bootstrap_pending')
        self.assertEqual(b.actions, ['bootstrap'])
    def test_reentry_cannot_dispatch(self):
        b, l = Fake(), MemoryLedger(); outcomes = []
        b.on_cycle = lambda: outcomes.append(self.run_fake(b, l))
        self.assertEqual(self.run_fake(b, l), 'primed'); self.assertEqual(outcomes, ['refused:busy'])
        self.assertEqual(b.actions.count('cycle'), 1)
    def test_current_identity_fenced_after_readiness(self):
        b = Fake(); b.auth = True
        b.on_ready = lambda: setattr(b, 'started', '2026-10-05T00:00:00Z')
        self.assertEqual(self.run_fake(b), 'refused:container_changed'); self.assertEqual(b.actions, [])
    def test_human_arrives_after_ledger_pending(self):
        b, l = Fake(), MemoryLedger(); b.auth = True
        original = l.save
        def save(data):
            original(data)
            if any(v['cycle'] == 'pending' for v in data['starts'].values()): b.humans = 1
        l.save = save
        self.assertEqual(self.run_fake(b, l), 'refused:humans'); self.assertEqual(b.actions, [])
    def test_seed_requires_exact_current_identity_and_cannot_erase_pending(self):
        b, l = Fake(), MemoryLedger(); b.auth = True
        self.assertEqual(self.run_fake(b, l, seed='old'), 'refused:seed_identity')
        self.assertEqual(self.run_fake(b, l, seed=b.started), 'seeded'); self.assertEqual(b.actions, [])
        b2, l2 = Fake(), MemoryLedger(); b2.fail_cycle = True
        self.run_fake(b2, l2)
        self.assertEqual(self.run_fake(b2, l2, seed=b2.started), 'refused:seed_identity')
    def test_stopped_requires_optin_and_no_restart_running(self):
        b = Fake(); b.running = False; b.pid = 0
        self.assertEqual(self.run_fake(b), 'refused:stopped'); self.assertEqual(b.actions, [])
        self.assertEqual(self.run_fake(b, start=True), 'primed'); self.assertEqual(b.actions, ['start', 'bootstrap', 'cycle'])
        b = Fake(); self.run_fake(b, start=True); self.assertNotIn('start', b.actions)
    def test_start_unknown_does_not_repeat(self):
        b, l = Fake(), MemoryLedger(); b.running = False; b.pid = 0
        def fail(): b.actions.append('start'); raise RuntimeError('secret')
        b.start = fail
        self.assertEqual(self.run_fake(b, l, start=True), 'refused:adapter_or_io_failure')
        self.assertEqual(self.run_fake(b, l, start=True), 'refused:start_pending'); self.assertEqual(b.actions, ['start'])
    def test_target_injection_rejected_before_io(self):
        b = Fake()
        self.assertEqual(prime.orchestrate(b, MemoryLedger(), target='de_inferno;quit'), 'refused:arguments')
        self.assertEqual(b.actions, [])

    def test_bootstrap_done_but_plugins_unready_never_reboots_auth(self):
        b, l = Fake(), MemoryLedger(); b.plugin_ok = False
        self.assertEqual(self.run_fake(b, l), 'refused:deadline')
        b.auth = False
        self.assertEqual(self.run_fake(b, l), 'refused:bootstrap_ready')
        self.assertEqual(b.actions, ['bootstrap'])

class ProtocolTests(unittest.TestCase):
    def packet(self, players=2, bots=2):
        import struct
        return b'\xff\xff\xff\xffI\x11server\0de_inferno\0csgo\0Counter-Strike 2\0' + struct.pack('<H',730) + bytes([players,12,bots]) + b'dl\0\x01' + b'1.41.9.0\0'
    def test_packet_valid_and_all_truncations_fail(self):
        p = self.packet(); self.assertEqual(prime.parse_info(p)['humans'], 0)
        for n in range(len(p)):
            with self.subTest(n=n), self.assertRaises(prime.Refused): prime.parse_info(p[:n])
    def test_negative_humans_split_extra_and_wrong_app_fail(self):
        for p in (self.packet(1,2), b'\xfe\xff\xff\xff'+self.packet()[4:], self.packet()+b'\x02', self.packet().replace(b'\xda\x02', b'\x01\x00')):
            with self.assertRaises(prime.Refused): prime.parse_info(p)
    def test_exact_25_not_count_alone(self):
        rows = ['[s2script] %d "%s" (running)'%(i,n) for i,n in enumerate(sorted(prime.EXPECTED),1)]
        self.assertTrue(prime.plugins_ready('\n'.join(rows)))
        for changed in (rows[:-1], rows+[rows[0]], [rows[0].replace('running','failed')]+rows[1:], [rows[0].replace('@edgegamers/ttt-bodies','@fake/wrong')]+rows[1:]):
            self.assertFalse(prime.plugins_ready('\n'.join(changed)))
    def test_runtime_actual_receipt_format(self):
        self.assertTrue(prime.runtime_ready('  [02] s2script (0.7.0+interop-fix.10379521277a) by s2script\n'))
        self.assertFalse(prime.runtime_ready('  [02] s2script (0.7.0) by s2script\n'))
    def test_status_malformed_duplicate_negative_refuses(self):
        self.assertEqual(prime.parse_status('players : 0 humans, 2 bots (12 max)'), 0)
        for s in ('players : -1 humans, 1 bots', 'players : 256 humans, 0 bots', 'players : 0 humans, 2 bots\nplayers : 0 humans, 2 bots', 'garbage'):
            self.assertIsNone(prime.parse_status(s))
    def test_markers_fraction_order_and_actual_lines(self):
        h = prime.Host('/unused'); cursor = '2026-10-04T22:32:19.598917Z'
        text = '2026-10-04T22:32:19.598917298Z [s2script] map start: de_inferno (maxClients=12)\n2026-10-04T22:32:21.509804170Z Host activate: Changelevel (de_inferno)\n'
        h.command = lambda args, **kwargs: text
        self.assertTrue(h.markers(cursor, 'de_inferno'))
        self.assertFalse(h.markers('2026-10-04T22:33:00Z', 'de_inferno'))

class PersistenceTests(unittest.TestCase):
    def test_atomic_private_roundtrip_and_lock(self):
        import os
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)/'private'
            with prime.Ledger(path) as one:
                initial = one.load(); one.save(initial)
                self.assertEqual((path/'state.json').stat().st_mode & 0o777, 0o600)
                self.assertEqual(one.load(), initial)
                with self.assertRaises(prime.Refused):
                    with prime.Ledger(path): pass
            with prime.Ledger(path) as two: self.assertEqual(two.load(), initial)
    def test_symlink_and_public_directory_refused(self):
        import os
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp)/'target'; target.mkdir(mode=0o700)
            link = Path(tmp)/'link'; link.symlink_to(target)
            with self.assertRaises(prime.Refused):
                with prime.Ledger(link): pass
            target.chmod(0o755)
            with self.assertRaises(prime.Refused):
                with prime.Ledger(target): pass

class SocketTests(unittest.TestCase):
    class Socket:
        def __init__(self, packets): self.packets = list(packets); self.sent = []; self.endpoint = None
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def settimeout(self, value): self.timeout = value
        def connect(self, endpoint): self.endpoint = endpoint
        def send(self, payload): self.sent.append(payload)
        def recvmsg(self, maximum): return self.packets.pop(0)
    def test_challenge_exact_endpoint_once(self):
        challenge = b'\xff\xff\xff\xffA1234'
        sock = self.Socket([(challenge, [], 0, None), (ProtocolTests().packet(), [], 0, None)])
        self.assertEqual(prime.query_info(lambda *args: sock)['humans'], 0)
        self.assertEqual(sock.endpoint, ('127.0.0.1',27025))
        self.assertEqual(sock.sent[1], sock.sent[0]+b'1234'); self.assertEqual(sock.timeout, 2)
    def test_challenge_truncated_split_and_repeated_refused(self):
        import socket
        challenge = b'\xff\xff\xff\xffA1234'
        for packets in (
            [(challenge[:-1], [], 0, None)],
            [(ProtocolTests().packet(), [], socket.MSG_TRUNC, None)],
            [(b'\xfe\xff\xff\xffjunk', [], 0, None)],
            [(challenge, [], 0, None), (challenge, [], 0, None)]):
            sock = self.Socket(packets)
            with self.assertRaises(prime.Refused): prime.query_info(lambda *args: sock)
            self.assertLessEqual(len(sock.sent), 2)

class HostAdapterTests(unittest.TestCase):
    def test_inspect_one_coherent_result(self):
        import json
        h = prime.Host('/private/rcon.env'); calls = []
        snapshot = Fake().inspect(); snapshot.pop('Id')
        def command(args, **kwargs): calls.append(args); return json.dumps(snapshot)+'|'+'a'*64+'\n'
        h.command = command
        self.assertEqual(h.inspect()['Id'], 'a'*64); self.assertEqual(len(calls), 1)
    def test_fixed_command_vectors_no_shell_or_password_value(self):
        h = prime.Host('/private/rcon.env'); calls = []
        h.command = lambda args, **kwargs: calls.append((args, kwargs)) or ''
        h.bootstrap(); h.cycle('de_inferno'); h.start(); h.markers('2026-10-04T22:00:00Z', 'de_inferno')
        self.assertEqual(calls[0][0], ['python3','/home/ghirakawa/s2s-ttt-staging/console-bootstrap.py','--password-file','/private/rcon.env'])
        self.assertEqual(calls[1][0][-1], 'changelevel de_inferno')
        self.assertEqual(calls[2][0], ['docker', 'start', 's2s-ttt-cs2'])
        self.assertTrue(calls[3][1]['merge_stderr'])
        with self.assertRaises(prime.Refused): h.cycle('de_inferno;quit')
        self.assertEqual(len(calls),4)
    def test_map_markers_both_new_in_order_target_exact(self):
        h = prime.Host('/unused'); cursor='2026-10-04T22:00:00Z'
        start='2026-10-04T22:00:01Z [s2script] map start: de_inferno (maxClients=12)'
        active='2026-10-04T22:00:02Z Host activate: Changelevel (de_inferno)'
        for value in (start, active, active+'\n'+start, (start+'\n'+active).replace('de_inferno','de_dust2')):
            h.command=lambda *args, **kwargs: value
            self.assertFalse(h.markers(cursor,'de_inferno'))

class DurableWorkflowTests(unittest.TestCase):
    def test_unknown_cycle_survives_new_ledger_object(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory=Path(tmp)/'state'; b=Fake(); b.fail_cycle=True
            prime.orchestrate(b, prime.Ledger(directory), target='de_inferno', timeout=2)
            result=prime.orchestrate(b, prime.Ledger(directory), target='de_inferno', timeout=2)
            self.assertEqual(result,'refused:deadline'); self.assertEqual(b.actions.count('cycle'),1)
            self.assertEqual(list(directory.glob('.state-*')),[])
    def test_corrupt_ledger_refuses_without_mutation(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory=Path(tmp)/'state'; directory.mkdir(mode=0o700)
            state=directory/'state.json'; state.write_text('{broken'); state.chmod(0o600)
            b=Fake()
            self.assertEqual(prime.orchestrate(b,prime.Ledger(directory),target='de_inferno'),'refused:adapter_or_io_failure')
            self.assertEqual(b.actions,[]); self.assertEqual(state.read_text(),'{broken')
    def test_fsync_failure_before_dispatch_does_not_mutate(self):
        b=Fake(); b.auth=True; l=MemoryLedger(); original=l.save
        def fail(data):
            if any(e['cycle']=='pending' for e in data['starts'].values()): raise OSError('secret')
            original(data)
        l.save=fail
        self.assertEqual(prime.orchestrate(b,l,target='de_inferno'),'refused:adapter_or_io_failure')
        self.assertEqual(b.actions,[])

class ReceiptFormatTests(unittest.TestCase):
    def test_retained_actual_public_plugin_meta_and_map_lines(self):
        import json
        facts=json.loads((Path(__file__).parent/'observed-public-formats.json').read_text())
        self.assertTrue(prime.plugins_ready('\n'.join(facts['plugin_lines'])))
        self.assertTrue(prime.runtime_ready('\n'.join(facts['meta_lines'])))
        h=prime.Host('/unused'); h.command=lambda *args,**kwargs:'\n'.join(facts['lifecycle_lines'])
        self.assertTrue(h.markers('2026-10-04T22:32:19Z','de_inferno'))

class AdmissionTests(unittest.TestCase):
    def test_a2s_human_arrives_after_bootstrap_pending_persisted(self):
        b,l=Fake(),MemoryLedger(); original=l.save
        def save(data):
            original(data)
            if any(v['bootstrap']=='pending' for v in data['starts'].values()): b.humans=1
        l.save=save
        self.assertEqual(prime.orchestrate(b,l,target='de_inferno'),'refused:bootstrap_guard')
        self.assertEqual(b.actions,[])
    def test_missing_lifecycle_marker_keeps_pending(self):
        b,l=Fake(),MemoryLedger(); b.markers=lambda *args:False
        self.assertEqual(prime.orchestrate(b,l,target='de_inferno',timeout=2),'refused:deadline')
        self.assertEqual(prime.orchestrate(b,l,target='de_inferno',timeout=2),'refused:deadline')
        self.assertEqual(b.actions.count('cycle'),1)
    def test_partial_start_pid_is_not_authority_to_start(self):
        b=Fake(); b.running=False; b.pid=42
        self.assertEqual(prime.orchestrate(b,MemoryLedger(),target='de_inferno',start=True),'refused:container_state')
        self.assertEqual(b.actions,[])
    def test_readiness_retry_after_bootstrap_does_not_repeat_bootstrap(self):
        b,l=Fake(),MemoryLedger(); b.plugin_ok=False
        self.assertEqual(prime.orchestrate(b,l,target='de_inferno',timeout=2),'refused:deadline')
        b.plugin_ok=True
        self.assertEqual(prime.orchestrate(b,l,target='de_inferno',timeout=2),'primed')
        self.assertEqual(b.actions,['bootstrap','cycle'])

class PeerReviewTests(unittest.TestCase):
    def test_malformed_start_pending_private_ledger_never_dispatches(self):
        stamp='2026-10-04T22:00:00Z'
        bad=[None,{},False,'corrupt',[],['a'*64,stamp],['a'*64,stamp,stamp,'extra'],
             ['corrupt',stamp,stamp],['a'*63,stamp,stamp],['g'*64,stamp,stamp],
             ['a'*64,'2026-02-30T22:00:00Z',stamp],
             ['a'*64,stamp,'2026-10-04T25:00:00Z'],
             ['a'*64,'0001-01-01T00:00:00.000000001Z',stamp]]
        for pending in bad:
            with self.subTest(pending=pending),tempfile.TemporaryDirectory() as tmp:
                directory=Path(tmp)/'state';directory.mkdir(mode=0o700)
                path=directory/'state.json'
                path.write_text(__import__('json').dumps({'version':1,'starts':{},'start_pending':pending}));path.chmod(0o600)
                b=Fake();b.running=False;b.pid=0
                result=prime.orchestrate(b,prime.Ledger(directory),target='de_inferno',start=True,timeout=3)
                self.assertEqual(b.actions,[])
                self.assertTrue(result.startswith('refused:'))
    def test_stopped_pending_accepts_exact_docker_zero_timestamp(self):
        with tempfile.TemporaryDirectory() as tmp:
            with prime.Ledger(Path(tmp)/'state') as ledger:
                data={'version':1,'starts':{},'start_pending':['a'*64,'0001-01-01T00:00:00Z','0001-01-01T00:00:00.000000000Z']}
                ledger.save(data);self.assertEqual(ledger.load(),data)
    def test_malformed_running_entry_fails_closed(self):
        for container,stamp in [('wrong','2026-10-04T22:00:00Z'),('a'*64,'2026-02-30T22:00:00Z'),('a'*64,'0001-01-01T00:00:00Z')]:
            with self.subTest(container=container,stamp=stamp),tempfile.TemporaryDirectory() as tmp:
                with prime.Ledger(Path(tmp)/'state') as ledger:
                    ledger.save({'version':1,'starts':{stamp:{'container_id':container,'bootstrap':'new','cycle':'new','target':'de_inferno'}}})
                    with self.assertRaises(prime.Refused):ledger.load()
    def test_inspection_finishing_past_deadline_blocks_all_external_mutations(self):
        for action in ('start','bootstrap','cycle'):
            with self.subTest(action=action):
                b,l=Fake(),MemoryLedger();b.auth=action=='cycle'
                if action=='start':b.running=False;b.pid=0
                inspect=b.inspect;counts={'all':0,'pending':0}
                def late_inspect():
                    counts['all']+=1
                    pending=any(v.get(action)=='pending' for v in l.data['starts'].values())
                    if pending:counts['pending']+=1
                    if (action=='start' and counts['all']==2) or (action!='start' and counts['pending']==2):b.now=4
                    return inspect()
                b.inspect=late_inspect
                self.assertEqual(prime.orchestrate(b,l,target='de_inferno',start=action=='start',timeout=3),'refused:deadline')
                self.assertEqual(b.actions,[])
    def test_start_ledger_write_finishing_past_deadline_blocks_start(self):
        b,l=Fake(),MemoryLedger();b.running=False;b.pid=0;save=l.save
        def late_save(value):
            save(value)
            if 'start_pending' in value:b.now=4
        l.save=late_save
        self.assertEqual(prime.orchestrate(b,l,target='de_inferno',start=True,timeout=3),'refused:deadline')
        self.assertEqual(b.actions,[]);self.assertIn('start_pending',l.data)
    def test_completed_bootstrap_past_deadline_does_not_issue_another_read(self):
        b,l=Fake(),MemoryLedger();reads=[];status=b.status
        b.status=lambda:reads.append('status') or status()
        b.on_bootstrap=lambda:setattr(b,'now',4)
        self.assertEqual(prime.orchestrate(b,l,target='de_inferno',timeout=3),'refused:deadline')
        self.assertEqual(b.actions,['bootstrap']);self.assertEqual(reads,['status'])
        self.assertEqual(l.data['starts'][b.started]['bootstrap'],'pending')
    def test_completed_readiness_past_deadline_does_not_issue_another_read(self):
        b,l=Fake(),MemoryLedger();b.auth=True;reads=[];info=b.info
        b.info=lambda:reads.append('info') or info()
        b.on_ready=lambda:setattr(b,'now',4)
        self.assertEqual(prime.orchestrate(b,l,target='de_inferno',timeout=3),'refused:deadline')
        self.assertEqual(b.actions,[]);self.assertEqual(reads,[])
    def test_mutations_finishing_past_deadline_keep_pending_without_later_io(self):
        for action in ('start','bootstrap','cycle'):
            with self.subTest(action=action):
                b,l=Fake(),MemoryLedger();b.auth=action=='cycle';late=[]
                if action=='start':b.running=False;b.pid=0
                for name in ('inspect','status','readiness','info','cursor','markers'):
                    operation=getattr(b,name)
                    def observe(*args,name=name,operation=operation):
                        if b.now>=3:late.append(name)
                        return operation(*args)
                    setattr(b,name,observe)
                operation=getattr(b,action)
                def finish_late(*args):
                    operation(*args);b.now=4
                setattr(b,action,finish_late)
                self.assertEqual(prime.orchestrate(b,l,target='de_inferno',start=action=='start',timeout=3),'refused:deadline')
                self.assertEqual(b.actions,[action]);self.assertEqual(late,[])
                if action=='start':self.assertIn('start_pending',l.data)
                else:self.assertEqual(l.data['starts'][b.started][action],'pending')
