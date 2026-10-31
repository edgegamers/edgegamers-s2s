import english from '../translations/jb-logs.phrases.json' with {type:'json'};

/** Optional display data; raw log strings and OnLog events retain their existing meaning. */
export interface LogPresentation {
  key: string;
  args: (string | number)[];
  /** Explicit first-party label arguments; player names and opaque text are never inferred. */
  labels?: number[];
}
export const LOG_PHRASES: Record<string,string> = english;

/** Capture values once and retain the original English projection for server/external sinks. */
export function logEntry(key:string,args:(string|number)[],labels:number[]=[]):[string,LogPresentation] {
  const captured=[...args];
  const message=(LOG_PHRASES[key]??key).replace(/\{(\d+)\}/g,(_tag,n:string)=>String(captured[Number(n)-1]??''));
  return [message,{key,args:captured,labels:[...labels]}];
}
