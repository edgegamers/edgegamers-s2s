/** Chat control bytes have no presentation meaning in Panorama, HUD HTML or console text. */
export function plainText(text: string): string {
  return text.replace(/[\x01-\x10]/g, "");
}
