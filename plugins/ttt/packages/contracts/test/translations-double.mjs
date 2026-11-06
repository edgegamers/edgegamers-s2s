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
