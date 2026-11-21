/**
 * The TTT spectate hub and intro on the GameHud.
 *
 * A player who has not joined yet gets the intro (Play or Spectate). Anyone else who is not alive
 * gets the spectate hub: a picker of the living players and camera cuts between them. Core decides
 * who gets a hub and what they may see; this only paints it and sends each player what changed.
 *
 * Play sends the player's own `jointeam`, so Core's team rules still decide whether it lands. The
 * stock team menu is switched off only once a hub has actually opened, so a server that refuses the
 * surface keeps the normal way in and gets one chat line instead.
 */
import { GameHud } from '@s2script/cs2';
import type { GameHudHubItem, GameHudIntro, GameHudShot, GameHudSpectate, GameHudSpectatePlayer, GameHudSpectateSpec } from '@s2script/cs2';
import { Chat } from '@s2script/sdk/chat';
import { Clients } from '@s2script/sdk/clients';
import { Entity } from '@s2script/sdk/entity';
import { Server } from '@s2script/sdk/server';
import { chatPhraseFor, hudPhraseFor } from '../../../packages/contracts/phrases.ts';
import type { UiActor, UiHub, UiHubPlayer, UiHubRow } from '../api';
import { IntroCamera } from './introcam';

const TEAM_T = 2;
const TEAM_SPECTATOR = 1;
const SHOT_SECONDS = 8;
type Vec3 = { x: number; y: number; z: number };

interface Open {
  kind: 'intro' | 'spectate';
  handle: GameHudIntro | GameHudSpectate;
  /** The last spec sent, without callbacks, to send only real changes. */
  key: string;
  shotsKey: string;
  watching: string | null;
}

export class SpectateHub {
  private readonly open = new Map<number, Open>();
  /** The orbit over the spawns behind the intro. Ticked every frame by the plugin. */
  readonly camera = new IntroCamera();
  /** Players who chose Spectate on the intro this connection. */
  private readonly skippedIntro = new Set<number>();
  private readonly told = new Set<number>();
  private overview: GameHudShot[] | null = null;
  private menuOff = false;
  private warned = false;
  private readonly log = (line: string): void => console.log(`[ttt/ui] ${line}`);

  paint(rows: readonly UiHubRow[]): void {
    const seen = new Set<number>();
    for (const row of rows) {
      const slot = row.actor.slot;
      seen.add(slot);
      try { this.paintOne(slot, row.hub); }
      catch (error) { if (!this.warned) { this.warned = true; this.log(`hub paint failed: ${String(error)}`); } }
    }
    for (const slot of [...this.open.keys()]) if (!seen.has(slot)) this.closeSlot(slot);
  }

  private paintOne(slot: number, hub: UiHub): void {
    // Core stopped holding the intro: a later sm_intro may show it again.
    if (!hub.intro) this.skippedIntro.delete(slot);
    // Chosen, and Core has not caught up yet: show nothing for that moment rather than a spectate hub
    // to a player who may be alive.
    if (hub.intro && this.skippedIntro.has(slot)) { this.closeSlot(slot); return; }
    const kind = hub.intro ? 'intro' : 'spectate';
    const current = this.open.get(slot);
    if (current !== undefined && (current.kind !== kind || !current.handle.isOpen())) this.closeSlot(slot);

    const base = this.base(slot, hub, kind);
    const shots = kind === 'spectate' ? this.shots(slot, hub.players) : [];
    const players = kind === 'spectate' ? hub.players.slice(0, 12).map((p) => this.player(slot, p)) : [];
    const watching = this.open.get(slot)?.watching ?? null;
    const card = kind === 'spectate' ? this.card(slot, hub.players, watching) : null;
    const key = JSON.stringify({ ...base, players, card });
    const shotsKey = JSON.stringify(shots);

    const existing = this.open.get(slot);
    if (existing !== undefined) {
      if (existing.key === key && existing.shotsKey === shotsKey) return;
      if (existing.kind === 'spectate') {
        const spec: GameHudSpectateSpec = { ...base, players, card };
        // A new shot list restarts the cuts; a refresh alone must not.
        (existing.handle as GameHudSpectate).update(existing.shotsKey === shotsKey ? spec : { ...spec, shots, shotSeconds: SHOT_SECONDS });
      } else {
        existing.handle.update(base);
      }
      existing.key = key;
      existing.shotsKey = shotsKey;
      return;
    }

    const handle = kind === 'intro'
      ? GameHud.intro(slot, { ...base, onSelect: (item) => this.select(slot, item), onClose: () => this.skip(slot) })
      : GameHud.spectate(slot, {
        ...base, players, card, shots, shotSeconds: SHOT_SECONDS, cursor: false,
        onSelect: (item) => this.select(slot, item),
        onPick: (player) => this.watch(slot, player),
        onShot: (shot) => { if (shot.kind === 'follow') this.watch(slot, { slot: shot.target }); },
      });
    if (handle === null) {
      // Another plugin holds this player's hub, or the server refused the surface.
      if (!this.told.has(slot)) { this.told.add(slot); Chat.toSlot(slot, chatPhraseFor(slot, 'ttt.hub.unavailable')); }
      return;
    }
    this.open.set(slot, { kind, handle, key, shotsKey, watching: null });
    if (kind === 'intro') this.camera.start(slot);
    this.disableTeamMenu();
  }

