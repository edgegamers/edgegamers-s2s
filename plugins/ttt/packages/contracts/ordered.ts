import type {DomainBus, DomainEvent, EventKind, HandlerCall, HandlerId, HandlerReply, OrderedFeatureMethods, SubOptions, TttEvents} from './ordered-types.ts';
import {REGISTRATIONS, type ModuleId, type Registration} from './ordered-plan.ts';
export type * from './ordered-types.ts';
export type {ModuleId, OwnerId, Registration} from './ordered-plan.ts';
export {REGISTRATIONS} from './ordered-plan.ts';

export function registrationFor(id: string): Registration {
  const row = REGISTRATIONS.find(row => row.id === id);
  if (!row) throw new Error(`Unknown ordered registration: ${id}`);
  return row;
}
export function moduleRegistration(module: ModuleId, kind: EventKind, options?: SubOptions): Registration {
  const row = registrationFor(`${module}.${kind}`);
  if ((options?.priority ?? 60) !== row.priority || (options?.ignoreCanceled ?? false) !== row.ignoreCanceled) {
    throw new Error(`Changed ordered registration priority/options: ${row.id}`);
  }
  return row;
}
export function domainEvent<K extends EventKind>(kind: K, payload: TttEvents[K]): DomainEvent {
  return {kind, payload} as DomainEvent;
}
/** EntityRef stays a supported framework value; body and event DTOs are independently mutable. */
export function copyEvent(event: DomainEvent): DomainEvent {
  if (event.kind === 'bodyCreate' || event.kind === 'bodyIdentify') {
    return {...event, payload: {...event.payload, body: {...event.payload.body}}} as DomainEvent;
  }
  return {...event, payload: {...event.payload}} as DomainEvent;
}
export function eventReply(event: DomainEvent, threw: boolean): HandlerReply {
  switch (event.kind) {
    case 'gameState': return {kind: event.kind, threw, canceled: event.payload.canceled};
    case 'roleAssigning': return {kind: event.kind, threw, role: event.payload.role, canceled: event.payload.canceled};
    case 'damage': return {kind: event.kind, threw, damage: event.payload.damage, canceled: event.payload.canceled};
    case 'bodyCreate': return {kind: event.kind, threw, dnaSuppressed: event.payload.body.dnaSuppressed, canceled: event.payload.canceled};
    case 'bodyIdentify': return {kind: event.kind, threw, canceled: event.payload.canceled};
    case 'karma': return {kind: event.kind, threw, karma: event.payload.karma, canceled: event.payload.canceled};
    case 'balance': return {kind: event.kind, threw, newBalance: event.payload.newBalance, canceled: event.payload.canceled};
    case 'purchase': return {kind: event.kind, threw, canceled: event.payload.canceled};
    case 'join': case 'leave': case 'death': case 'roleAssigned': return {kind: event.kind, threw};
    case 'specialRound': throw new Error('specialRound has no registered handlers');
  }
}
/** Apply only existing mutable fields, preserving the original event/body object identity. */
export function applyReply(event: DomainEvent, reply: HandlerReply): void {
  if (event.kind !== reply.kind) throw new Error(`Wrong ordered reply kind: ${reply.kind}`);
  if ('canceled' in event.payload && 'canceled' in reply) event.payload.canceled = reply.canceled;
  if (event.kind === 'roleAssigning' && reply.kind === 'roleAssigning') event.payload.role = reply.role;
  if (event.kind === 'damage' && reply.kind === 'damage') event.payload.damage = reply.damage;
  if (event.kind === 'bodyCreate' && reply.kind === 'bodyCreate') event.payload.body.dnaSuppressed = reply.dnaSuppressed;
  if (event.kind === 'karma' && reply.kind === 'karma') event.payload.karma = reply.karma;
  if (event.kind === 'balance' && reply.kind === 'balance') event.payload.newBalance = reply.newBalance;
}
export interface AdapterOptions {
  emit(event: DomainEvent): DomainEvent;
  /** Core-wide presence query, when needed; omitting it conservatively builds all payloads. */
  has?(kind: EventKind): boolean;
  log(message: string): void;
}
export interface FeatureAdapter extends OrderedFeatureMethods { readonly bus: DomainBus; }

/** Factory only: all mutable registrations belong to this feature instance. */
export function createFeatureAdapter(module: ModuleId, options: AdapterOptions): FeatureAdapter {
  const callbacks = new Map<HandlerId, (event: DomainEvent) => void>();
  const bus: DomainBus = {
    on<K extends EventKind>(kind: K, handler: (event: TttEvents[K]) => void, sub?: SubOptions): void {
      const row = moduleRegistration(module, kind, sub);
      if (callbacks.has(row.id)) throw new Error(`Duplicate ordered registration: ${row.id}`);
      callbacks.set(row.id, event => handler(event.payload as TttEvents[K]));
    },
    emit<K extends EventKind>(kind: K, payload: TttEvents[K]): TttEvents[K] {
      const event = domainEvent(kind, payload);
      const result = options.emit(copyEvent(event));
      if (result.kind !== kind) throw new Error(`Wrong domain dispatch result: ${result.kind}`);
      if (result.kind !== 'specialRound') applyReply(event, eventReply(result, false));
      return payload;
    },
    has: kind => options.has?.(kind) ?? true,
    clear: () => callbacks.clear(),
  };
  return {
    bus,
    getHandlers: () => REGISTRATIONS.filter(row => callbacks.has(row.id)).map(row => row.id),
    handleDomain(call): HandlerReply {
      const row = registrationFor(call.handler);
      const callback = callbacks.get(call.handler);
      if (row.module !== module || row.event !== call.kind || !callback) throw new Error(`Invalid ordered handler: ${call.handler}`);
      const event = copyEvent(call);
      let threw = false;
      try { callback(event); }
      catch (error) {
        threw = true;
        // Logging must not discard a mutation which the old bus retained after a throw.
        try { options.log(`[ttt] WARN: ordered handler ${row.id} threw: ${String(error)}`); } catch { /* retain patch */ }
      }
      return eventReply(event, threw);
    },
  };
}
