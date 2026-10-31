#!/usr/bin/env python3
"""Local draft. No execution unless --execute; Root alone supplies exact pin JSON and runs remotely."""
import argparse,datetime,hashlib,json,re,subprocess,time
from pathlib import Path
R=Path('/home/ghirakawa/s2s-ttt-staging');CONTAINER='s2s-ttt-cs2'
PISTOLS={1,2,3,4,30,32,36,61,63}  # choose an actual other pistol, not an existing revolver

def messages(text):
 groups={}
 for line in text.splitlines():
  i=line.find('{"probe":')
  if i<0:continue
  try:v=json.loads(line[i:])
  except ValueError:continue
  if not isinstance(v,dict):continue
  k,n,total,part=v.get('probe'),v.get('part'),v.get('total'),v.get('text')
  if type(k)!=int or type(n)!=int or type(total)!=int or not 1<=n<=total<=256 or not isinstance(part,str) or len(part)>1024:raise RuntimeError('invalid-chunk')
  g=groups.setdefault(k,{})
  if n in g and g[n]!=(total,part):raise RuntimeError('conflicting-chunk')
  g[n]=(total,part)
 out=[]
 for g in groups.values():
  if any(v[0]!=len(g) for v in g.values()) or set(g)!=set(range(1,len(g)+1)):raise RuntimeError('incomplete-chunk')
  out.append(json.loads(''.join(g[i][1] for i in range(1,len(g)+1))))
 return out

def identity(rows):
 choices=[x for x in rows if isinstance(x,dict) and set(('state','epoch','roundsThisMap','players'))<=x.keys()]
 if len(choices)!=1:raise RuntimeError('identity-unavailable')
 x=choices[0]
 if x['state']!=2 or type(x['epoch'])!=int or not isinstance(x['players'],list) or len(x['players'])!=8:raise RuntimeError('identity-not-active-eight')
 slots=set()
 for p in x['players']:
  if set(p)!=set(('slot','generation','roundEpoch')) or any(type(p[k])!=int for k in p) or not 0<=p['slot']<64 or p['slot'] in slots or p['roundEpoch']!=x['epoch']:raise RuntimeError('identity-invalid')
  slots.add(p['slot'])
 return {**x,'players':sorted(x['players'],key=lambda p:p['slot'])}

