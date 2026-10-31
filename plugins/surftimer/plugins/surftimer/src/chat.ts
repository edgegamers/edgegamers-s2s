import {Chat,Clients} from '@s2script/sdk';
import {ChatColors} from '@s2script/cs2';
export const C=ChatColors;
export function tell(slot:number,message:string):void{Chat.toSlot(slot,message);}
/** Values are evaluated once; phrase lookup is the only per-recipient work. */
export function tellAll<Args extends unknown[]>(render:(slot:number,...args:Args)=>string,...args:Args):void{
 for(const client of Clients.all())if(client.isValid())Chat.toSlot(client.slot,render(client.slot,...args));
}
export function hl(value:string|number):string{return String(value);}
export function diffColor(_deltaTicks:number,text:string):string{return text;}
