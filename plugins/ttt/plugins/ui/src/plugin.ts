import { publish, use } from '@s2script/sdk/plugin';
import type { UiActor, UiLogRow, UiMethods, UiReportNotice } from '../api';
import { TttHud } from './ttthud';
let hud: TttHud | null = null;
export function OnPluginStart(): void {
 const instance = new TttHud(use('@edgegamers/ttt-core'));
 hud = instance;
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
    forget: (actor: UiActor): void => instance.forget(actor),
 };
 publish('@edgegamers/ttt-ui', methods);
}
export function OnPluginEnd(): void { const prior = hud; hud = null; prior?.dispose(); }
