/** Stock role uniforms from the existing port. There is no mutable model cache here. */
export const T_MODEL='agents/models/tm_phoenix/tm_phoenix.vmdl';
export const CT_MODEL='agents/models/ctm_fbi/ctm_fbi_varianth.vmdl';
export function roleModel(role: number): string { return role===3 ? CT_MODEL : T_MODEL; }
