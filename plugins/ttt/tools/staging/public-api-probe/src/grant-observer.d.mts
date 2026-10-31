export interface ObserverTarget { readonly slot: number }
export interface LightSnapshot { readonly key: string; readonly count: number; readonly active: boolean }
export type DetailKey = 'alive' | 'health' | 'weaponCount' | 'activePresent' | 'activeOwned' |
  'isBeingGivenItem' | 'disableAutoDeploy' | 'nextAttack' | 'playerLocked' | 'hideHUD' |
  'deployTick' | 'commandNumber' | 'moveType' | 'flags';
export type DetailSnapshot = Readonly<Partial<Record<DetailKey, boolean | number | null>> & {
  inputButtons?: number | bigint | null;
  inputForward?: number | null;
  inputLeft?: number | null;
}>;
export interface ObserverDeps<T extends ObserverTarget> {
  now(): number;
  acquire(): T | null;
  current(target: T): boolean;
  light(target: T): LightSnapshot;
  detail(target: T): DetailSnapshot;
  emit(value: unknown): void;
}
export interface Observer {
  arm(): boolean;
  frame(): void;
  pickup(slot: number): void;
  stop(): void;
  dispose(): void;
  isArmed(): boolean;
}
export function createObserver<T extends ObserverTarget>(deps: ObserverDeps<T>): Observer;
