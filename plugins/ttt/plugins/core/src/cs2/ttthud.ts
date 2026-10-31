/** Slot-shaped compatibility calls; Panorama state and handlers belong to the UI plugin. */
import type { UiLogRow, UiMethods, UiReportNotice } from '../../../../packages/contracts/ui-types.ts';
import { captureRegistryUiActor, captureUiActor } from '../core/ui-actor';
export type LogRow = UiLogRow;

function invoke<T>(run: () => T, fallback: T): T {
  try { return run(); }
  catch (error) { console.log(`[ttt/ui] provider unavailable: ${String(error)}`); return fallback; }
}
function facade(provider: UiMethods) {
  const withActor = <T>(slot: number, fallback: T, run: (actor: NonNullable<ReturnType<typeof captureUiActor>>) => T): T => {
    const actor = captureUiActor(slot);
    return actor === null ? fallback : invoke(() => run(actor), fallback);
  };
  return {
    ensure: () => invoke(() => provider.ensure(), 'UI provider unavailable'),
    showTraitor: (slot: number, mates: string[]) => withActor(slot, undefined, (a) => provider.showTraitor(a, mates)),
    hideTraitor: (slot: number) => withActor(slot, undefined, (a) => provider.hideTraitor(a)),
    isShopOpen: (slot: number) => withActor(slot, false, (a) => provider.isShopOpen(a)),
    openShop: (slot: number) => withActor(slot, false, (a) => provider.openShop(a)),
    closeShop: (slot: number) => withActor(slot, undefined, (a) => provider.closeShop(a)),
    openLogs: (slot: number, rows: readonly LogRow[]) => withActor(slot, false, (a) => provider.openLogs(a, rows.map((row) => ({ ...row })))),
    isLogsOpen: (slot: number) => withActor(slot, false, (a) => provider.isLogsOpen(a)),
    openLogBrowser: (slot: number) => withActor(slot, false, (a) => provider.openLogBrowser(a)),
    closeLogs: (slot: number) => withActor(slot, undefined, (a) => provider.closeLogs(a)),
    isRdmOpen: (slot: number) => withActor(slot, false, (a) => provider.isRdmOpen(a)),
    openRdm: (slot: number) => withActor(slot, undefined, (a) => provider.openRdm(a)),
    closeRdm: (slot: number) => withActor(slot, undefined, (a) => provider.closeRdm(a)),
    refreshRdm: () => invoke(() => provider.refreshRdm(), undefined),
    notifyAdmins: (title: string, message: string) => invoke(() => provider.notifyAdmins(title, message), undefined),
    openReportPrompt: (slot: number, accusedName: string) => withActor(slot, false, (a) => provider.openReportPrompt(a, accusedName)),
    openReportPicker: (slot: number) => withActor(slot, false, (a) => provider.openReportPicker(a)),
    reportNotice: (slot: number, notice: UiReportNotice) => withActor(slot, false, (a) => provider.reportNotice(a, { ...notice })),
    hideAll: (slot: number) => withActor(slot, undefined, (a) => provider.hideAll(a)),
    resetAll: () => invoke(() => provider.resetAll(), undefined),
    forget: (slot: number) => {
      const actor = captureRegistryUiActor(slot);
      if (actor) invoke(() => provider.forget(actor), undefined);
    },
  };
}
export type TttHud = ReturnType<typeof facade>;
let instance: TttHud | null = null;
export function bindTttHudProvider(provider: UiMethods): { dispose(): void } {
  const current = facade(provider);
  instance = current;
  return { dispose: () => { if (instance === current) instance = null; } };
}
export function getTttHud(): TttHud | null { return instance; }
