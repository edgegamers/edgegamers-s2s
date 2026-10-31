# ADR0006 — Extract existing World, Communication and Shop owners

Accepted October2,2026, against the existing-port baseline.

World alone owns model writes, caches, tags, icons and native outline entities. It receives copied Core actors and genuine pawn refs. Native work enters the original Core PRE queue through owner tickets, retaining its global waiting/drain budget and map/round/connection invalidation. Cleanup can hide and destroy owned entities and restore retained names without a final Core query.

Communication owns the existing chat relay and voice policy, driven by Core at the original tick and cleanup positions. Its private relays return Handled even when capture, formatting or sending throws. Owner absence suppresses private chat. Only plugin-owned AND masks are cleared; unrelated moderator mutes survive. Assigned engine ConVars are restored only while they still equal this owner's values.

Shop alone owns the exact21-item catalog, wallets, purchase counts and six existing economy callbacks. Core temporarily grants physical effects through a finite21-ID bridge until those real implementations move. Preserve precommit purchase/debit observations, canceled-debit behavior, normal balance-event refunds on false grants, and uncertain thrown grants without automatic retry. Wallets and counts reset at Finished. Panorama retains registration order; chat retains its existing sorted order.

Shop owns107 canonical settings and legacy aliases, extending the importer to141 across Karma, Special and Shop. Core consumes copied read-only Shop settings. Every attachment has a distinct lifetime; external settings calls copy locally and commit only if that attachment remains current. Failed binds restore the previous attachment only while no replacement has taken over. Settings retain four promotion boundaries and catalog prices their separate three refresh sites.

This step adds no framework patch, native supplier export, additional frame driver, gameplay balance change or database prerequisite. Local archive validation and actual receiving-client acceptance remain separate evidence.
