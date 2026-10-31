import type {BodyView} from '../../../bodies/api.d.ts';

// This registry must stay independent of engine and owner modules: ordered dispatch is pure.
const snapshots=new WeakMap<BodyView,()=>BodyView>();
export function registerBodySnapshot(body:BodyView,read:()=>BodyView):void{snapshots.set(body,read);}
/** One invocation-local wire copy, never cached across observers or owner calls. */
export function snapshotBody(body:BodyView):BodyView{return snapshots.get(body)?.()??{...body};}
