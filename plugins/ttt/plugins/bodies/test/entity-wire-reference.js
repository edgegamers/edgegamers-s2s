// Exact excerpts: s2script be0a3e33041e921ec113203d4e14a22c996deab7 core/js/prelude.js
  function EntityRef(index, id) { this.index = index; this.id = id; }
  EntityRef.prototype = {
    isValid:          function ()      { return __s2_ent_ref_valid(this.index, this.id); },
  };
  globalThis.__s2_entref_replacer = function (key, value) {
    return (value instanceof EntityRef) ? { __s2ref: [value.index, value.id] } : value;
  };
  globalThis.__s2_entref_reviver = function (key, value) {
    return (value && typeof value === "object" && Array.isArray(value.__s2ref))
      ? new EntityRef(value.__s2ref[0], value.__s2ref[1])
      : value;
  };
