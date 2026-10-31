import { watchDecluttr } from '../../../../decluttr/src/owner.ts';
import {publish,use} from '@s2script/sdk/plugin';
import {createCommunication} from './communication';
import type {CommunicationMethods} from '../api';
import {loadPhrases} from '../../../packages/contracts/phrases.ts';
let owner:ReturnType<typeof createCommunication>|null=null;
export function OnPluginStart():void {
  watchDecluttr();
  loadPhrases();
  const current=createCommunication(use('@edgegamers/ttt-core'));owner=current;
  const methods:CommunicationMethods={handleChat:current.handleChat,tick:current.tick,reset:current.reset,forget:current.forget,applyServerSettings:current.applyServerSettings};
  publish('@edgegamers/ttt-communication',methods);
}
export function OnPluginEnd():void {const current=owner;owner=null;current?.dispose();}
