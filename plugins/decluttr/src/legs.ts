import { Clients, Cookies, CookieAccess, type Client, type Cookie } from '@s2script/sdk';
import { Player, type Pawn } from '@s2script/cs2';
interface Preference { client: Client; hidden: boolean; pending: boolean; retryAt: number }
interface RenderAssignment { pawn: Pawn; original: number; applied: number }
// A pass reads every player's pawn, which is the plugin's whole per-frame cost. Render is only
// reset around a spawn or a round start, so a pass runs every frame for a short while after one
// of those (or a preference change) and otherwise only as a slow backstop.
const BURST_FRAMES = 16, IDLE_FRAMES = 8;
export function createLegs(enabled: () => boolean) {
  const preferences = new Map<number, Preference>(), renders = new Map<string, RenderAssignment>();
  const active = new Set<string>();
  let cookie: Cookie, burst = BURST_FRAMES, idle = 0;
  function wake(): void { burst = BURST_FRAMES; }
  function join(client: Client): Preference {
    const old = preferences.get(client.slot);
    if (old?.client.isValid()) return old;
    const state = { client, hidden: Cookies.get(client, cookie) !== 'visible', pending: false, retryAt: 0 };
    preferences.set(client.slot, state); wake(); return state;
  }
  function save(state: Preference): void {
    state.pending = !Cookies.set(state.client, cookie, state.hidden ? 'hidden' : 'visible');
    state.retryAt = Date.now() + 1000;
  }
  function release(key: string, assignment: RenderAssignment): void {
    if (assignment.pawn.isValid && assignment.pawn.render === assignment.applied) assignment.pawn.render = assignment.original;
    renders.delete(key);
  }
  function reset(): void { for (const [key, assignment] of renders) release(key, assignment); }
  function update(): void {
    active.clear();
    for (const [slot, state] of preferences) {
      if (!state.client.isValid()) { preferences.delete(slot); continue; }
      if (state.pending && Date.now() >= state.retryAt) save(state);
      const pawn = Player.fromSlot(slot)?.pawn;
      if (!enabled() || !state.hidden || !pawn?.isValid) continue;
      const key = `${pawn.ref.index}:${pawn.ref.id}`; active.add(key);
      // Alpha 254 hides one's first-person legs. Preserve other owners' transparency.
      // Spawn/round setup can reset render on the same pawn, even after we applied it.
      const before = pawn.render;
      if (before === null || before >>> 24 !== 255) continue;
      const applied = ((before & 0x00ffffff) | 0xfe000000) >>> 0;
      pawn.render = applied;
      if (pawn.render === applied) renders.set(key, { pawn, original: before, applied });
    }
    for (const [key, assignment] of renders) if (!active.has(key)) release(key, assignment);
  }
  return {
    start() {
      cookie = Cookies.register('decluttr_legs', { access: CookieAccess.Private, default: '', description: 'First-person legs: hidden or visible' });
      for (const client of Clients.all()) if (client.isValid()) join(client);
    },
    join,
    cached(client: Client) {
      if (!client.isValid() || client.isBot || !Cookies.areCached(client)) return;
      const state = join(client);
      if (!state.pending) state.hidden = Cookies.get(client, cookie) !== 'visible';
      wake();
    },
    toggle(client: Client): boolean {
      const state = join(client); state.hidden = !state.hidden;
      if (!client.isBot) save(state);
      update(); return state.hidden;
    },
    pending(slot: number) { return preferences.get(slot)?.pending ?? false; },
    wake,
    /** Once per frame: a pass when one is due, nothing otherwise. */
    tick(): void {
      if (burst > 0) { burst--; idle = 0; update(); }
      else if (++idle >= IDLE_FRAMES) { idle = 0; update(); }
    },
    update, reset,
    dispose() { reset(); preferences.clear(); },
  };
}
