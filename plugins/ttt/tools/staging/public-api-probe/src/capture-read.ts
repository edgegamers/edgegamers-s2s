import type { Entity } from '@s2script/sdk/entity';
// Read-only HUD-lab recipe. schemaOffset is the current live-schema host resolver;
// it is not a public SDK inspection API. No pointers or private text are returned.
export function readCaptures({ entity, schemaOffset, current }: {entity: typeof Entity; schemaOffset: (className: string, field: string) => number; current: () => boolean}, slot: number) {
  const fail = (reason: string) => ({ ok: false, reason });
  if (!Number.isInteger(slot) || slot < 0 || slot >= 64) return fail('slot');
  if (!current()) return fail('client-changed');
  const fields = [
    ['CCSCustomHudLayout', 'm_vecPlayerLayoutStates'],
    ['CCSCustomHudLayout', 'm_globalLayoutState'],
    ['CCSCustomHudLayout', 'm_vecPanelIds'],
    ['CCSCustomHudLayoutState', 'm_bInputCaptureEnabled'],
    ['CCSCustomHudLayoutState', 'm_playerSlot'],
    ['CCSCustomHudLayoutState', 'm_vecDialogVariableStrings'],
  ];
  const offsets = fields.map(([c, f]) => schemaOffset(c, f));
  if (!offsets.every(v => Number.isInteger(v) && v >= 0 && v < 65536)) return fail('schema');
  const [vector, global, panels, capture, stateSlot, dialog] = offsets;
  // Same source-backed stride as HUD lab: embedded global state precedes panelIds.
  const stride = panels - global;
  if (stride <= capture || stride <= stateSlot + 3 || stride < dialog + 24 || stride > 4096)
    return fail('state-span');
  if (!current()) return fail('client-changed');
  const refs = entity.findByClass('custom_hud_layout');
  if (!Array.isArray(refs) || refs.length > 64) return fail('entity-count');
  const rows = [];
  for (const ref of refs) {
    if (!current()) return fail('client-changed');
    if (!ref.isValid() || !Number.isInteger(ref.index) || ref.index < 0) return fail('entity-changed');
    const count = ref.readInt32(vector);
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0 || count > 64) return fail('state-count');
    const globalCapture = ref.readBool(global + capture);
    if (typeof globalCapture !== 'boolean') return fail('global-unreadable');
    const allocated = slot < count;
    let playerCapture: boolean | null = null, recordedSlot: number | null = null;
    if (allocated) {
      // CUtlVector +0 count/+8 data is the existing HUD-lab/native container recipe.
      playerCapture = ref.readBoolVia([vector + 8], slot * stride + capture);
      recordedSlot = ref.readInt32Via([vector + 8], slot * stride + stateSlot);
      if (typeof playerCapture !== 'boolean' || typeof recordedSlot !== 'number' || !Number.isInteger(recordedSlot) || recordedSlot < -1 || recordedSlot >= 64)
        return fail('player-unreadable');
    }
    if (!current()) return fail('client-changed');
    if (!ref.isValid() || ref.readInt32(vector) !== count) return fail('entity-changed');
    rows.push({ entityIndex: ref.index, playerStates: count, globalCapture, allocated,
      playerCapture, recordedSlot, slotMatches: allocated ? recordedSlot === slot : null });
  }
  if (!current()) return fail('client-changed');
  return { ok: true, slot, entityCount: rows.length, rows, leaseMetadata: 'unobservable',
    observation: 'sequential-server-copy' };
}
