import { command as nativeCommand } from "@s2script/sdk";
import type { CommandHandler, CommandInvocation } from "@s2script/sdk";
import { replyPhrase } from "./phrases";

// Both native text dispatch and menu dispatch use this same local phrase boundary.
function localized(handler: CommandHandler): CommandHandler {
  return (cmd: CommandInvocation) => handler({
    ...cmd, replyT: (key, ...args) => replyPhrase(cmd, key, ...args),
  });
}

export const command = Object.assign(
  (name: string, handler: CommandHandler): void => nativeCommand(name, localized(handler)),
  { admin: (name: string, flags: number, handler: CommandHandler): void => nativeCommand.admin(name, flags, localized(handler)) },
);
