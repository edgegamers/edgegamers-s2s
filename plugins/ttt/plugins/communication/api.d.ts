/** Copied Core observations. Communication owns no registry or round state. */
export interface CommunicationPlayer {
  slot: number; steamId: string; generation: number; name: string;
  role: number; alive: boolean; participating: boolean;
}
export interface CommunicationSnapshot { state: number; epoch: number; players: CommunicationPlayer[]; }
export type CommunicationPhrase = 'DEAD_CHAT_FORMAT' | 'TRAITOR_CHAT_FORMAT' | 'DEAD_MUTE_REMINDER';
export interface CommunicationCoreMethods {
  /** Skip-only logical-life hint; native snapshots remain required for effects and chat. */
  hasCommunicationDeadPlayers(): boolean;
  /**
   * Skip-only change hint built from Core's registry alone: round epoch, game state, and each
   * logically dead player's slot/generation/SteamID. Unchanged keys allow skipping a re-check;
   * native snapshots remain required for effects and chat.
   */
  getCommunicationKey(): string;
  getCommunicationSnapshot(): CommunicationSnapshot;
  formatCommunication(slot: number, key: CommunicationPhrase, args: (string | number)[]): string;
}
export interface CommunicationMethods {
  /** Optional wire flag: 0/public (default), 1/team. Numeric for SDK optional-boolean compatibility. */
  handleChat(slot: number, text: string, teamOnly?: number): 0 | 2;
  tick(): void;
  reset(): void;
  forget(slot: number): void;
  applyServerSettings(): void;
}
export interface Contract { methods: CommunicationMethods; forwards: {}; }
