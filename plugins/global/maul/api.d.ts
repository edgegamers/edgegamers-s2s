export interface MaulApi {
  normalizeSteamId(steamId: string): string;
  hasPermission(steamId: string, permission: string): boolean;
}
