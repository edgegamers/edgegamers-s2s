import type { Notification } from '@s2script/sdk/interfaces';

/** Owner-facing policy. All arguments and results are copied by the host. */
export interface DecluttrMethods {
  /** True means accepted. Rejection sends the configured sender/staff notices. */
  checkChat(slot: number, text: string): boolean;
  /** Format/relay ordinary chat when enabled; 2 means the original line was consumed. */
  relayChat(slot: number, text: string, teamOnly: boolean): 0 | 2;
  /** Null preserves the owner's existing format. Channel may be normal/dead/spectator/traitor. */
  formatChat(slot: number, text: string, teamOnly: boolean, recipient: number, channel: string): string | null;
  /** Null leaves life/team policy with the owner. Private role channels retain their own rules. */
  canReadChat(sender: number, receiver: number, teamOnly: boolean, senderAlive: boolean, receiverAlive: boolean, live: boolean): boolean | null;
  filterKillfeed(attacker: number, recipients: number[]): number[];
  /** Return an effective name; the caller retains its original desired name. */
  sanitizeName(slot: number, name: string): string;
}
export interface Contract {
  methods: DecluttrMethods;
  forwards: { OnConfigChanged: Notification<{ revision: number }> };
}
