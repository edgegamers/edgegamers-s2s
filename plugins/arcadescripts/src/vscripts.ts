// ArcadeScripts for s2script. Derived from ArcadeScripts-CSS by Supergosciuツ (GPL-3.0).
// See LICENSE and NOTICE.
//
// Upstream decides which script a logic_script runs from `CEntityInstance::m_iszPrivateVScripts`
// (its `vscripts` keyvalue). The s2script schema accessors do not expose that string field, so it is
// read here through the entity's address. The layout has been stable across CS2 builds:
//
//   CEntityInstance  +0x08 m_iszPrivateVScripts (CUtlSymbolLarge -> char*)
//                    +0x10 m_pEntity            (CEntityIdentity*)
//   CEntityIdentity  +0x18 m_name               (CUtlSymbolLarge -> char*)
//                    +0x20 m_designerName       (CUtlSymbolLarge -> char*)
//
// Before trusting it, each read checks that m_name matches the targetname the host reports for
// the same entity. A mismatch disables these reads for the rest of the process and is logged.
import { Ptr } from '@s2script/sdk/unsafe';
import type { EntityRef } from '@s2script/sdk';

const PRIVATE_VSCRIPTS = 0x08;
const ENTITY_IDENTITY = 0x10;
const IDENTITY_NAME = 0x18;
const IDENTITY_DESIGNER_NAME = 0x20;
const MAX_STRING = 260;

let layoutBroken = false;

function symbol(base: Ptr, offset: number): string {
  const text = base.deref(offset);
  return text.isNull() ? '' : text.readString(0, MAX_STRING);
}

function checkedInstance(ref: EntityRef): Ptr | null {
  if (layoutBroken || !ref.isValid()) return null;
  const name = ref.name;
  const instance = Ptr.from(ref);
  if (!instance || name === null) return null;
  try {
    const identity = instance.deref(ENTITY_IDENTITY);
    if (identity.isNull() || symbol(identity, IDENTITY_NAME) !== name) {
      // An unnamed entity proves nothing either way; only a named mismatch is decisive.
      if (name !== '') {
        layoutBroken = true;
        console.error('[ArcadeScripts] Entity layout check failed; map scripts are disabled on this build.');
      }
      return null;
    }
    return instance;
  } catch (error) {
    layoutBroken = true;
    console.error('[ArcadeScripts] Entity layout read failed; map scripts are disabled on this build.', error);
    return null;
  }
}

/** The entity's `vscripts` keyvalue, or null when it cannot be read safely. */
export function privateVScripts(ref: EntityRef): string | null {
  const instance = checkedInstance(ref);
  if (!instance) return null;
  try {
    return symbol(instance, PRIVATE_VSCRIPTS);
  } catch {
    return null;
  }
}

/** The entity's designer (class) name, for entities that existed before this plugin loaded. */
export function designerName(ref: EntityRef): string | null {
  const instance = checkedInstance(ref);
  if (!instance) return null;
  try {
    return symbol(instance.deref(ENTITY_IDENTITY), IDENTITY_DESIGNER_NAME);
  } catch {
    return null;
  }
}
