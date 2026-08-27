import type {
  TttSpecialRoundClearFailure,
  TttSpecialRoundDefinition,
  TttSpecialRoundForwards,
  TttSpecialRoundsApi,
  TttSpecialRoundStartResult,
  TttSpecialRoundUpdate,
} from "../api.d.ts";

export interface LocalSpecialRoundDefinition extends TttSpecialRoundDefinition {
  canStart?(): boolean;
  apply?(): void;
  clear?(): void;
  tick?(dt: number): void;
}

export interface SpecialRoundsRuntime extends TttSpecialRoundsApi {
  registerLocalRound(round: LocalSpecialRoundDefinition): void;
}

export interface SpecialRoundsOptions {
  availablePlugins: ReadonlySet<string>;
  random?: () => number;
  onRoundStarted?(id: string): void;
  onError?(id: string, error: string): void;
  emitForward?<K extends keyof TttSpecialRoundForwards>(
    event: K,
    payload: TttSpecialRoundForwards[K],
  ): void;
}

interface RegisteredRound {
  descriptor: TttSpecialRoundDefinition;
  local: Pick<LocalSpecialRoundDefinition, "canStart" | "apply" | "clear" | "tick">;
}

function cloneDescriptor(round: TttSpecialRoundDefinition): TttSpecialRoundDefinition {
  const descriptor: TttSpecialRoundDefinition = {
    id: round.id,
    name: round.name,
    description: round.description,
    enabled: round.enabled,
    weight: round.weight,
  };
  if (round.conflicts !== undefined) descriptor.conflicts = [...round.conflicts];
  if (round.requiresPlugins !== undefined) descriptor.requiresPlugins = [...round.requiresPlugins];
  if (round.available !== undefined) descriptor.available = round.available;
  if (round.unavailableReason !== undefined) descriptor.unavailableReason = round.unavailableReason;
  return descriptor;
}

export function createSpecialRoundsApi(options: SpecialRoundsOptions): SpecialRoundsRuntime {
  const rounds = new Map<string, RegisteredRound>();
  const active: string[] = [];
  const availablePlugins = new Set(options.availablePlugins);
  const random = options.random ?? Math.random;

  function report(id: string, error: unknown): string {
    const message = String(error);
    options.onError?.(id, message);
    return message;
  }

  function register(
    descriptor: TttSpecialRoundDefinition,
    local: RegisteredRound["local"] = {},
  ): void {
    if (rounds.has(descriptor.id)) throw new Error(`duplicate special round: ${descriptor.id}`);
    rounds.set(descriptor.id, { descriptor: cloneDescriptor(descriptor), local });
  }

  function refusal(id: string): TttSpecialRoundStartResult {
    const registered = rounds.get(id);
    if (registered === undefined) return { id, started: false, reason: "unknown", details: [] };
    const round = registered.descriptor;
    if (!round.enabled) return { id, started: false, reason: "disabled", details: [] };
    if (active.includes(id)) return { id, started: false, reason: "already_active", details: [] };

    const missing = round.requiresPlugins?.filter((name) => !availablePlugins.has(name)) ?? [];
    if (missing.length > 0) {
      return { id, started: false, reason: "missing_dependency", details: missing };
    }

    const conflicts = active.filter((activeId) => {
      const other = rounds.get(activeId)?.descriptor;
      return round.conflicts?.includes(activeId) === true || other?.conflicts?.includes(id) === true;
    });
    if (conflicts.length > 0) {
      return { id, started: false, reason: "conflict", details: conflicts };
    }

    if (round.available === false) {
      const details = round.unavailableReason === undefined ? [] : [round.unavailableReason];
      return { id, started: false, reason: "unavailable", details };
    }
    try {
      if (registered.local.canStart?.() === false) {
        return { id, started: false, reason: "unavailable", details: [] };
      }
    } catch (error) {
      return { id, started: false, reason: "unavailable", details: [report(id, error)] };
    }

    return { id, started: false, reason: "", details: [] };
  }

  function pickRound(): string | undefined {
    const candidates = [...rounds.values()].filter(({ descriptor }) =>
      refusal(descriptor.id).reason === ""
      && Number.isFinite(descriptor.weight)
      && descriptor.weight > 0
    );
    const totalWeight = candidates.reduce((total, round) => total + round.descriptor.weight, 0);
    let target = random() * totalWeight;

    for (const round of candidates) {
      target -= round.descriptor.weight;
      if (target < 0) return round.descriptor.id;
    }

    return candidates[candidates.length - 1]?.descriptor.id;
  }

  const api: SpecialRoundsRuntime = {
    registerRound(round) {
      register(round);
    },
    registerLocalRound(round) {
      register(round, {
        canStart: round.canStart,
        apply: round.apply,
        clear: round.clear,
        tick: round.tick,
      });
    },
    updateRound(id, update: TttSpecialRoundUpdate) {
      const registered = rounds.get(id);
      if (registered === undefined) return false;
      registered.descriptor = cloneDescriptor({ ...registered.descriptor, ...update, id });
      return true;
    },
    roundIds: () => [...rounds.keys()],
    activeRounds: () => [...active],
    isActive: (id) => active.includes(id),
    availablePlugins: () => [...availablePlugins].sort(),
    setPluginAvailable(id, available) {
      if (available) availablePlugins.add(id);
      else availablePlugins.delete(id);
    },
    startRound(id) {
      const status = refusal(id);
      if (status.reason !== "") return status;
      const registered = rounds.get(id)!;
      active.push(id);
      try {
        registered.local.apply?.();
      } catch (error) {
        active.pop();
        return { id, started: false, reason: "unavailable", details: [report(id, error)] };
      }
      options.onRoundStarted?.(id);
      options.emitForward?.("roundStarted", { id });
      return { id, started: true, reason: "", details: [] };
    },
    startRounds(ids) {
      const requested = ids === undefined ? [pickRound()] : ids;
      const started: string[] = [];
      for (const id of requested) {
        if (id === undefined) continue;
        if (api.startRound(id).started) started.push(id);
      }
      return started;
    },
    tickActiveRounds(dt) {
      const elapsed = Number.isFinite(dt) && dt >= 0 ? dt : 0;
      for (const id of [...active]) {
        try {
          rounds.get(id)?.local.tick?.(elapsed);
        } catch (error) {
          report(id, error);
        }
        options.emitForward?.("roundTick", { id, dt: elapsed });
      }
    },
    clearRounds(reason = "manual") {
      const cleared = [...active];
      const failures: TttSpecialRoundClearFailure[] = [];
      active.length = 0;
      for (const id of cleared) {
        try {
          rounds.get(id)?.local.clear?.();
        } catch (error) {
          failures.push({ id, error: report(id, error) });
        }
        options.emitForward?.("roundCleared", { id, reason });
      }
      return { cleared, failures };
    },
  };

  return api;
}
