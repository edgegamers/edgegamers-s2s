# Port decisions and baseline correction

Current correction, October2,2026: use the existing old port as the implementation/behavior baseline and upgrade through supported current s2script APIs, with official Metamod. The table below records the earlier interview and is historical wherever ADR0003 or the current specification supersedes it.

Recorded October 1, 2026 (America/Los_Angeles). These are user decisions, not evidence of implemented behavior. The implementation brief is in `docs/specs/modular-ttt-port.md`.

| Decision | Agreed direction |
| --- | --- |
| Baseline | Bara's CS:GO TTT gameplay and balance, with confirmed bugs fixed and deviations documented. |
| Architecture | Independently deployable core, shop, karma, bodies, communication, reports, UI, and item plugins; typed versioned service contracts. No monolithic port. |
| Panorama | Start with s2script's first-party UI kit; create and publish our own assets/addon when needed for the finished interface. |
| Private screens | Use non-observable per-player UI. Validate spectators and reconnects. CS2 adapter work belongs in this project; missing convenience wrappers are not grounds to omit gameplay. |
| Prior-port precedence | Keep its visual and UX improvements, including traitor-buddy silhouette outlines. Bara gameplay applies unless explicitly changed. |
| Staging | Authorized host: `ghirakawa@nebula.gkh.dev`. |
| Detectives | Configurable minimum one detective at six eligible players; explicit deviation from Bara's rounding. |
| Moderation | Production preserves configurable Bara auto-RDM slays and low-karma bans alongside reviewed reports. Disable real punishments in staging. |
| Reloads | Core reload ends the active round cleanly and retains durable data. Feature/item reload cleans its own effects. Balance changes apply next round. |
| Cluster | Updated October2,2026: buyer-only charge, consumed by the buyer's next HE detonation; grenade drops/pickups do not transfer it. This supersedes the earlier grenade-bound proposal. Real bouncing child grenades remain. |
| Tripwire placement | Held inventory charge, explicit Place action/command. |
| Tripwire interaction | Two shootable/defusable anchors and a visible beam; continuous exclusive defusing; wall-occluded blast; configurable fellow-traitor damage. |
| Persistence | MySQL default for shared deployments. |
| Player-data migration | Migrate existing CSS player data. Bara remains the gameplay baseline. |
| Reports | Panorama incident/player selection, then privately capture a chat reason with cancel and timeout. |
| Client acceptance | User can arrange two receiving CS2 clients/testers when staging is ready. Prepare a reproducible script. |
| CSS additions | Only Cluster and Tripwire. Do not add CSS cosmetics or special rounds. |
| Configuration | Typed per-plugin JSONC, legacy Bara/CSS configuration import/mapping, familiar command aliases. |
| Work tracking | GitHub Issues in `s2script/s2s-ttt`, with the five default triage labels. |
| Agent instructions | Approved root `AGENTS.md`; single domain context and ADR directory. |

The specification is published as [GitHub Issue #1](https://github.com/s2script/s2s-ttt/issues/1). The user confirmed shared understanding with "go" on October 1, 2026. Implementation is authorized. Source versions and API facts are recorded separately in `docs/research/`.
