import { createScope, publish, use } from '@s2script/sdk/plugin';
import { command } from '@s2script/sdk/commands';
import { ADMFLAG } from '@s2script/sdk/admin';
import type { Scope } from '@s2script/sdk/plugin';
import type { UiActor, UiHubRow, UiKillEntry, UiLogRow, UiMethods, UiReportNotice, UiRoundHudRow, UiRoundRole, UiRoundSummary } from '../api';
import { TttPanels } from './panels';
import { RoundHud } from './roundhud';
import { SpectateHub } from './hub';
import { KillFeed } from './feed';
let hud: TttPanels | null = null;
let round: RoundHud | null = null;
let hubs: SpectateHub | null = null;
let kills: KillFeed | null = null;
let frames: Scope | null = null;
export function OnPluginStart(): void {
 const rounds = new RoundHud();
 round = rounds;
 const instance = new TttPanels(use('@edgegamers/ttt-core'), (slot, mates) => rounds.setMates(slot, mates));
 hud = instance;
 const spectate = new SpectateHub();
 hubs = spectate;
 const feed = new KillFeed();
 kills = feed;
 const methods: UiMethods = {
    ensure: (): string | null => instance.ensure(),
    showTraitor: (actor: UiActor, mates: string[]): void => instance.showTraitor(actor, mates),
    hideTraitor: (actor: UiActor): void => instance.hideTraitor(actor),
    isShopOpen: (actor: UiActor): boolean => instance.isShopOpen(actor),
    openShop: (actor: UiActor): boolean => instance.openShop(actor),
    closeShop: (actor: UiActor): void => instance.closeShop(actor),
    openLogs: (actor: UiActor, lines: UiLogRow[]): boolean => instance.openLogs(actor, lines),
    isLogsOpen: (actor: UiActor): boolean => instance.isLogsOpen(actor),
    openLogBrowser: (actor: UiActor): boolean => instance.openLogBrowser(actor),
    closeLogs: (actor: UiActor): void => instance.closeLogs(actor),
    isRdmOpen: (actor: UiActor): boolean => instance.isRdmOpen(actor),
    openRdm: (actor: UiActor): void => instance.openRdm(actor),
    closeRdm: (actor: UiActor): void => instance.closeRdm(actor),
    refreshRdm: (): void => instance.refreshRdm(),
    notifyAdmins: (title: string, message: string): void => instance.notifyAdmins(title, message),
    openReportPrompt: (actor: UiActor, accusedName: string): boolean => instance.openReportPrompt(actor, accusedName),
    openReportPicker: (actor: UiActor): boolean => instance.openReportPicker(actor),
    reportNotice: (actor: UiActor, notice: UiReportNotice): boolean => instance.reportNotice(actor, notice),
    hideAll: (actor: UiActor): void => instance.hideAll(actor),
    resetAll: (): void => instance.resetAll(),
    forget: (actor: UiActor): void => { instance.forget(actor); rounds.forget(actor); spectate.forget(actor); },
    paintRoundHud: (rows: UiRoundHudRow[]): void => rounds.paint(rows),
    roleToast: (actor: UiActor, role: UiRoundRole): void => rounds.roleToast(actor, role),
    hideRoundHud: (): void => { rounds.hideAll(); spectate.hideAll(); },
    paintHubs: (rows: UiHubRow[]): void => spectate.paint(rows),
    roundSummary: (actors: UiActor[], summary: UiRoundSummary): void => rounds.summary(actors, summary),
    killFeed: (viewers: UiActor[], entry: UiKillEntry): boolean => feed.push(viewers, entry),
 };
 publish('@edgegamers/ttt-ui', methods);
 // What the round HUD holds and last sent you: whether the rail and role card are claimed, and their state.
 command.admin('sm_ttt_hudstate', ADMFLAG.GENERIC, (cmd) => {
  for (const line of rounds.describe(cmd.callerSlot)) cmd.reply(`[TTT] ${line}`);
 });
 // The intro camera moves every frame; everything else here paints when Core asks.
 if (typeof createScope === 'function') {
  frames = createScope();
  frames.server.onGameFrame(() => spectate.camera.tick());
 }
}
export function OnPluginEnd(): void {
 const prevFrames = frames; frames = null; prevFrames?.dispose();
 const prior = hud; hud = null; prior?.dispose();
 const rounds = round; round = null; rounds?.dispose();
 const prevHubs = hubs; hubs = null; prevHubs?.dispose();
 const prevFeed = kills; kills = null; prevFeed?.dispose();
}
