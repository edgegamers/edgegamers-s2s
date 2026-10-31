import {refreshBodySettings} from './body-settings';
import { refresh } from './cvars';
import {refreshShopSettings} from '../shop/settings';
import { refreshKarmaSettings } from '../karma/karma';
import { refreshSpecialSettings } from '../special/rounds';
import {refreshWorldSettings} from './world-settings';

/** Preserve every old refresh site, including startGame before Countdown/role dealing. */
export function refreshSettings(): void {
  refreshBodySettings();
  refresh();
  refreshKarmaSettings();
  refreshSpecialSettings();
  refreshShopSettings();
  refreshWorldSettings();
}
