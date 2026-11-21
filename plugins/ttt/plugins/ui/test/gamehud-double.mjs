/** Doubles for the engine-injected GameHud, Hud mask and translations modules. */
export function gameHudDouble(phrases = {}) {
  const log = [];
  let generation = 0;
  const region = (name, born = generation) => ({
    set: (audience, spec) => log.push([name, 'set', audience, JSON.parse(JSON.stringify(spec))]),
    hide: (audience) => log.push([name, 'hide', audience]),
    release: () => log.push([name, 'release']),
    push: (entry, audience) => log.push([name, 'push', audience, JSON.parse(JSON.stringify(entry))]),
    clear: (audience) => log.push([name, 'clear', audience]),
    isValid: () => born === generation,
  });
  const GameHud = {
    rail: () => { if (hudDown) throw new Error('no HUD entity'); log.push(['claim', 'rail']); return region('rail'); }, status: () => region('status'), feed: () => refuseFeed ? null : region('feed'), target: () => region('target'),
    toast: (audience, spec) => log.push(['toast', audience, spec]),
    theme: (audience, theme) => log.push(['theme', audience, theme]),
    drawer: (slot, spec) => panel('drawer', slot, spec),
    sheet: (slot, spec) => panel('sheet', slot, spec),
    prompt: (slot, spec) => panel('prompt', slot, spec),
    summary: (audience, spec) => log.push(['summary', audience, JSON.parse(JSON.stringify(spec))]),
    intro: (slot, spec) => hub('intro', slot, spec),
    spectate: (slot, spec) => hub('spectate', slot, spec),
    weapon: {
      claim: () => { log.push(['weapon', 'claim']); if (weaponHeld === 'other') return false; weaponHeld = true; return true; },
      isClaimed: () => weaponHeld === true,
      release: () => { weaponHeld = false; log.push(['weapon', 'release']); },
      auto: (audience, options) => log.push(['weapon', 'auto', audience, options ?? null]),
      set: (audience, spec) => log.push(['weapon', 'set', audience, spec]),
      hide: (audience) => log.push(['weapon', 'hide', audience]),
    },
  };
  let weaponHeld = false;
  let refuseFeed = false;
  let hudDown = false;
  const hubs = new Map();
  let refuseHub = false;
  const hub = (kind, slot, spec) => {
    if (refuseHub) return null;
    log.push([kind, 'open', slot, JSON.parse(JSON.stringify(spec))]);
    const handle = {
      spec, open: true, isOpen: () => handle.open, kind: () => kind,
      update: (next) => log.push([kind, 'update', slot, JSON.parse(JSON.stringify(next))]),
      close: () => { handle.open = false; log.push([kind, 'close', slot]); },
      follow: (p) => { log.push([kind, 'follow', slot, p]); return true; }, shot: () => true, nextShot: () => true,
    };
    hubs.set(slot, handle);
    return handle;
  };
  const panels = new Map();
  let refusePanel = false;
  const panel = (kind, slot, spec) => {
    if (refusePanel) return null;
    log.push([kind, 'open', slot, JSON.parse(JSON.stringify(spec))]);
    const handle = {
      spec, open: true, isOpen: () => handle.open,
      update: (next) => { handle.last = next; log.push([kind, 'update', slot, JSON.parse(JSON.stringify(next))]); },
      close: () => {
        if (!handle.open) return;
        handle.open = false; log.push([kind, 'close', slot]);
        if (kind === 'prompt') spec.onAnswer?.({ index: null, id: undefined, reason: 'cancelled' }); else spec.onClose?.(false);
      },
      setTab: () => {}, show: () => {}, page: () => {},
    };
    panels.set(`${kind}:${slot}`, handle);
    return handle;
  };
  const commands = [];
  const Clients = { fromSlot: (slot) => ({ slot, isBot: false, command: (c) => { commands.push([slot, c]); return true; }, fakeCommand: (c) => { commands.push([slot, c]); return true; } }) };
  const Chat = { toSlot: (slot, text) => log.push(['chat', slot, text]) };
  const Entity = { findByClass: () => [] };
  const bitsOf = new Map();
  const Hud = {
    hide: (slot, bits) => { log.push(['hud', 'hide', slot, bits]); bitsOf.set(slot, (bitsOf.get(slot) ?? 0) | bits); return bitsOf.get(slot); },
    show: (slot, bits) => { log.push(['hud', 'show', slot, bits]); bitsOf.set(slot, (bitsOf.get(slot) ?? 0) & ~bits); return bitsOf.get(slot); },
    hidden: (slot) => bitsOf.get(slot) ?? 0,
  };
  const Translations = {
    load: () => {},
    translate: (_slot, key, ...args) => (phrases[key] ?? key).replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i) - 1] ?? '')),
  };
  return {
    log,
    bits: bitsOf,
    rebuild: () => { generation++; },
    cs2: { GameHud, HideHud: { RoundTimer: 32, Weapons: 64 } },
    weaponHeldByOther: () => { weaponHeld = 'other'; },
    refuseFeed: (v) => { refuseFeed = v; },
    hudDown: (v) => { hudDown = v; },
    hubs,
    panels,
    refusePanels: (v) => { refusePanel = v; },
    commands,
    refuseHubs: (v) => { refuseHub = v; },
    mods: {
      '@s2script/sdk/hud': { Hud }, '@s2script/sdk/translations': { Translations },
      '@s2script/sdk/clients': { Clients }, '@s2script/sdk/chat': { Chat }, '@s2script/sdk/entity': { Entity },
      '@s2script/sdk/commands': { command: Object.assign(() => {}, { admin: () => {} }) }, '@s2script/sdk/admin': { ADMFLAG: { CONFIG: 1 } },
    },
  };
}
