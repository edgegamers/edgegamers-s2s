# ADR0013 — Player RDM reporting in the shop's Panorama HUD

Accepted October 6, 2026. Extends ADR0008's Reports ownership and ADR0012's private hudkit surfaces.

## Decision

The player side of RDM reporting uses the same private `observable:false` hudkit kit as the shop. Before this change it was chat-only: a three-line "Were you RDM'd?" offer answered with `!rdmyes`/`!rdmno`, chat outcomes, and `!report <player> <reason>`. The admin `!rdm` queue was already a hudkit sheet and is unchanged.

- **Victim prompt.** A fourth pooled modal (the stock pool has six) shows the killer with **Report** and **Not RDM**. Report accepts the offer. Not RDM declines it. An unanswered offer closes its sheet at the existing 45-second expiry.
- **Picker.** Bare `!report` opens the same modal in picker mode. It lists other connected players by name only, so it cannot reveal concealed deaths, roles or bots. Report starts the reason capture directly, under the same Core privacy fence as an accepted offer.
- **Reason.** Chat still carries the text, because hudkit has no text entry. While the reason is being captured, an explicitly claimed callout replaces the sheet for at most the 120-second window. Filed, duplicate, rate-limited, failed, cancelled and expired outcomes are toasts.
- **Fallback.** Reports asks Core to present each step (`presentReportPlayer`). Core returns true only when the UI accepted the surface. Otherwise Reports sends the original chat phrase, so a missing UI owner, an exhausted pool or a refused claim still leaves a working chat flow. `!rdmyes`, `!rdmno` and `!report <player> <reason>` remain.

Both modal modes share one footer handler set; the press reads the player's current mode. Report state stays in Reports; UI keeps only per-viewer presentation. Every action revalidates the reporter and painted target connection in Core and again in Reports.

## Contracts

- Reports adds `beginReport`.
- Core's report gateway adds `presentReportPlayer`.
- Core's UI model adds `answerUiReportPrompt`, `getUiReportTargets` and `beginUiReport`.
- UI adds `openReportPrompt`, `openReportPicker` and `reportNotice`.

The mirrored wire declarations change, so rebuild Core, Reports, UI and the staging probe as one matched set.

## Evidence and limits

Workspace tests cover the HUD/chat fallback split, picker filing, refusal of stale or self targets, and offer expiry. They cover footer routing through the vendored stock hudkit and the Core-to-Reports-to-UI round trip. The stock-hudkit fixture has no native surface-ownership host, so there it verifies that a refused callout reports failure, which is what triggers the chat fallback. Rendering, cursor and chat-typing behaviour with the sheet and callout still require the receiving-client checks in the [two-client acceptance script](../testing/two-client-acceptance.md).
