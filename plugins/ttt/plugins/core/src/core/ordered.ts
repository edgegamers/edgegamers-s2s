import {EventBus} from './bus.ts';
import {snapshotBody} from './body-snapshot.ts';
import {applyReply, copyEvent, domainEvent, moduleRegistration, registrationFor, type DomainEvent, type EventKind, type HandlerCall, type HandlerId, type ModuleId, type OrderedFeatureMethods, type OwnerId, type Registration, type SubOptions, type TttEvents} from '../../../../packages/contracts/ordered.ts';

type Entry = {row: Registration; invoke(event: DomainEvent): void};
export interface OrderedCoordinator {
  readonly bus: EventBus<TttEvents>;
  forModule(module: ModuleId): EventBus<TttEvents>;
  attach(owner: OwnerId, provider: OrderedFeatureMethods): {dispose(): void};
  dispatchDomain(event: DomainEvent): DomainEvent;
}

/** Core owns the walk. Local callbacks still execute inside the original EventBus. */
export function createOrderedCoordinator(options: {log(message: string): void}): OrderedCoordinator {
  const entries = new Map<HandlerId, Entry>();
  const modules = new Map<ModuleId, EventBus<TttEvents>>();
  const log = (message: string): void => { try { options.log(message); } catch { /* observers still run */ } };
  function dispatchDomain(event: DomainEvent): DomainEvent {
    const snapshot = [...entries.values()].filter(entry => entry.row.event === event.kind).sort((a,b) =>
      a.row.priority - b.row.priority || a.row.installationOrdinal - b.row.installationOrdinal || a.row.localOrdinal - b.row.localOrdinal);
    for (const entry of snapshot) {
      if (entry.row.ignoreCanceled && 'canceled' in event.payload && event.payload.canceled) continue;
      try { entry.invoke(event); }
      catch (error) { log(`[ttt] WARN: ordered handler ${entry.row.id} failed: ${String(error)}`); }
    }
    return event;
  }
  class ScopedBus extends EventBus<TttEvents> {
    private readonly module: ModuleId | undefined;
    constructor(module?: ModuleId) { super(); this.module = module; }
    override on<K extends EventKind>(kind: K, handler: (event: TttEvents[K]) => void, sub?: SubOptions): void {
      if (!this.module) throw new Error('Register ordered callbacks through forModule');
      const row = moduleRegistration(this.module, kind, sub);
      if (entries.has(row.id)) throw new Error(`Duplicate ordered registration: ${row.id}`);
      const local = new EventBus<TttEvents>();
      local.on(kind, handler);
      entries.set(row.id, {row, invoke: event => { local.emit(kind, event.payload as TttEvents[K]); }});
    }
    override emit<K extends EventKind>(kind: K, payload: TttEvents[K]): TttEvents[K] {
      dispatchDomain(domainEvent(kind, payload));
      return payload;
    }
    override has(kind: EventKind): boolean { return [...entries.values()].some(entry => entry.row.event === kind); }
    override clear(): void {
      for (const [id, entry] of entries) if (!this.module || entry.row.module === this.module) entries.delete(id);
    }
  }
  return {
    bus: new ScopedBus(),
    forModule(module) {
      let bus = modules.get(module);
      if (!bus) { bus = new ScopedBus(module); modules.set(module, bus); }
      return bus;
    },
    dispatchDomain,
    attach(owner, provider) {
      const ids = provider.getHandlers();
      const pending = new Map<HandlerId, Entry>();
      for (const id of ids) {
        const row = registrationFor(id);
        if (row.owner !== owner) throw new Error(`Wrong ordered registration owner: ${id}`);
        if (entries.has(id) || pending.has(id)) throw new Error(`Duplicate ordered registration: ${id}`);
        pending.set(id, {row, invoke: event => {
          const copied = event.kind === 'bodyCreate' || event.kind === 'bodyIdentify'
            ? {...event,payload:{...event.payload,body:snapshotBody(event.payload.body)}}
            : copyEvent(event);
          const call = {...copied, handler: id} as HandlerCall;
          applyReply(event, provider.handleDomain(call));
        }});
      }
      for (const [id, entry] of pending) entries.set(id, entry);
      return {dispose() { for (const [id, entry] of pending) if (entries.get(id) === entry) entries.delete(id); }};
    },
  };
}
