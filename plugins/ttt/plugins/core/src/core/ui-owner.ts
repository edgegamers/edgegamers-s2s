import { Admin, ADMFLAG } from '@s2script/sdk/admin';
import { Bans } from '@s2script/sdk/bans';
import { Clients } from '@s2script/sdk/clients';
import { Player } from '@s2script/cs2';
import type { UiActor, UiReportAction, UiRulingReply, UiShopStamp } from '../../../../packages/contracts/ui-types.ts';
import * as reg from './registry';
import {reportableKillers} from './kill-ledger';
import { captureUiActor, matchesUiActor, matchesRegistryUiActor } from './ui-actor';
import { createUiModels } from './ui-model.ts';
import { msgFor, chatMsgFor } from './msgs';
import { plainText } from '../../../../packages/contracts/presentation.ts';
import { game, inProgress, roundEpoch } from '../game/game';
import { logCount, logRoundAt, makeLogRows } from '../game/logger';
import { tellAll } from '../cs2/pawn';
import { getShopView, balanceOf, canPurchase, itemById, PurchaseResult, resultMessage, tryPurchase } from '../shop/shop';
import { SHOP_ITEM_IDS } from '../../../../packages/contracts/shop-catalog.ts';
import {getReportQueue,getReport,reportsBinding,commitReportRuling,reportsAvailable,answerPending,beginReport} from './reports-provider';
import {shopProviderBinding} from './shop-provider';
import {currentMapEpoch} from './preframe';
import {isCoreActionAdmissionOpen} from './action-admission';

const plainMsgFor = (slot: number, key: string): string => plainText(msgFor(slot, key));

