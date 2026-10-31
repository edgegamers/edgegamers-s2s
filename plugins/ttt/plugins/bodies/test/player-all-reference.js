// Byte-pinned Player.all recipe from framework103 games/cs2/js/pawn.js.
export const allRecipe = "function () {\n    var out = [];\n    for (var s = 0; s < MAX_PLAYERS; s++) { var p = Player.fromSlot(s); if (p) out.push(p); }\n    return out;\n  }\n";