  private base(slot: number, hub: UiHub, kind: 'intro' | 'spectate') {
    const sub = hub.phase === 'countdown' ? hudPhraseFor(slot, 'ttt.hud.sub_countdown', hub.round)
      : hub.phase === 'live' ? hudPhraseFor(slot, 'ttt.hub.sub_live', hub.round)
      : hub.phase === 'finished' ? hudPhraseFor(slot, 'ttt.hud.sub_finished')
      : hudPhraseFor(slot, 'ttt.hub.sub_waiting');
    const items: GameHudHubItem[] = [];
    if (hub.canJoin) {
      items.push({
        id: 'play', label: hudPhraseFor(slot, 'ttt.hub.play'),
        meta: hub.phase === 'live' ? hudPhraseFor(slot, 'ttt.hub.play_next') : undefined, tone: 'green',
      });
    }
    if (kind === 'intro') items.push({ id: 'spectate', label: hudPhraseFor(slot, 'ttt.hub.spectate') });
    // The rules plugin's own command, run as the player: nothing here depends on that plugin.
    items.push({ id: 'rules', label: hudPhraseFor(slot, 'ttt.hub.rules') });
    return {
      eyebrow: hudPhraseFor(slot, 'ttt.hub.eyebrow'),
      title: hudPhraseFor(slot, 'ttt.hub.title'),
      sub,
      listRight: kind === 'spectate' ? hudPhraseFor(slot, 'ttt.hub.alive', hub.players.length) : undefined,
      items,
      footer: kind === 'spectate' && !hub.canJoin ? hudPhraseFor(slot, 'ttt.hud.hint_dead') : undefined,
      closeable: kind === 'intro',
    };
  }

  private player(slot: number, p: UiHubPlayer): GameHudSpectatePlayer {
    return {
      slot: p.slot,
      name: p.name,
      sub: hudPhraseFor(slot, 'ttt.hub.health', Math.max(0, Math.round(p.health))),
      tone: p.detective ? 'darkblue' : 'grey',
    };
  }

  private card(slot: number, players: readonly UiHubPlayer[], watching: string | null) {
    const target = players.find((p) => String(p.slot) === watching);
    if (target === undefined) return null;
    return {
      heading: hudPhraseFor(slot, 'ttt.hub.watching'),
      name: target.name,
      fields: [{ key: hudPhraseFor(slot, 'ttt.hud.bar_health'), value: Math.max(0, Math.round(target.health)) }],
    };
  }

  /** Cuts between the living, with an overview of each spawn when the map has them. */
  private shots(slot: number, players: readonly UiHubPlayer[]): GameHudShot[] {
    const follow: GameHudShot[] = players.map((p, i) => ({
      id: `p${p.slot}`, kind: 'follow', target: p.slot, mode: i % 2 === 0 ? 'eye' : 'chase', label: p.name,
    }));
    const overview = this.overviewShots().map((s) => ({ ...s, label: hudPhraseFor(slot, 'ttt.hub.overview') }));
    if (follow.length === 0) return overview;
    // One overview after every few players keeps the cuts moving without losing the action.
    const out: GameHudShot[] = [];
    let o = 0;
    follow.forEach((shot, i) => {
      out.push(shot);
      if (i % 3 === 2 && o < overview.length) out.push(overview[o++]!);
    });
    return out;
  }

