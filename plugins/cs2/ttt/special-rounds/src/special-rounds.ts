import type { TttSpecialRoundDefinition, TttSpecialRoundsApi } from "../api.d.ts";

export interface SpecialRoundsOptions {
  availablePlugins: ReadonlySet<string>;
  random?: () => number;
}

export function createSpecialRoundsApi(options: SpecialRoundsOptions): TttSpecialRoundsApi {
  const rounds = new Map<string, TttSpecialRoundDefinition>();
  const active: string[] = [];
  const random = options.random ?? Math.random;

  function canStart(round: TttSpecialRoundDefinition): boolean {
    if (!round.enabled || active.includes(round.id)) return false;
    if (round.requiresPlugins?.some((name) => !options.availablePlugins.has(name)) === true) return false;
    if (round.canStart?.() === false) return false;

    return active.every((id) => {
      const other = rounds.get(id);
      return round.conflicts?.includes(id) !== true && other?.conflicts?.includes(round.id) !== true;
    });
  }

  function pickRound(): TttSpecialRoundDefinition | undefined {
    const candidates = [...rounds.values()].filter((round) => canStart(round) && round.weight > 0);
    const totalWeight = candidates.reduce((total, round) => total + round.weight, 0);
    let target = random() * totalWeight;

    for (const round of candidates) {
      target -= round.weight;
      if (target < 0) return round;
    }

    return candidates[candidates.length - 1];
  }

  function start(round: TttSpecialRoundDefinition): void {
    active.push(round.id);
    try {
      round.apply();
    } catch (error) {
      active.pop();
      throw error;
    }
  }

  return {
    registerRound(round) {
      if (rounds.has(round.id)) throw new Error(`duplicate special round: ${round.id}`);
      rounds.set(round.id, round);
    },
    roundIds: () => [...rounds.keys()],
    activeRounds: () => [...active],
    isActive: (id) => active.includes(id),
    startRounds(ids) {
      const requested = ids === undefined ? [pickRound()?.id] : ids;
      const started: string[] = [];

      for (const id of requested) {
        if (id === undefined) continue;
        const round = rounds.get(id);
        if (round === undefined || !canStart(round)) continue;
        start(round);
        started.push(id);
      }

      return started;
    },
    clearRounds() {
      for (const id of active) {
        try {
          rounds.get(id)?.clear?.();
        } catch {
          // Continue clearing every active round even when one cleanup fails.
        }
      }
      active.length = 0;
    },
  };
}
