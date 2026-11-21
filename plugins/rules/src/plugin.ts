/**
 * Server rules on the GameHud rules sheet.
 *
 *   !rules                        open the rules
 *   !rules general 6              open a section on a rule, highlighted
 *   !rules <player> [section] [n] (admins) open them for a player, e.g. `!rules bob general 1`
 *
 * The rules live in configs/rules.json (see `rules.ts`). Another plugin can open the sheet for a
 * player by running `sm_rules` as that player, so this plugin needs nothing from theirs.
 */
import { ADMFLAG, Admin, command, HookResult } from '@s2script/sdk';
import type { CommandInvocation, HookResultValue } from '@s2script/sdk';
import { GameHud, Player } from '@s2script/cs2';
import { findSection, loadRules, sheetSections } from './rules';

/** Open the rules sheet for one player. False when the HUD refused it (the sheet then goes to chat). */
export function openRules(slot: number, section?: string, rule?: string): boolean {
  const file = loadRules();
  const sections = sheetSections(file);
  const open = section ?? (file.open !== undefined ? findSection(file, file.open) : undefined) ?? sections[0]?.id;
  const sheet = GameHud.sheet(slot, {
    title: file.title ?? 'Rules',
    right: '{grey}!rules <section> <n>',
    footer: '{grey}Click a tab · rule numbers stay the same on every page',
    sections,
    section: open,
    highlight: section !== undefined ? rule : undefined,
  });
  return sheet !== null;
}

function rules(cmd: CommandInvocation): HookResultValue {
  const file = loadRules();
  const ids = file.sections.map((s) => s.id);
  let targets = cmd.callerSlot >= 0 ? [cmd.callerSlot] : [];
  let i = 0;
  const first = cmd.arg(0);
  // A first word that is neither a section nor a number names a player: admins only.
  if (first && findSection(file, first) === undefined && !/^\d+$/.test(first)) {
    const admin = cmd.callerSlot < 0 || Admin.forSlot(cmd.callerSlot)?.hasFlags(ADMFLAG.GENERIC) === true;
    if (!admin) { cmd.reply(`[Rules] No section "${first}". Sections: ${ids.join(', ')}`); return HookResult.Handled; }
    targets = Player.target(first, cmd.callerSlot).map((p) => p.slot);
    if (targets.length === 0) { cmd.reply(`[Rules] No player matches "${first}".`); return HookResult.Handled; }
    i = 1;
  }
  let section: string | undefined;
  const typed = cmd.arg(i);
  if (typed) {
    section = findSection(file, typed);
    if (section === undefined && !/^\d+$/.test(typed)) { cmd.reply(`[Rules] No section "${typed}". Sections: ${ids.join(', ')}`); return HookResult.Handled; }
    if (section !== undefined) i++;
  }
  const rule = cmd.arg(i) || undefined;
  if (targets.length === 0) { cmd.reply(`[Rules] usage: sm_rules [player] [${ids.join('|')}] [n]`); return HookResult.Handled; }
  for (const slot of targets) openRules(slot, section, rule);
  if (targets.length > 1 || targets[0] !== cmd.callerSlot) cmd.reply(`[Rules] Opened the rules for ${targets.length} player(s).`);
  return HookResult.Handled;
}

export function OnPluginStart(): void {
  // Write the defaults now, so an operator finds the file to edit before anyone types !rules.
  loadRules();
  command('sm_rules', rules);
}

export function OnPluginEnd(): void {}
