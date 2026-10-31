/**
 * `@s2script/sdk/translations` for plugin fixtures: forwards each lookup to the fixture's own
 * formatter, so existing message assertions and interception keep working. Real phrase rendering
 * is covered separately against `translations/ttt.phrases.json` (phrases.test.ts).
 */
export function translationsVia(format) {
  return { Translations: { load() {}, setDefaultLanguage() {}, translate: (slot, key, ...args) => format(slot, key, args) } };
}
/** The chat colour table the shared formatter needs from `@s2script/cs2`. */
export const ChatColors = new Proxy({}, { get: () => '' });

/** Engine boundary for owners that now load and render their own native phrase set. */
export function seededTranslations(language = () => '', locales = {}) {
  const sets = new Map();
  return { Translations: {
    load(name, seed) { sets.set(name, seed); },
    translate(slot, key, ...args) {
      for (const [name, seed] of sets) {
        const text = locales[language(slot)]?.[name]?.[key] ?? seed[key];
        if (text !== undefined) return text.replace(/\{(\d+)\}/g, (_, n) => String(args[Number(n)-1] ?? '').replace(/[{}]/g, ''));
      }
      return key;
    },
  } };
}
