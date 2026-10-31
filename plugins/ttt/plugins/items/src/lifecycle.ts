import {Server} from '@s2script/sdk/server';
import {createEntity as engineCreate,type EntityRef} from '@s2script/sdk/entity';
import {Transmit} from '@s2script/sdk/transmit';
import {Beam,type BeamHandle} from '@s2script/cs2';
let closed=true;
let epoch=0;
const entities=new Set<EntityRef>();
const beams=new Set<BeamHandle>();
export function open():void {closed=false;epoch++;}
export function close():void {closed=true;epoch++;}
export function isOpen():boolean{return !closed;}
export function ownerEpoch():number{return epoch;}
export function assertOpen():void {if(closed)throw Error('Items owner retired');}
interface Admission {epoch:number;map:string;}
function capture():Admission {assertOpen();return {epoch,map:Server.mapName};}
const admissions:Admission[]=[];
/** Nested calls and reset cleanup own their scope; returning restores the retired outer scope. */
export function withAdmission<T>(call:()=>T):T {admissions.push(capture());try{return call();}finally{admissions.pop();}}
function admit():Admission {const before=capture(),held=admissions[admissions.length-1];if(held&&!current(held))throw Error('Items invocation retired');return before;}
function current(before:Admission):boolean {try{return !closed&&epoch===before.epoch&&Server.mapName===before.map;}catch{return false;}}
export function checked<T>(call:()=>T):T {const before=admit();const result=call();if(!current(before))throw Error('Items owner retired during operation');return result;}
/** Advance only at an existing reset boundary; nested cleanup owns the new admission stamp. */
export function resetOperation(call:()=>void):void {assertOpen();epoch++;withAdmission(()=>checked(call));}
function attempt(fn:()=>void):void{try{fn();}catch(error){try{console.log('[ttt] Items cleanup failed: '+String(error));}catch{}}}
function destroyEntity(ref:EntityRef):void{attempt(()=>{if(ref.isValid())Transmit.setVisibleTo(ref,[]);});attempt(()=>{if(ref.isValid())ref.acceptInput('Kill');});}
/** Adopt before checking reentry: a constructor can return a handle after OnPluginEnd. */
export function createOwned<T extends EntityRef|null>(call:()=>T):T {const before=admit();for(const old of entities)if(!old.isValid())entities.delete(old);if(!current(before))throw Error('Items creation retired');const result=call();if(result!==null){if(!current(before)){destroyEntity(result);throw Error('Items creation retired');}entities.add(result);}if(!current(before))throw Error('Items creation retired');return result;}
export const createEntity:typeof engineCreate=(...args)=>createOwned(()=>engineCreate(...args));
export const createBeam:typeof Beam.draw=(...args)=>{const before=admit();const result=Beam.draw(...args);if(result!==null){if(!current(before)){attempt(()=>result.remove());throw Error('Items beam creation retired');}beams.add(result);}if(!current(before))throw Error('Items beam creation retired');return result;};
/** All cleanup uses retained handles only; never queries Core or another owner. */
export function cleanupResources():void {
 const refs=[...entities],lines=[...beams];entities.clear();beams.clear();
 for(const ref of refs)attempt(()=>{if(ref.isValid())Transmit.setVisibleTo(ref,[]);});
 for(const beam of lines)attempt(()=>beam.remove());
 for(let i=refs.length-1;i>=0;i--){const ref=refs[i]!;attempt(()=>{if(ref.isValid())ref.acceptInput('Kill');});}
}
/** Ordinary resets drop retired handles without changing the source cleanup sequence. */
export function pruneResources():void{for(const ref of entities)if(!ref.isValid())entities.delete(ref);}
export function entityInput(ref:EntityRef,...args:Parameters<EntityRef['acceptInput']>):boolean;
export function entityInput(ref:EntityRef|null|undefined,...args:Parameters<EntityRef['acceptInput']>):boolean|undefined;
export function entityInput(ref:EntityRef|null|undefined,...args:Parameters<EntityRef['acceptInput']>):boolean|undefined {if(ref==null)return undefined;const result=checked(()=>ref.acceptInput(...args));if(args[0]==='Kill'&&result)entities.delete(ref);return result;}
export function removeBeam(beam:BeamHandle|null|undefined):void {if(beam==null)return;checked(()=>beam.remove());beams.delete(beam);}