function shopStamp(slot:number):UiShopStamp {
  return {mapEpoch:currentMapEpoch(),roundEpoch:roundEpoch(),state:game.state,role:reg.roleOf(slot),alive:reg.isAlive(slot),participating:reg.isParticipating(slot),shopBinding:shopProviderBinding()};
}
/** Pure comparison after the final native actor read; never trusts a copied row as authority. */
function matchesShopStamp(actor:UiActor,stamp:UiShopStamp):boolean {
  if(!isCoreActionAdmissionOpen()||!stamp||typeof stamp!=='object')return false;
  const integer=(v:unknown):boolean=>Number.isSafeInteger(v)&&Number(v)>=0;
  return integer(stamp.mapEpoch)&&integer(stamp.roundEpoch)&&integer(stamp.state)&&stamp.state<=3&&integer(stamp.role)&&stamp.role<=4&&
    typeof stamp.alive==='boolean'&&typeof stamp.participating==='boolean'&&integer(stamp.shopBinding)&&
    matchesRegistryUiActor(actor)&&
    stamp.mapEpoch===currentMapEpoch()&&stamp.roundEpoch===actor.roundEpoch&&stamp.roundEpoch===roundEpoch()&&stamp.state===game.state&&
    stamp.role===reg.roleOf(actor.slot)&&stamp.alive===reg.isAlive(actor.slot)&&stamp.participating===reg.isParticipating(actor.slot)&&stamp.shopBinding===shopProviderBinding();
}
/** May the admin in `slot` act on `accusedSteamId`? Only a target with higher immunity is out of reach. */
export function outranks(slot: number, accusedSteamId: string): boolean {
  if (accusedSteamId === '') return true;
  const accused = Admin.get(accusedSteamId);
  if (accused === null) return true;
  return accused.immunity <= (Admin.forSlot(slot)?.immunity ?? 0);
}
/** Verdict and sanction are one server decision; a replay cannot ban or queue twice. */
function ruleReport(actor: UiActor, id: number, binding: number, action: UiReportAction, slays: number): UiRulingReply {
  const slot = actor.slot;
  const report = binding === reportsBinding() ? getReport(id) : null;
  if (!report || report.verdict !== 0 || binding !== reportsBinding()) return { status: 'refused', title: 'Cannot rule', message: 'This report was already ruled', tone: 'warn' };
  if (action === 'ban' && report.accusedSteamId === '') {
    return { status: 'refused', title: 'Cannot ban', message: 'No SteamID was recorded', tone: 'warn' };
  }
  const admin = Player.fromSlot(slot)?.playerName ?? `slot ${slot}`;
  if (!matchesUiActor(actor) || Admin.forSlot(slot)?.hasFlags(ADMFLAG.GENERIC) !== true || !matchesUiActor(actor)) {
    return { status: 'refused', title: 'Cannot rule', message: 'Your access is no longer available', tone: 'warn' };
  }
  // Admin immunity, as SourceMod applies it to every command that acts on a player: a convict or a ban
  // is refused when the accused is an admin with HIGHER immunity than the one ruling. Checked by
  // SteamID, so it holds whether or not the accused is still on the server; an acquittal harms no one.
  if (action !== 'acquit' && !outranks(slot, report.accusedSteamId)) {
    return { status: 'refused', title: 'Cannot rule', message: `${report.accusedName} has higher immunity than you`, tone: 'warn' };
  }
  let decision:ReturnType<typeof commitReportRuling>;
  try { decision=commitReportRuling(actor,id,binding,action,slays); }
  catch(error){console.log(`[ttt/rdm] #${id} verdict outcome requires operator review: ${String(error)}`);return {status:'unknown',title:'Check report outcome',message:'Verify the report in the server console',tone:'warn'};}
  if (!decision) return { status: 'refused', title: 'Cannot rule', message: 'This report was already ruled', tone: 'warn' };
  const {report:ruled,priorGuilty:priors,totalOwed:total}=decision.ruling;
  if (!decision.isCurrent()) return {status:'unknown',title:'Check report outcome',message:'Reports owner changed after the verdict',tone:'warn'};
  if (action === 'ban') {
    // Preserve the old permanent ban policy. SDK cache visibility is not disk acknowledgement.
    try {
      Bans.add(ruled.accusedSteamId, 0, `RDM (banned by ${admin})`);
      if (Bans.get(ruled.accusedSteamId)?.until !== 0) throw new Error('ban cache did not accept entry');
      if(!decision.isCurrent())throw Error("Reports owner changed during ban");
      decision.pardon();
      for (const target of reg.activeSlots()) {
        if (reg.steamIdOf(target) !== ruled.accusedSteamId) continue;
        const client = Clients.fromSlot(target);
        if (client?.isValid() && client.steamId === ruled.accusedSteamId) client.kickWithReason(`Banned for RDM by ${admin}`);
        break;
      }
      console.log(`[ttt/rdm] ${admin} BANNED ${ruled.accusedName} (${ruled.accusedSteamId})`);
      tellAll(recipient => chatMsgFor(recipient, "ttt.reports.banned", ruled.accusedName));
      return { status: 'success', title: 'Banned', message: ruled.accusedName, tone: 'bad' };
    } catch (error) {
      console.log(`[ttt/rdm] #${id} ban outcome requires operator review: ${String(error)}`);
      return { status: 'unknown', title: 'Check ban outcome', message: 'Report ruled; verify the ban in the server console', tone: 'warn' };
    }
  }
  if (action === 'convict') {
    console.log(`[ttt/rdm] ${admin} queued ${ruled.slays} slay(s) for ${ruled.accusedName} (${total} owed, offence #${priors})`);
    tellAll(recipient => chatMsgFor(recipient, "ttt.reports.slays_queued", ruled.accusedName, total));
  }
  console.log(`[ttt/rdm] rdm #${id}: ${ruled.reporterName} vs ${ruled.accusedName} -> ` +
    `${action === 'convict' ? `guilty (${ruled.slays} slays)` : 'innocent'} by ${admin}`);
  return {
    status: 'success', title: action === 'convict' ? 'Guilty' : 'Not guilty',
    message: action === 'convict' ? `${ruled.accusedName} - ${ruled.slays} slay(s)` : ruled.accusedName,
    tone: action === 'convict' ? 'bad' : 'good',
  };
}