def motion_ok(x,slot):
 rows=x.get('rows',[])
 return (x.get('event')=='bot-motion' and x.get('slot')==slot and x.get('reason')=='deadline' and
  x.get('samples')==len(rows) and 24<=len(rows)<=26 and x.get('elapsedMs')==5000 and
  all(r.get('activeDef')==64 and r.get('activeValid') is True and r.get('activeOwned') is True and r.get('lifeState')==0 and r.get('health',0)>0 for r in rows) and
  isinstance(x.get('totalDistance'),(int,float)) and x['totalDistance']>0)

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--execute',action='store_true');ap.add_argument('--pins',type=Path);a=ap.parse_args()
 if not a.execute:print('DRAFT: root-only --execute --pins exact-path-sha256.json; one target, corrected SDK only, <=20s work plus restoration.');return
 if not a.pins:raise SystemExit('exact pins required')
 pins=json.loads(a.pins.read_text())
 if not isinstance(pins,dict) or len(pins)<3 or any(not isinstance(k,str) or not k.startswith(str(R)+'/') or not re.fullmatch('[0-9a-f]{64}',v) for k,v in pins.items()):raise SystemExit('invalid pin file')
 stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ');E=R/'private'/('fixed-revolver-motion-'+stamp);E.mkdir(mode=0o700)
 rec={'startedAt':stamp,'accepted':False,'restored':{},'sameNativeAcrossModules':'not exported; Core generation/epoch and each module private native lifetime guards only','clientRenderingObserved':False}
 deadline=time.monotonic()+20;changed=[]
 def save():p=E/'receipt.json';p.write_text(json.dumps(rec,indent=2)+'\n');p.chmod(0o600)
 def run(argv,cleanup=False):
  remaining=deadline-time.monotonic()
  if not cleanup and remaining<=0:raise RuntimeError('deadline')
  q=subprocess.run(argv,capture_output=True,text=True,timeout=5 if cleanup else min(5,remaining))
  if q.returncode:raise RuntimeError('command-failed')
  return q.stdout+q.stderr
 def rcon(cmd,cleanup=False):return run(['python3',str(R/'rcon.py'),'--password-file',str(R/'private/rcon.env'),cmd],cleanup)
 def guard():
  s=rcon('status');m=re.search(r'players\s*:\s*(\d+) humans,\s*(\d+) bots',s)
  if not m or (int(m[1]),int(m[2]))!=(0,8):raise RuntimeError('human-or-roster-change')
 def boolean(name,cleanup=False):
  s=rcon(name,cleanup);m=re.search(r'\b'+re.escape(name)+r'\s*=\s*(true|false|0|1)\b',s)
  if not m:raise RuntimeError('cvar-unreadable')
  return int(m[1] in ('true','1'))
 def checkpins():
  for path,expected in pins.items():
   with open(path,'rb') as f:actual=hashlib.file_digest(f,'sha256').hexdigest()
   if actual!=expected:raise RuntimeError('pin-drift')
 def container():return json.loads(run(['docker','inspect','--format','{{json .State}}',CONTAINER]))
 def collect(cmd,pause=0):
  start=datetime.datetime.now(datetime.timezone.utc).isoformat();response=rcon(cmd)
  if pause:
   if time.monotonic()+pause>deadline:raise RuntimeError('deadline')
   time.sleep(pause)
  log=run(['docker','logs','--since',start,CONTAINER]);p=E/(str(len(list(E.iterdir())))+'.private.log');p.write_text(response+'\n'+log);p.chmod(0o600)
  return messages(response+'\n'+log)
 try:
  save();checkpins();guard();before=container();rec['processBefore']={k:before[k] for k in ('Pid','StartedAt','Running')}
  if not before['Running']:raise RuntimeError('container-not-running')
  base=identity(collect('ttt_staging_identity'));rec['identityBefore']=base
  originals={n:boolean(n) for n in ('bot_dont_shoot','sv_lan')};rec['originals']=originals
  if originals!={'bot_dont_shoot':0,'sv_lan':0}:raise RuntimeError('unexpected-original-controls')
  guard();changed.append('bot_dont_shoot');save();rcon('sm_cvar bot_dont_shoot 1')
  if boolean('bot_dont_shoot')!=1:raise RuntimeError('shoot-control-not-applied')
  states=[v for v in collect('ttt_staging_weapons') if v.get('event')=='staging-weapon-state']
  if len(states)!=1:raise RuntimeError('weapon-state-unavailable')
  candidates=[p for p in states[0]['rows'] if p.get('bot') is True and p.get('alive') is True and p.get('possessed') is True and p.get('activeOwned') is True and p.get('activeDef') in PISTOLS]
  candidates=[p for p in candidates if any(q['slot']==p.get('slot') for q in base['players'])]
  if not candidates:raise RuntimeError('no-live-active-pistol')
  slot=min(p['slot'] for p in candidates);rec['slot']=slot
  guard();changed.append('sv_lan');save();rcon('sv_lan 1')
  if boolean('sv_lan')!=1:raise RuntimeError('LAN-not-applied')
  guard();rec['weaponIntentAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
  events=collect('ttt_public_weapon '+str(slot)+' replace',1.4);rec['weaponEvents']=[x for x in events if str(x.get('event','')).startswith('weapon-')];save()
  rcon('sv_lan 0');rec['restored']['sv_lan']=boolean('sv_lan')==0
  snaps=[v for v in rec['weaponEvents'] if v.get('event')=='weapon-snapshot'];complete=[v for v in rec['weaponEvents'] if v.get('event')=='weapon-complete']
  if len(complete)!=1 or complete[0].get('postSamples')!=7 or not snaps or any(v.get('slot')!=slot for v in snaps):raise RuntimeError('weapon-incomplete')
  if {v.get('pawnByte318') for v in snaps}!={0} or any(v.get('activeDef')!=64 or v.get('activeValidOwned') is not True for v in snaps if v.get('phase') not in ('before','after-remove')):raise RuntimeError('byte-or-active-proof-failed')
  if identity(collect('ttt_staging_identity'))!=base:raise RuntimeError('identity-drift-before-motion')
  guard();motion=[v for v in collect('ttt_staging_bot_motion '+str(slot),5.3) if v.get('event')=='bot-motion'];rec['motion']=motion
  if len(motion)!=1 or not motion_ok(motion[0],slot):raise RuntimeError('motion-proof-incomplete')
  guard();after=container();rec['identityAfter']=identity(collect('ttt_staging_identity'));checkpins()
  if rec['identityAfter']!=base or any(after[k]!=before[k] for k in ('Pid','StartedAt','Running')):raise RuntimeError('identity-or-process-drift')
  rec['accepted']=True
 except BaseException as error:rec['failureType']=type(error).__name__;rec['failureReason']=str(error) if isinstance(error,RuntimeError) else 'operator-or-tool-failure'
 finally:
  save()  # Preserve failure/outcome before restoration can itself fail.
  for name in reversed(changed):
   try:rcon(('sm_cvar ' if name=='bot_dont_shoot' else '')+name+' '+str(rec['originals'][name]),True);rec['restored'][name]=boolean(name,True)==rec['originals'][name]
   except BaseException:rec['restored'][name]=False
  if changed and not all(rec['restored'].get(n) is True for n in changed):rec['accepted']=False
  rec['endedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
 print(json.dumps({'accepted':rec['accepted'],'receipt':str(E/'receipt.json'),'restored':rec['restored']}))
if __name__=='__main__':main()
