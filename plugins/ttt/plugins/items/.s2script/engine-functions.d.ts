// GENERATED from gamedata/functions.jsonc — DO NOT EDIT.
import type { EntityRef } from "@s2script/sdk/entity";
import "@s2script/sdk/unsafe";
declare module "@s2script/sdk/unsafe" {
  interface CreateHeGrenadePreView {
    readonly position: { readonly x: number; readonly y: number; readonly z: number };
    readonly angles: { readonly x: number; readonly y: number; readonly z: number };
    readonly velocity: { readonly x: number; readonly y: number; readonly z: number };
    readonly velocityAngles: { readonly x: number; readonly y: number; readonly z: number };
    readonly thrower: EntityRef;
    readonly weaponId: number;
    readonly team: number;
  }
  interface CreateHeGrenadePostView {
    readonly position: { readonly x: number; readonly y: number; readonly z: number };
    readonly angles: { readonly x: number; readonly y: number; readonly z: number };
    readonly velocity: { readonly x: number; readonly y: number; readonly z: number };
    readonly velocityAngles: { readonly x: number; readonly y: number; readonly z: number };
    readonly thrower: EntityRef;
    readonly weaponId: number;
    readonly team: number;
    readonly returnValue: EntityRef | null;
  }
  interface CreateHeGrenadeAvailableBinding {
    readonly available: true;
    readonly status: FunctionStatus;
    call(arg0_position: { readonly x: number; readonly y: number; readonly z: number }, arg1_angles: { readonly x: number; readonly y: number; readonly z: number }, arg2_velocity: { readonly x: number; readonly y: number; readonly z: number }, arg3_velocityAngles: { readonly x: number; readonly y: number; readonly z: number }, arg4_thrower: EntityRef, arg5_weaponId: number, arg6_team: number): EntityRef | null;
  }
  interface CreateHeGrenadeUnavailableBinding {
    readonly available: false;
    readonly status: FunctionStatus;
  }
  interface EngineFunctions {
    createHeGrenade: CreateHeGrenadeAvailableBinding | CreateHeGrenadeUnavailableBinding;
  }
}
