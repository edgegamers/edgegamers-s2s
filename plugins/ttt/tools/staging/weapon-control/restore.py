#!/usr/bin/env python3
"""Explicitly restore the checksum-preserved TTT cohort after the native control test.

Run on the existing staging host, with zero connected humans. No image, game,
native, configuration or credential files are changed. Root primes the restored
map lifecycle and restores the desired bot count after successful admission.
"""
from pathlib import Path
import datetime,hashlib,json,os,re,socket,subprocess,time

R=Path('/home/ghirakawa/s2s-ttt-staging')
E=R/'private/weapon-control-isolation-20261005-ready'
H=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def run(args,timeout=25):
    q=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
    if q.returncode:raise RuntimeError('staging command unsuccessful')
    return q.stdout

def rcon(command):
    return run(['python3',str(R/'rcon.py'),'--password-file',str(R/'private/rcon.env'),command])

def main():
    rec=json.loads((E/'receipt.json').read_text())
    assert rec['accepted'] and not (E/'restored.json').exists()
    match=re.search(r'players\s*:\s*(\d+) humans,\s*(\d+) bots',rcon('status'))
    assert match and int(match[1])==0
    plugins=R/'addon/plugins';control=plugins/'ttt-weapon-control.s2sp';backup=E/'ttt-plugins'
    assert H(control)==rec['controlSHA']
    assert all(H(backup/n)==h and not (plugins/n).exists() for n,h in rec['savedTTT'].items())
    assert all(H(R/n)==h for n,h in rec['preserved'].items())
    before=json.loads(run(['docker','inspect','--format','{"id":{{json .Id}},"image":{{json .Image}}}','s2s-ttt-cs2']))
    assert before['id']==rec['before']['id'] and before['image']==rec['before']['image']
    run(['docker','stop','--time','20','s2s-ttt-cs2'],timeout=50)
    state=json.loads(run(['docker','inspect','--format','{{json .State}}','s2s-ttt-cs2']));assert not state['Running']
    os.replace(control,E/'completed-control.s2sp')
    for n,h in rec['savedTTT'].items():
        assert H(backup/n)==h;os.replace(backup/n,plugins/n)
    assert len(list(plugins.glob('*.s2sp')))==25
    run(['docker','start','s2s-ttt-cs2'])
    deadline=time.monotonic()+50;ready=False
    while time.monotonic()<deadline:
        try:
            with socket.create_connection(('127.0.0.1',27025),timeout=1):pass
        except OSError:
            time.sleep(1);continue
        run(['python3',str(R/'console-bootstrap.py'),'--password-file',str(R/'private/rcon.env')],timeout=10)
        time.sleep(1)
        q=subprocess.run(['python3',str(R/'rcon.py'),'--password-file',str(R/'private/rcon.env'),'sm plugins list'],capture_output=True,text=True,timeout=10)
        if q.returncode==0 and sum('(running)' in l for l in q.stdout.splitlines())==25:
            ready=True;break
    assert ready
    assert all(H(plugins/n)==h for n,h in rec['savedTTT'].items())
    assert all(H(R/n)==h for n,h in rec['preserved'].items())
    result={'restored':True,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'runningOwners':25,
            'nativeAndConfigPreserved':True,'sameContainerAndImage':True,'mapPrecachePrimingRequired':True}
    p=E/'restored.json';p.write_text(json.dumps(result,indent=2)+'\n');p.chmod(0o600)
    print(json.dumps(result))

if __name__=='__main__':main()