export const uiModels = createUiModels({
  matchesActor: matchesUiActor,
  isAdmin: (slot) => Admin.forSlot(slot)?.hasFlags(ADMFLAG.GENERIC) === true,
  canBuy: (slot) => inProgress() && reg.isParticipating(slot) && reg.isAlive(slot),
  shopStamp,matchesShopStamp,
  shop: (slot) => {
    const view=getShopView(slot), balance=view.balance;
    // Panorama keeps its original catalog order; the chat menu keeps Shop's sorted view.
    const rows = view.rows.slice().sort((a,b)=>SHOP_ITEM_IDS.indexOf(a.id)-SHOP_ITEM_IDS.indexOf(b.id)).map((item) => {
      const gate = item.gate;
      const refusal = gate !== PurchaseResult.Success ? gate : item.price > balance ? PurchaseResult.InsufficientFunds : PurchaseResult.Success;
      return {
        itemId: item.id, name: plainMsgFor(slot, item.nameKey), description: plainMsgFor(slot, item.descriptionKey),
        price: item.price, limit: item.limit, refusal: refusal === PurchaseResult.Success ? null : plainText(resultMessage(refusal, slot)),
      };
    });
    return { balance, rows };
  },
  buy: (slot, id) => {
    const item = itemById(id);
    if (!item) return { status: 'refused', title: 'Cannot buy', message: plainText(resultMessage(PurchaseResult.NotFound, slot)), tone: 'warn' };
    const gate = canPurchase(slot, item);
    const refusal = gate !== PurchaseResult.Success ? gate : item.price > balanceOf(slot) ? PurchaseResult.InsufficientFunds : PurchaseResult.Success;
    if (refusal !== PurchaseResult.Success) return { status: 'refused', title: 'Cannot buy', message: plainText(resultMessage(refusal, slot)), tone: 'warn' };
    const result = tryPurchase(slot, item);
    const ok = result === PurchaseResult.Success;
    const name = plainMsgFor(slot, item.nameKey);
    const desc = ok ? plainMsgFor(slot, item.descKey) : '';
    const detail = desc !== '' && desc !== item.descKey ? desc : '';
    return {
      status: ok ? 'success' : 'refused', title: ok ? 'Purchased' : 'Failed',
      message: ok ? detail === '' ? name : `${name} - ${detail}` : `${name} - ${plainText(resultMessage(result, slot))}`,
      tone: ok ? 'good' : 'bad',
    };
  },
  reports: () => {
    const queue=getReportQueue();
    return {baseSlays:queue.baseSlays,maxQueued:queue.maxQueued,rows:queue.rows.map(r=>({
      binding:queue.binding,id:r.id,reporterName:r.reporterName,accusedName:r.accusedName,round:r.round,
      filed:r.filed,reason:r.reason,priorGuilty:r.priorGuilty,suggestedSlays:r.suggestedSlays,
    }))};
  },
  rule: ruleReport,
  logPage: (at) => ({ rows: makeLogRows(at), round: logRoundAt(at), count: Math.max(1, logCount()) }),
  actors: () => reg.activeSlots().flatMap((slot) => {
    const actor = captureUiActor(slot);
    return actor === null ? [] : [actor];
  }),
  reportsAvailable,
  answerPrompt: answerPending,
  // Names only: the picker must not reveal who is dead, their role, or whether they are a bot.
  // Only the players who killed you within the report window — see kill-ledger.ts.
  reportTargets: (slot) => reportableKillers(slot).flatMap((other) => {
    if (other === slot) return [];
    const target = captureUiActor(other);
    return target === null ? [] : [{ target, name: reg.nameOf(other) }];
  }),
  beginReport,
});
