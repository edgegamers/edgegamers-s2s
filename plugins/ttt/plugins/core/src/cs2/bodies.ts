/** Compatibility reads delegate to the sole Bodies owner; Core owns no corpse store. */
export {allBodies,bodyByEntity,bodyOfPlayer,spawnBody,killBodyEntity,settleBody,tintBody,clearBodies,isCurrentBody} from '../core/body-provider';
export type {Body} from '../core/body-provider';
import type {PrecacheContext} from '@s2script/sdk/sound';
/** Existing no-op: stock role models are already precached by World. */
export function precacheBodyModels(pc:PrecacheContext):void{void pc;}
