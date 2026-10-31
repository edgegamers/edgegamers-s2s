import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createContext,runInContext} from 'node:vm';
import {build} from 'esbuild';
import ts from 'typescript';

const sourceRoot=process.env.TTT_TEAM_SOURCE_ROOT??fileURLToPath(new URL('../src/',import.meta.url));
function functions(path:string,names:string[]):string {
  const text=readFileSync(resolve(sourceRoot,path),'utf8');
  const tree=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  return names.map(name=>{
    const node=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
    assert.ok(node,`production function ${name}`);return node.getText(tree);
  }).join('\n');
}
const plugin=ts.createSourceFile('plugin.ts',readFileSync(resolve(sourceRoot,'plugin.ts'),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
let registration='';
function find(node:ts.Node):void {
  if(ts.isCallExpression(node)&&node.expression.getText(plugin)==='scope.events.on'&&
      ts.isStringLiteral(node.arguments[0]!)&&node.arguments[0].text==='player_team')registration=node.getText(plugin);
  ts.forEachChild(node,find);
}
find(plugin);assert.ok(registration,'actual player_team POST registration');
// Production registry, event callback, team refusal/bounce and liveness readers. Only native
// state and the adjacent World/death/end-condition boundaries are controlled by the fixture.
const entry=`import * as reg from './core/registry.ts';
  import {Team,RoleId} from './core/enums.ts';
  import {Player} from '@s2script/cs2';
  const roundEpoch=()=>fixture.epoch,inProgress=()=>fixture.inProgress;
  const bodyOfPlayer=s=>fixture.bodies[s]??null;
  const benchLateJoiner=s=>fixture.bench(s),onSelfSpectate=s=>fixture.selfSpectate(s);
  const applyRoleModel=s=>fixture.world(s),checkEndConditions=()=>fixture.checks++;
  ${functions('cs2/pawn.ts',['teamOf','switchTeam'])}
  ${functions('game/teams.ts',['teamForRole','wouldRefuseTeam','enforceRoundTeam'])}
  ${functions('cs2/handlers.ts',['onTeamChange'])}
  const scope={events:{on:(name,callback)=>fixture.callback=callback}};
  ${registration};
  export {reg};`;
const boundaries:Record<string,string>={
  '@s2script/cs2':'export const Player=fixture.Player;',
  '@s2script/sdk/clients':'export const Clients=fixture.Clients;',
  '../cs2/pawn':'export const LIFE_ALIVE=0;',
};
const code=(await build({stdin:{contents:entry,resolveDir:sourceRoot,loader:'ts'},bundle:true,format:'cjs',platform:'node',write:false,plugins:[{name:'native-team-boundary',setup(b){
  b.onResolve({filter:/.*/},a=>a.path in boundaries?{path:a.path,namespace:'native'}:undefined);
  b.onLoad({filter:/.*/,namespace:'native'},a=>({contents:boundaries[a.path],loader:'js'}));
}}]})).outputFiles[0]!.text;

function fixture(size=8){
  const f:any={epoch:1,inProgress:false,checks:0,lookups:[],bodies:[],hook:null,world:()=>{},bench:()=>{},callback:null};
  f.players=Array.from({length:size},(_,slot)=>({slot,steamId:'0',token:1,connected:true,controllerId:100+slot,team:2,pawnId:200+slot,health:100,life:0}));
  f.observe=(kind:string,slot:number)=>f.hook?.(kind,slot);
  f.Clients={fromSlot(slot:number){const p=f.players[slot];if(!p?.connected)return null;const token=p.token;return {
    isValid(){f.observe('clientValid',slot);return p.connected&&p.token===token;},
    get steamId(){f.observe('clientSteam',slot);return p.connected&&p.token===token?p.steamId:'0';},
  };}};
  f.Player={fromSlot(slot:number){
    f.lookups.push(slot);const p=f.players[slot];if(!p?.connected||!p.controllerId||p.pawnId===null)return null;
    const token=p.token,controllerId=p.controllerId;
    const valid=()=>p.connected&&p.token===token&&p.controllerId===controllerId;
    return {
      ref:{index:slot+1,id:controllerId,isValid(){f.observe('controllerValid',slot);return valid();}},
      get steamId(){f.observe('playerSteam',slot);return valid()?p.steamId:'0';},
      get teamNum(){const value=valid()?p.team:null;f.observe('team',slot);return value;},
      get pawn(){
        const pawnId=p.pawnId;f.observe('pawn',slot);if(!valid()||pawnId===null)return null;
        return {ref:{index:80+slot,id:pawnId,isValid(){f.observe('pawnValid',slot);return valid()&&p.pawnId===pawnId;}},
          get lifeState(){const value=p.life;f.observe('life',slot);return value;},
          get health(){const value=p.health;f.observe('health',slot);return value;}};
      },
      switchTeam(team:number){if(valid()){p.team=team;f.emit(slot,team);}},
    };
  },allConnected:()=>[]};
  const module={exports:{} as any};runInContext(code,createContext({fixture:f,module,exports:module.exports}));
  const reg=module.exports.reg;
  for(const p of f.players){reg.addPlayer(p.slot,p.steamId,`Bot${p.slot}`);reg.setRole(p.slot,p.slot===0?2:1);reg.setAlive(p.slot,true);}
  f.emit=(slot:number,team=f.players[slot]?.team??0,disconnect=false)=>f.callback({getPlayerSlot:()=>slot,getInt:()=>team,getBool:()=>disconnect});
  f.selfSpectate=(slot:number)=>{f.players[slot].health=0;f.players[slot].life=2;reg.setAlive(slot,false);};
  return {f,reg};
}

test('three team events observe their three affected players instead of the eight-player roster',()=>{
  const {f,reg}=fixture();
  f.players[1].health=0;f.players[2].team=1;
  for(const slot of [0,1,2])f.emit(slot);
  assert.equal(reg.aliveCount(2),1);assert.equal(reg.aliveCount(1),5);
  assert.deepEqual(f.lookups,[0,1,2]);
});

test('Finished team events still update dead, pawnless, staged and non-playing liveness',()=>{
  for(const change of [
    {health:0},{life:2},{pawnId:null},{controllerId:0},{team:1},{team:0},
  ]){
    const {f,reg}=fixture(2);Object.assign(f.players[0],change);f.emit(0);
    assert.equal(reg.isAlive(0),false,JSON.stringify(change));assert.equal(reg.aliveCount(2),0);
    assert.equal(reg.isAlive(1),true);assert.equal(reg.aliveCount(1),1);
  }
  const {f,reg}=fixture(1);f.players[0].staged=true;f.emit(0);
  assert.equal(reg.isAlive(0),true,'no new staging refusal is added to the existing lifeState/health rule');
});

test('the observation follows the pawn produced by team callbacks, not the preceding dead pawn',()=>{
  const {f,reg}=fixture(2);reg.setAlive(0,false);f.players[0].health=0;f.players[0].life=2;
  f.world=()=>{f.players[0].pawnId++;f.players[0].health=100;f.players[0].life=0;};f.emit(0);
  assert.equal(reg.isAlive(0),true);assert.equal(reg.aliveCount(2),1);assert.deepEqual(f.lookups,[0]);
});

test('a synchronous nested team bounce keeps the correct team and observes only its affected slot',()=>{
  const {f,reg}=fixture(8);f.inProgress=true;f.players[1].team=3;f.emit(1,3);
  assert.equal(f.players[1].team,2);assert.equal(f.checks,2);
  assert.equal(reg.aliveCount(1),7);assert.equal(reg.aliveCount(2),1);
  assert.deepEqual(f.lookups,[1,1,1,1]);
});

test('self-spectate death and its nested team bounce preserve role counters',()=>{
  const {f,reg}=fixture(4);f.inProgress=true;f.players[0].team=1;f.emit(0,1);
  assert.equal(f.players[0].team,2);assert.equal(reg.isAlive(0),false);
  assert.equal(reg.aliveCount(2),0);assert.equal(reg.aliveCount(1),3);
  assert.ok(f.lookups.every((slot:number)=>slot===0));
});

test('disconnect, invalid and unregistered event slots never sweep other players',()=>{
  const {f,reg}=fixture(3);f.players[0].connected=false;
  f.emit(0,0,true);assert.equal(reg.isAlive(0),false);assert.equal(reg.aliveCount(2),0);
  for(const slot of [-1,64,1.5,NaN,7])f.emit(slot,0,true);
  assert.deepEqual(f.lookups,[]);assert.equal(reg.aliveCount(1),2);
});

test('a callback reconnect or round retirement cannot update the successor from the old event',()=>{
  for(const cause of ['reconnect','round','reset']){
    const {f,reg}=fixture(2);reg.setAlive(0,false);
    f.world=()=>{
      if(cause==='round'){f.epoch++;return;}
      if(cause==='reset')reg.resetRegistry();else reg.removePlayer(0);
      f.players[0].token++;reg.addPlayer(0,'0','Successor');reg.setRole(0,2);
    };
    f.emit(0);assert.equal(reg.isAlive(0),false,cause);assert.equal(reg.aliveCount(2),0,cause);
  }
});

test('same-SteamID native replacement remains refused until the registry generation advances',()=>{
  for(const steamId of ['0','76561198000000000']){
    const {f,reg}=fixture(1);f.players[0].steamId=steamId;reg.addPlayer(0,steamId,'Original');reg.setAlive(0,false);
    f.world=()=>{f.world=()=>{};f.players[0].token++;};
    f.emit(0);f.emit(0);assert.equal(reg.isAlive(0),false,steamId);
    reg.removePlayer(0);reg.addPlayer(0,steamId,'Successor');reg.setRole(0,2);
    f.emit(0);assert.equal(reg.isAlive(0),true,steamId);assert.equal(reg.aliveCount(2),1);
  }
});

test('a nested newer liveness update wins even when it writes an unchanged dead flag',()=>{
  const {f,reg}=fixture(2);reg.setAlive(0,false);
  f.hook=(kind:string)=>{if(kind==='health'){f.hook=null;f.players[0].health=0;reg.setAlive(0,false);}};
  f.emit(0);assert.equal(reg.isAlive(0),false);assert.equal(reg.aliveCount(2),0);assert.equal(reg.aliveCount(1),1);
});

test('a nested team event during health observation supersedes the outer result',()=>{
  const {f,reg}=fixture(2);
  f.hook=(kind:string)=>{if(kind==='health'){f.hook=null;f.players[0].health=0;f.emit(0);}};
  f.emit(0);assert.equal(reg.isAlive(0),false);assert.equal(reg.aliveCount(2),0);assert.equal(reg.aliveCount(1),1);
  assert.deepEqual(f.lookups,[0,0]);
});

test('pawn/controller retirement or changed team during native reads refuses stale liveness',()=>{
  for(const cause of ['pawn','controller','team','connection','round']){
    const {f,reg}=fixture(2);reg.setAlive(0,false);
    f.hook=(kind:string)=>{if(kind!=='health')return;f.hook=null;
      if(cause==='pawn')f.players[0].pawnId++;
      if(cause==='controller')f.players[0].controllerId++;
      if(cause==='team')f.players[0].team=1;
      if(cause==='connection')f.players[0].token++;
      if(cause==='round')f.epoch++;
    };
    f.emit(0);assert.equal(reg.isAlive(0),false,cause);assert.equal(reg.aliveCount(1),1,cause);
  }
});

test('last identity getter retirement and native failures cannot commit an alive result',()=>{
  const {f,reg}=fixture(1);reg.setAlive(0,false);let reads=0;
  f.hook=(kind:string)=>{if(kind==='clientSteam'&&++reads===2)f.players[0].token++;};
  f.emit(0);assert.equal(reg.isAlive(0),false);
  const other=fixture(1),failure={native:true};other.reg.setAlive(0,false);
  other.f.hook=(kind:string)=>{if(kind==='health')throw failure;};
  assert.throws(()=>other.f.emit(0),error=>error===failure);assert.equal(other.reg.isAlive(0),false);
});

test('full roster resync remains available for mass spawn and round boundaries',()=>{
  const {f,reg}=fixture(4);f.players[0].life=2;f.players[2].health=0;
  reg.resyncAlive();assert.deepEqual(f.lookups,[0,1,2,3]);
  assert.equal(reg.aliveCount(2),0);assert.equal(reg.aliveCount(1),2);
});
