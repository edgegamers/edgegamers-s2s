import { Clients } from "@s2script/sdk/clients";

export function tell(slot: number, text: string): boolean {
  const client = Clients.fromSlot(slot);
  if (client === null) return false;
  client.chat(text);
  return true;
}
