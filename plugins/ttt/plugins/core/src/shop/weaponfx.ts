/** Native message hooks, charges, tracking and HE factory state belong to Items. */
import {invokeItems,invokeActorItems} from '../core/items-provider';
import type {Body} from '../core/body-provider';
export const grantSilentShots=(slot:number,count:number)=>invokeActorItems(slot,(p,a)=>p.grantSilentShots(a,count),undefined);
export const grantPoisonShots=(slot:number,count:number)=>invokeActorItems(slot,(p,a)=>p.grantPoisonShots(a,count),undefined);
export const armPoisonSmoke=(slot:number)=>invokeActorItems(slot,(p,a)=>p.armPoisonSmoke(a),undefined);
export const armCluster=(slot:number)=>invokeActorItems(slot,(p,a)=>p.armCluster(a),undefined);
export const applyC4Fuse=()=>invokeItems(p=>p.applyC4Fuse(),undefined);
export function setSuppressPistols(on:boolean):void{invokeItems(p=>p.setSuppressPistols(on),undefined);}
export const readDna=(slot:number,body:Body)=>invokeActorItems(slot,(p,a)=>p.readDna(a,{...body}),undefined);
export const onWeaponFire=(slot:number,weapon:string)=>invokeActorItems(slot,(p,a)=>p.onWeaponFire(a,weapon),undefined);
export const onSmokeDetonate=(slot:number,x:number,y:number,z:number,entityId:number)=>invokeActorItems(slot,(p,a)=>p.onSmokeDetonate(a,x,y,z,entityId),undefined);
export const onSmokeExpired=(entityId:number)=>invokeItems(p=>p.onSmokeExpired(entityId),undefined);
export const onHeDetonate=(slot:number,x:number,y:number,z:number)=>invokeActorItems(slot,(p,a)=>p.onHeDetonate(a,x,y,z),undefined);
export const tickWeaponFx=(dt:number)=>invokeItems(p=>p.tickWeaponFx(dt),undefined);
export const tickDnaTracker=(dt:number)=>invokeItems(p=>p.tickDnaTracker(dt),undefined);
export const hideWeaponFx=()=>invokeItems(p=>p.hideWeaponFx(),undefined);
export const resetWeaponFx=()=>invokeItems(p=>p.resetWeaponFx(),undefined);
