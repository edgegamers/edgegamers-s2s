// GENERATED from gamedata/functions.jsonc — DO NOT EDIT.
import type { EntityRef } from "@s2script/sdk/entity";
import "@s2script/sdk/unsafe";
declare module "@s2script/sdk/unsafe" {
  interface SetEntityNamePreView {
    readonly identity: Ptr | null;
    readonly name: string;
  }
  interface SetEntityNamePostView {
    readonly identity: Ptr | null;
    readonly name: string;
    readonly returnValue: void;
  }
  interface SetEntityNameAvailableBinding {
    readonly available: true;
    readonly status: FunctionStatus;
    call(arg0_identity: Ptr | null, arg1_name: string): void;
  }
  interface SetEntityNameUnavailableBinding {
    readonly available: false;
    readonly status: FunctionStatus;
  }
  interface EngineFunctions {
    setEntityName: SetEntityNameAvailableBinding | SetEntityNameUnavailableBinding;
  }
}
