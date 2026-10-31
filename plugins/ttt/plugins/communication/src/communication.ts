import { decluttrCall } from '../../../../decluttr/src/owner.ts';
import {Clients,type Client} from '@s2script/sdk/clients';
import {Chat} from '@s2script/sdk/chat';
import {Admin,ADMFLAG} from '@s2script/sdk/admin';
import {Voice} from '@s2script/sdk/voice';
import {Server} from '@s2script/sdk/server';
import type {CommunicationCoreMethods,CommunicationMethods,CommunicationPlayer,CommunicationSnapshot} from '../../../packages/contracts/communication-types';
import {phraseFor} from '../../../packages/contracts/phrases.ts';

const LIVE=2, TRAITOR=2, FULL_CHECK_SECONDS=1;
type Captured={player:CommunicationPlayer;client:Client};
function identity(a:CommunicationPlayer,b:CommunicationPlayer):boolean {
  return a.slot===b.slot&&a.generation===b.generation&&a.steamId===b.steamId;
}
/** One owner instance; no shared mutable cache or Core imports. */
export function createCommunication(core:CommunicationCoreMethods):CommunicationMethods&{dispose():void} {
  let closed=false,ticking=false,signature='',revision=0,warnedVoice=false,settledKey='',settledRevision=-1,checkedAt=-Infinity;
  const owned=new Map<number,Captured>();
  const policy=new Map<string,{before:string;assigned:string}>();
  function log(error:unknown):void { console.log(`[ttt] WARN: communication: ${String(error)}`); }
  function capture(player:CommunicationPlayer):Captured|null {
    const client=Clients.fromSlot(player.slot);
    return client?.isValid()?{player,client}:null;
  }
  function current(captured:Captured,snapshot:CommunicationSnapshot):CommunicationPlayer|undefined {
    if(!captured.client.isValid())return;
    return snapshot.players.find(p=>identity(p,captured.player));
  }
  function sameRound(a:CommunicationSnapshot,b:CommunicationSnapshot):boolean {return a.epoch===b.epoch&&b.state===LIVE;}
  function fingerprint(snapshot:CommunicationSnapshot):string {
    return `${snapshot.epoch}:${snapshot.state}:`+snapshot.players.filter(p=>!p.alive).map(p=>`${p.slot}/${p.generation}/${p.steamId}`).join(',');
  }
  function release(slot:number):void {
    const entry=owned.get(slot);owned.delete(slot);
    if(entry?.client.isValid())Voice.reset(slot);
  }
  function reset():void {
    revision++;signature='';
    for(const slot of [...owned.keys()]) {try{release(slot)}catch(error){log(error)}}
  }
  function entitled(mode:'dead'|'traitor',speaker:CommunicationPlayer,recipient:CommunicationPlayer,teamOnly:boolean):boolean {
    if(mode==='traitor')return speaker.role===TRAITOR&&recipient.role===TRAITOR;
    const allowed=decluttrCall<boolean|null>(null,provider=>provider.canReadChat(speaker.slot,recipient.slot,teamOnly,speaker.alive,recipient.alive,true));
    if(allowed!==null)return allowed;
    return !speaker.alive&&(recipient.slot===speaker.slot||!recipient.alive||Admin.forSlot(recipient.slot)?.hasFlags(ADMFLAG.GENERIC)===true);
  }
  function handleChat(slot:number,text:string,teamOnlyWire=0):0|2 {
    const teamOnly=teamOnlyWire===1;
    if(closed)return 0;
    const snapshot=core.getCommunicationSnapshot();if(snapshot.state!==LIVE)return 0;
    const player=snapshot.players.find(p=>p.slot===slot);if(!player)return 0;
    const mode=!player.alive&&!text.startsWith('@')?'dead':player.role===TRAITOR&&text.startsWith('@')?'traitor':null;
    if(mode===null)return 0;
    try {
    const body=(mode==='traitor'?text.slice(1):text).trim();if(body==='')return 2;
    const speaker=capture(player);if(!speaker)return 2;
    const recipients=snapshot.players.map(capture).filter((p):p is Captured=>p!==null);
    for(const recipient of recipients){
      if(closed)break;
      let now=core.getCommunicationSnapshot();
      let from=current(speaker,now),to=current(recipient,now);
      if(!sameRound(snapshot,now)||!from)break;
      if(!to||!entitled(mode,from,to,teamOnly))continue;
      const fromSlot=from.slot,toSlot=to.slot;
      const line=decluttrCall<string|null>(null,provider=>provider.formatChat(fromSlot,body,teamOnly,toSlot,mode))
        ?? phraseFor(to.slot,mode==='dead'?'DEAD_CHAT_FORMAT':'TRAITOR_CHAT_FORMAT',from.name,'\uFFFC').replace('\uFFFC',()=>body);
      // Translation/interop and each preceding native send may synchronously reenter.
      now=core.getCommunicationSnapshot();from=current(speaker,now);to=current(recipient,now);
      if(closed||!sameRound(snapshot,now)||!from)break;
      if(!to||!entitled(mode,from,to,teamOnly))continue;
      // The optional entitlement call can also reenter; validate its captured connection/life/role.
      const permittedFrom=from,permittedTo=to;
      now=core.getCommunicationSnapshot();from=current(speaker,now);to=current(recipient,now);
      if(closed||!sameRound(snapshot,now)||!from)break;
      if(to&&from.alive===permittedFrom.alive&&from.role===permittedFrom.role&&to.alive===permittedTo.alive&&to.role===permittedTo.role)Chat.toSlot(to.slot,line);
    }
    } catch(error) { try { log(error); } catch { /* diagnostics must not reopen public broadcast */ } }
    return 2;
  }
  function tick():void {
    if(closed||ticking)return;
    ticking=true;
    try {
      if(owned.size===0){
        const token=revision,hasDead=core.hasCommunicationDeadPlayers();
        if(closed||token!==revision)return;
        // Empty ownership plus no logical dead authorizes no effect.
        if(!hasDead&&owned.size===0)return;
      }
      // A full pass validates every player natively. It used to run every frame for the rest of
      // a round after its first death, only to find the same signature. When the last full pass
      // left nothing to do and Core's registry key is unchanged, skip it; natively retired
      // tokens the registry has not seen yet are still swept by a full pass once a second.
      const keyToken=revision,key=core.getCommunicationKey(),at=Server.gameTime;
      if(closed||keyToken!==revision)return;
      if(key===settledKey&&settledRevision===revision&&at>=checkedAt&&at-checkedAt<FULL_CHECK_SECONDS)return;
      checkedAt=at;settledKey='';
      const snapshot=core.getCommunicationSnapshot();
      if(snapshot.state!==LIVE){if(owned.size)reset();if(!closed&&keyToken===revision&&owned.size===0){settledKey=key;settledRevision=revision;}return;}
      const sig=fingerprint(snapshot);if(signature===sig){if(keyToken===revision){settledKey=key;settledRevision=revision;}return;}
      const token=revision;
      const dead=snapshot.players.filter(p=>!p.alive).map(capture).filter((p):p is Captured=>p!==null);
      const recipients=dead.map(p=>p.player.slot);
      let applied=true;
      for(const entry of dead){
        let now=core.getCommunicationSnapshot();
        if(closed||token!==revision||fingerprint(now)!==sig||!current(entry,now)){signature='';return;}
        const previous=owned.get(entry.player.slot);
        const reminded=previous!==undefined&&previous.client.isValid()&&identity(previous.player,entry.player);
        // Publish ownership before the outbound call so nested reset can retire it.
        owned.set(entry.player.slot,entry);
        const success=Voice.setAudibleTo(entry.player.slot,recipients);
        if(!success){applied=false;if(!reminded)owned.delete(entry.player.slot);if(!warnedVoice){warnedVoice=true;log('voice rule unavailable; retrying on the next tick');}continue;}
        now=core.getCommunicationSnapshot();
        if(closed||token!==revision||fingerprint(now)!==sig||!current(entry,now)){reset();return;}
        if(!reminded){
          const line=phraseFor(entry.player.slot,'DEAD_MUTE_REMINDER');
          now=core.getCommunicationSnapshot();
          if(closed||token!==revision||fingerprint(now)!==sig||!current(entry,now)){reset();return;}
          Chat.toSlot(entry.player.slot,line);
        }
      }
      for(const slot of [...owned.keys()])if(!recipients.includes(slot))release(slot);
      if(!closed&&token===revision&&fingerprint(core.getCommunicationSnapshot())===sig){signature=applied?sig:'';if(applied){settledKey=key;settledRevision=revision;}}
    } finally {ticking=false;}
  }
  function applyServerSettings():void {
    if(closed)return;
    for(const [name,assigned] of [['sv_alltalk','1'],['sv_voicecodec','vaudio_steam']] as const){
      if(!policy.has(name))policy.set(name,{before:Server.getCvar(name),assigned});
      Server.command(`${name} ${assigned}`);
      if(closed)return;
    }
  }
  return {handleChat,tick,reset,forget(slot){revision++;signature='';release(slot)},applyServerSettings,
    dispose(){if(closed)return;closed=true;reset();
      for(const [name,value] of policy){try{if(value.before!==value.assigned&&Server.getCvar(name)===value.assigned)Server.setCvar(name,value.before)}catch(error){log(error)}}
      policy.clear();
    },
  };
}
