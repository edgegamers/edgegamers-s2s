import type { CommandHandler } from '@s2script/sdk/commands';
import type { Scope } from '@s2script/sdk/plugin';
import type { ObserverDeps, ObserverTarget } from './grant-observer.mjs';
export interface RegistrationDeps<T extends ObserverTarget> extends ObserverDeps<T> {
  command(name: string, handler: CommandHandler): void;
  createScope(): Scope;
  admit(): boolean;
}
export function registerGrantObserver<T extends ObserverTarget>(deps: RegistrationDeps<T>): {
  stop(): void;
  close(): void;
};
