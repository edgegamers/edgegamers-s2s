import type {EventKind, HandlerId} from './ordered-types.ts';
export type ModuleId = 'interact' | 'karma' | 'economy' | 'effects' | 'special' | 'weaponfx' | 'handlers' | 'stats' | 'feedback' | 'icons' | 'bootstrap' | 'reports';
export type OwnerId = 'core' | 'karma' | 'shop' | 'bodies' | 'special' | 'ui' | 'reports' | 'world' | 'items';
export interface Registration {
  readonly id: HandlerId; readonly module: ModuleId; readonly owner: OwnerId;
  readonly event: EventKind; readonly priority: number; readonly installationOrdinal: number;
  readonly localOrdinal: number; readonly ignoreCanceled: boolean;
}
/** Old plugin.ts installation order; priority is the primary sort key. */
export const REGISTRATIONS: readonly Registration[] = Object.freeze([
  Object.freeze({"id":"interact.gameState","owner":"bodies","event":"gameState","priority":60,"installationOrdinal":1,"localOrdinal":1,"ignoreCanceled":true,"module":"interact"}),
  Object.freeze({"id":"interact.leave","owner":"bodies","event":"leave","priority":60,"installationOrdinal":1,"localOrdinal":2,"ignoreCanceled":false,"module":"interact"}),
  Object.freeze({"id":"karma.damage","owner":"karma","event":"damage","priority":60,"installationOrdinal":2,"localOrdinal":1,"ignoreCanceled":false,"module":"karma"}),
  Object.freeze({"id":"karma.death","owner":"karma","event":"death","priority":60,"installationOrdinal":2,"localOrdinal":2,"ignoreCanceled":false,"module":"karma"}),
  Object.freeze({"id":"karma.gameState","owner":"karma","event":"gameState","priority":60,"installationOrdinal":2,"localOrdinal":3,"ignoreCanceled":false,"module":"karma"}),
  Object.freeze({"id":"karma.roleAssigning","owner":"karma","event":"roleAssigning","priority":40,"installationOrdinal":2,"localOrdinal":4,"ignoreCanceled":false,"module":"karma"}),
  Object.freeze({"id":"karma.karma","owner":"karma","event":"karma","priority":1000,"installationOrdinal":2,"localOrdinal":5,"ignoreCanceled":true,"module":"karma"}),
  Object.freeze({"id":"karma.join","owner":"karma","event":"join","priority":60,"installationOrdinal":2,"localOrdinal":6,"ignoreCanceled":false,"module":"karma"}),
  Object.freeze({"id":"karma.leave","owner":"karma","event":"leave","priority":60,"installationOrdinal":2,"localOrdinal":7,"ignoreCanceled":false,"module":"karma"}),
  Object.freeze({"id":"economy.roleAssigned","owner":"shop","event":"roleAssigned","priority":80,"installationOrdinal":3,"localOrdinal":1,"ignoreCanceled":false,"module":"economy"}),
  Object.freeze({"id":"economy.death","owner":"shop","event":"death","priority":60,"installationOrdinal":3,"localOrdinal":2,"ignoreCanceled":false,"module":"economy"}),
  Object.freeze({"id":"economy.bodyIdentify","owner":"shop","event":"bodyIdentify","priority":60,"installationOrdinal":3,"localOrdinal":3,"ignoreCanceled":true,"module":"economy"}),
  Object.freeze({"id":"economy.damage","owner":"shop","event":"damage","priority":40,"installationOrdinal":3,"localOrdinal":4,"ignoreCanceled":false,"module":"economy"}),
  Object.freeze({"id":"economy.gameState","owner":"shop","event":"gameState","priority":60,"installationOrdinal":3,"localOrdinal":5,"ignoreCanceled":true,"module":"economy"}),
  Object.freeze({"id":"economy.leave","owner":"shop","event":"leave","priority":60,"installationOrdinal":3,"localOrdinal":6,"ignoreCanceled":false,"module":"economy"}),
  Object.freeze({"id":"effects.damage","owner":"items","event":"damage","priority":40,"installationOrdinal":4,"localOrdinal":1,"ignoreCanceled":false,"module":"effects"}),
  Object.freeze({"id":"effects.bodyCreate","owner":"items","event":"bodyCreate","priority":60,"installationOrdinal":4,"localOrdinal":2,"ignoreCanceled":false,"module":"effects"}),
  Object.freeze({"id":"effects.gameState","owner":"items","event":"gameState","priority":60,"installationOrdinal":4,"localOrdinal":3,"ignoreCanceled":true,"module":"effects"}),
  Object.freeze({"id":"special.gameState","owner":"special","event":"gameState","priority":60,"installationOrdinal":5,"localOrdinal":1,"ignoreCanceled":true,"module":"special"}),
  Object.freeze({"id":"special.purchase","owner":"special","event":"purchase","priority":40,"installationOrdinal":5,"localOrdinal":2,"ignoreCanceled":false,"module":"special"}),
  Object.freeze({"id":"special.balance","owner":"special","event":"balance","priority":80,"installationOrdinal":5,"localOrdinal":3,"ignoreCanceled":false,"module":"special"}),
  Object.freeze({"id":"special.death","owner":"special","event":"death","priority":60,"installationOrdinal":5,"localOrdinal":4,"ignoreCanceled":false,"module":"special"}),
  Object.freeze({"id":"special.damage","owner":"special","event":"damage","priority":10,"installationOrdinal":5,"localOrdinal":5,"ignoreCanceled":false,"module":"special"}),
  Object.freeze({"id":"weaponfx.gameState","owner":"items","event":"gameState","priority":60,"installationOrdinal":6,"localOrdinal":1,"ignoreCanceled":true,"module":"weaponfx"}),
  Object.freeze({"id":"handlers.damage","owner":"core","event":"damage","priority":10,"installationOrdinal":7,"localOrdinal":1,"ignoreCanceled":false,"module":"handlers"}),
  Object.freeze({"id":"handlers.bodyIdentify","owner":"core","event":"bodyIdentify","priority":60,"installationOrdinal":7,"localOrdinal":2,"ignoreCanceled":true,"module":"handlers"}),
  Object.freeze({"id":"handlers.gameState","owner":"core","event":"gameState","priority":60,"installationOrdinal":7,"localOrdinal":3,"ignoreCanceled":true,"module":"handlers"}),
  Object.freeze({"id":"handlers.leave","owner":"core","event":"leave","priority":60,"installationOrdinal":7,"localOrdinal":4,"ignoreCanceled":false,"module":"handlers"}),
  Object.freeze({"id":"stats.bodyIdentify","owner":"core","event":"bodyIdentify","priority":1000,"installationOrdinal":8,"localOrdinal":1,"ignoreCanceled":true,"module":"stats"}),
  Object.freeze({"id":"stats.gameState","owner":"core","event":"gameState","priority":60,"installationOrdinal":8,"localOrdinal":2,"ignoreCanceled":true,"module":"stats"}),
  Object.freeze({"id":"feedback.roleAssigned","owner":"ui","event":"roleAssigned","priority":1000,"installationOrdinal":9,"localOrdinal":1,"ignoreCanceled":false,"module":"feedback"}),
  Object.freeze({"id":"feedback.gameState","owner":"ui","event":"gameState","priority":1000,"installationOrdinal":9,"localOrdinal":2,"ignoreCanceled":true,"module":"feedback"}),
  Object.freeze({"id":"icons.roleAssigned","owner":"world","event":"roleAssigned","priority":1000,"installationOrdinal":10,"localOrdinal":1,"ignoreCanceled":false,"module":"icons"}),
  Object.freeze({"id":"icons.death","owner":"world","event":"death","priority":1000,"installationOrdinal":10,"localOrdinal":2,"ignoreCanceled":false,"module":"icons"}),
  Object.freeze({"id":"icons.bodyIdentify","owner":"world","event":"bodyIdentify","priority":1000,"installationOrdinal":10,"localOrdinal":3,"ignoreCanceled":true,"module":"icons"}),
  Object.freeze({"id":"icons.damage","owner":"world","event":"damage","priority":1000,"installationOrdinal":10,"localOrdinal":4,"ignoreCanceled":false,"module":"icons"}),
  Object.freeze({"id":"icons.gameState","owner":"world","event":"gameState","priority":60,"installationOrdinal":10,"localOrdinal":5,"ignoreCanceled":true,"module":"icons"}),
  Object.freeze({"id":"icons.leave","owner":"world","event":"leave","priority":60,"installationOrdinal":10,"localOrdinal":6,"ignoreCanceled":false,"module":"icons"}),
  Object.freeze({"id":"bootstrap.roleAssigned","owner":"core","event":"roleAssigned","priority":1000,"installationOrdinal":11,"localOrdinal":1,"ignoreCanceled":false,"module":"bootstrap"}),
  Object.freeze({"id":"bootstrap.purchase","owner":"core","event":"purchase","priority":1000,"installationOrdinal":11,"localOrdinal":2,"ignoreCanceled":true,"module":"bootstrap"}),
  Object.freeze({"id":"bootstrap.gameState","owner":"core","event":"gameState","priority":10,"installationOrdinal":11,"localOrdinal":3,"ignoreCanceled":false,"module":"bootstrap"}),
  Object.freeze({"id":"reports.death","owner":"reports","event":"death","priority":60,"installationOrdinal":12,"localOrdinal":1,"ignoreCanceled":true,"module":"reports"}),
  Object.freeze({"id":"reports.leave","owner":"reports","event":"leave","priority":60,"installationOrdinal":12,"localOrdinal":2,"ignoreCanceled":false,"module":"reports"}),
]);
