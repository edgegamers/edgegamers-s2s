/** Doubles for the engine-injected GameHud, Hud mask and translations modules. */
export function gameHudDouble(phrases = {}) {
  const log = [];
  let generation = 0;
  const region = (name, born = generation) => ({
    set: (audience, spec) => log.push([name, 'set', audience, JSON.parse(JSON.stringify(spec))]),
    hide: (audience) => log.push([name, 'hide', audience]),
    release: () => log.push([name, 'release']),
    isValid: () => born === generation,
  });
  const GameHud = {
    rail: () => { log.push(['claim', 'rail']); return region('rail'); }, status: () => region('status'), feed: () => region('feed'),
    toast: (audience, spec) => log.push(['toast', audience, spec]),
    theme: (audience, theme) => log.push(['theme', audience, theme]),
  };
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
    cs2: { GameHud, HideHud: { RoundTimer: 32 } },
    mods: { '@s2script/sdk/hud': { Hud }, '@s2script/sdk/translations': { Translations } },
  };
}
