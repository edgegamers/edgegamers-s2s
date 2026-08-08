export function formatGreeting(name: string): string {
  const normalizedName = name.trim() || "player";
  return `Hello, ${normalizedName}!`;
}
