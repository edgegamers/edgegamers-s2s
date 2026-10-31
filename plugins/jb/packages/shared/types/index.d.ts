/**
 * @edgegamers/jailbreak-shared — build-time helpers bundled into each Jailbreak plugin.
 *
 * Nothing here holds state: every plugin gets its own copy of this code, so anything that must be
 * shared at runtime belongs in a plugin's published contract instead.
 */
export * from "./teams";
export * from "./color";
export * from "./chat";
export * from "./phrases";
export * from "./time";
export * from "./players";
export * from "./steam";
export { logEntry, LOG_PHRASES } from "./logs";
export type { LogPresentation } from "./logs";