  private overviewShots(): GameHudShot[] {
    if (this.overview !== null) return this.overview;
    try {
      const origins = (cls: string): Vec3[] => Entity.findByClass(cls).flatMap((ref) => (ref.origin ? [{ x: ref.origin.x, y: ref.origin.y, z: ref.origin.z }] : []));
      this.overview = shotsFromSpawns([origins('info_player_terrorist'), origins('info_player_counterterrorist')])
        .map((s, i) => ({ id: `overview${i}`, kind: 'fixed', position: s.position, angles: s.angles }));
    } catch {
      this.overview = [];
    }
    return this.overview;
  }

  private select(slot: number, item: GameHudHubItem): void {
    if (item.id === 'spectate') { this.skip(slot); return; }
    if (item.id === 'rules') { this.run(slot, 'sm_rules'); return; }
    if (item.id !== 'play') return;
    this.endIntro(slot);
    if (!this.run(slot, `jointeam ${TEAM_T}`)) Chat.toSlot(slot, chatPhraseFor(slot, 'ttt.hub.join_failed'));
  }

  /** Tell Core the player chose, so it stops holding the intro. Hidden here until Core's next model agrees. */
  private endIntro(slot: number): void {
    this.skippedIntro.add(slot);
    this.camera.stop(slot);
    this.run(slot, 'ttt_intro_done');
  }

  /** Run a command from the player's own console, not a server-side fake: the server refuses `jointeam` from that. */
  private run(slot: number, line: string): boolean {
    const client = Clients.fromSlot(slot);
    return client === null ? false : client.isBot ? client.fakeCommand(line) : client.command(line);
  }

  /** Spectate, or closing the intro: a real team choice, so Core stops holding the intro and leaves them spectating. */
  private skip(slot: number): void {
    if (this.skippedIntro.has(slot)) { this.closeSlot(slot); return; }
    this.endIntro(slot);
    this.run(slot, `jointeam ${TEAM_SPECTATOR}`);
    // The next paint swaps the intro for the spectate hub.
    this.closeSlot(slot);
  }

  private watch(slot: number, player: { slot: number }): void {
    const open = this.open.get(slot);
    if (open === undefined) return;
    open.watching = String(player.slot);
    // Force the next paint to send the card.
    open.key = '';
  }

  private disableTeamMenu(): void {
    if (this.menuOff) return;
    this.menuOff = true;
    Server.command('sv_disable_teamselect_menu 1');
  }

  private closeSlot(slot: number): void {
    this.camera.stop(slot);
    const open = this.open.get(slot);
    this.open.delete(slot);
    if (open?.handle.isOpen()) open.handle.close();
  }

  hide(actor: UiActor): void { this.closeSlot(actor.slot); }

  forget(actor: UiActor): void {
    this.closeSlot(actor.slot);
    this.skippedIntro.delete(actor.slot);
    this.told.delete(actor.slot);
  }

  hideAll(): void {
    for (const slot of [...this.open.keys()]) this.closeSlot(slot);
    // A new map has new spawns.
    this.overview = null;
    this.camera.reset();
  }

  dispose(): void {
    this.hideAll();
    this.skippedIntro.clear();
    this.told.clear();
    this.camera.clear();
    if (this.menuOff) { this.menuOff = false; Server.command('sv_disable_teamselect_menu 0'); }
  }
}

function mean(points: readonly Vec3[]): Vec3 {
  let x = 0, y = 0, z = 0;
  for (const p of points) { x += p.x; y += p.y; z += p.z; }
  return { x: x / points.length, y: y / points.length, z: z / points.length };
}

/**
 * One raised shot over each team's spawn, pulled back from the map centre and looking across it.
 * Exported for tests.
 */
export function shotsFromSpawns(groups: readonly (readonly Vec3[])[], height = 192, pullBack = 192): { position: Vec3; angles: { pitch: number; yaw: number } }[] {
  const centres = groups.filter((g) => g.length > 0).map(mean);
  if (centres.length === 0) return [];
  const middle = mean(centres);
  return centres.map((c) => {
    const dx = c.x - middle.x, dy = c.y - middle.y;
    const len = Math.hypot(dx, dy);
    const position = len > 1
      ? { x: c.x + (dx / len) * pullBack, y: c.y + (dy / len) * pullBack, z: c.z + height }
      : { x: c.x, y: c.y, z: c.z + height };
    const to = centres.length > 1 ? middle : { x: c.x + 400, y: c.y, z: c.z };
    const tx = to.x - position.x, ty = to.y - position.y, tz = to.z - position.z;
    return {
      position,
      angles: { pitch: (-Math.atan2(tz, Math.hypot(tx, ty)) * 180) / Math.PI, yaw: (Math.atan2(ty, tx) * 180) / Math.PI },
    };
  });
}
