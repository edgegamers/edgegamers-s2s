import { watchDecluttr } from '../../../../decluttr/src/owner.ts';
/**
 * @edgegamers/jailbreak-specialdays — special days and the speedrun trail (ported from Jailbreak.SpecialDay + Jailbreak.Trail).
 * Wiring only: commands, engine events → the running day, core/warden/zones hookups.
 */
import { command, Entity, HookResult, publish, SDKHook, SDKHookType, use, watchOptional } from "@s2script/sdk";
import type { CommandInvocation, EntityRef, HookResultValue } from "@s2script/sdk";
import { Events, Player } from "@s2script/cs2";
import type { SDInfo, SDType } from "../api";
import { Manager, say } from "./manager.ts";
import { buildMenu } from "./menu.ts";
import { registerPickupGate } from "./pickup.ts";
import { setZoneProvider } from "./zones.ts";
import { parseSDType } from "./sdtype.ts";
import { msg } from "./messages.ts";
import { playerOfPawn } from "./game.ts";

let manager: Manager | null = null;

/** `!sd <day>` and the menu share this path (the C# menu re-ran `css_sd <n>` as the player). */
function tryStart(slot: number, type: SDType): void {
  if (!manager) return;
  if (!manager.canStart(type, slot)) return;
  manager.start(type, slot);
}

function onDamage(info: Parameters<Manager["onTakeDamage"]>[0]): HookResultValue | void {
  if (!manager?.isRunning()) return;
  return manager.onTakeDamage(info, playerOfPawn(info.victim));
}

function hookPawn(ref: EntityRef | null): void {
  SDKHook(ref, SDKHookType.OnTakeDamage, onDamage);
}

export function OnPluginStart(): void {
  watchDecluttr();
  const core = use("@edgegamers/jailbreak-core");
  const handle = publish("@edgegamers/jailbreak-specialdays", {
    isRunning: (): boolean => manager?.isRunning() ?? false,
    getCurrent: (): SDInfo | null => manager?.getCurrent() ?? null,
    roundsSinceLast: (): number => manager?.roundsSinceLast() ?? 0,
  });
  const m = new Manager(core, {
    started: (day) => handle.emit("OnSpecialDayStart", { day }),
    ended: (day) => handle.emit("OnSpecialDayEnd", { day }),
  });
  manager = m;

  core.on("OnRoundStart", () => m.onRoundStart());
  core.on("OnRoundEnd", () => m.end());

  watchOptional("@edgegamers/jailbreak-warden", (warden, scope) => {
    m.warden = warden;
    scope.own({ dispose: () => (m.warden = null) });
  });
  watchOptional("@s2script/zones", (zones, scope) => {
    setZoneProvider(zones);
    scope.own({ dispose: () => setZoneProvider(null) });
  });

  const menu = buildMenu((slot, type) => tryStart(slot, type));
  const sd = (cmd: CommandInvocation): HookResultValue => {
    const slot = cmd.callerSlot;
    const arg = cmd.argString.trim();
    if (arg === "") {
      if (slot < 0) {
        cmd.reply(msg.usage);
        return HookResult.Handled;
      }
      const current = m.getCurrent();
      if (current) say(slot, msg.running(current.name));
      else menu.display(slot, 30);
      return HookResult.Handled;
    }
    const type = parseSDType(arg);
    if (type === null) {
      say(slot, msg.invalid(arg));
      return HookResult.Handled;
    }
    tryStart(slot, type);
    return HookResult.Handled;
  };
  command("sm_sd", sd);
  command("sm_specialday", sd);
  command("sm_startday", sd);

  registerPickupGate();

  // Engine events → the running day.
  Events.onPre("player_death", (ev) => {
    const r = m.running();
    return r?.day.onDeathPre?.(ev, r.ctx) ?? HookResult.Continue;
  });
  Events.on("player_death", (ev) => {
    const r = m.running();
    r?.day.onDeath?.(ev, r.ctx);
  });
  Events.on("player_hurt", (ev) => {
    const r = m.running();
    r?.day.onHurt?.(ev, r.ctx);
  });
  Events.on("player_spawn", (ev) => {
    const r = m.running();
    const p = Player.fromSlot(ev.getPlayerSlot("userid"));
    if (r && p) r.day.onSpawn?.(p, r.ctx);
  });
  Events.on("grenade_thrown", (ev) => {
    const r = m.running();
    const p = Player.fromSlot(ev.getPlayerSlot("userid"));
    if (r && p) r.day.onGrenadeThrown?.(p, r.ctx);
  });
  Events.on("weapon_fire", (ev) => {
    const r = m.running();
    const p = Player.fromSlot(ev.getPlayerSlot("userid"));
    if (r && p) r.day.onWeaponFire?.(p, ev.getString("weapon"), r.ctx);
  });

  for (const pawn of Entity.findByClass("player")) hookPawn(pawn);
}

export function OnEntityCreated(entity: EntityRef | null, className: string): void {
  if (entity && className === "player") hookPawn(entity);
}

export function OnGameFrame(): void {
  const r = manager?.running();
  if (!r) return;
  try {
    r.day.onFrame?.(r.ctx);
  } catch (e) {
    console.log(`[specialdays] ${r.day.type} frame error: ${String(e)}`);
  }
}

export function OnMapStart(): void {
  manager?.end(false);
}

export function OnPluginEnd(): void {
  manager?.end(false);
}
