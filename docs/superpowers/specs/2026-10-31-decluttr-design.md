# Decluttr

The user approved the feature and behavior decisions in this chat and requested implementation after s2script PR 330 was released. Decluttr is one independently configurable CS2 cleanup plugin, `@edgegamers/decluttr`, using SDK 0.35.0 and runtime v0.10.1 or newer.

## Scope

Include M1–M10: independent player/bot radio, grenade callout, wheel, full/sound-only ping, map chat all/per-map word filtering, stock team/disconnect notifications, money/friendly-fire/saved/chicken notifications, bomb HUD/audio/plant/defuse notifications, and custom TextMsg/HintText/RadioText filters.

Include W8–W11: radar, all/self-only killfeed, teammate overhead tags (all/through walls/distance), and first-person legs. Include S1–S6: MVP/round-end music, footsteps, landing, all/team-hit knife sounds, muted/replaced gunshots, configurable global sound-event filters. Preserve useful upstream modes.

Include advertising filters in chat and names, custom chat/prefix/join/grenade templates, dead-chat policy, and suppression of any message whose first non-space character is `/` or `!`. Registered commands still execute. No command execution blocking and no name-change rate protection.

All feature switches start disabled. Only `/legs` is a player preference: when enabled by config, an unset preference is hidden and native clientprefs stores the choice across connections/maps. Other options are server-controlled. Failed cookie admission retains the session choice, reports failure, and retries while the same connection remains valid.

Advertising rejects offending chat with a private sender notice. Staff with configurable flags receive name, SteamID and attempted text, limited by a per-offender configurable 10-second default alert cooldown. Name filtering independently substitutes `Player` (configurable) and alerts staff. IP/domain allowlists apply to both. Staff alerts and dead-chat access have separate flag settings, both default `b`.

During active rounds ordinary living players cannot hear dead/spectator chat; dead/spectators hear public chat from everybody. Configured staff bypass the life restriction, never the team boundary. Warmup/between-round public chat is open. TTT private role channels retain their owner and entitlements.

Suppressed stock join/grenade messages may have independently enabled replacement templates. First-party replies use the existing recipient-language phrase system and approved `Feature » Message` style. Operator templates and player-supplied text are not translated; untrusted names/text cannot inject template/color control syntax.

## Approach

Use one plugin with configuration, chat/moderation, native effects, preference/lifecycle wiring, and a small typed optional integration interface. A bundle would introduce independent lifecycles without a user need; rewriting each game mode independently would duplicate policy and configuration. The approved approach is the standalone plugin cooperating with existing owners.

Decluttr handles normal native chat/killfeeds only where a known game-mode owner does not own them. TTT explicitly invokes its filter/formatter and intersects its private killfeed recipients. Jailbreak GunGame intersects its existing recipients; Decluttr detects its active day through the existing optional specialdays interface. MAUL sanitizes its managed names through Decluttr before applying/reapplying them, preserving its original desired name and avoiding corrective rename loops. Optional provider watches handle late load/unload; Decluttr is never required for other products to run.

## Lifecycle and boundaries

Config reload is ROOT/server-console by default, configurable by flags. Parse and validate the complete candidate before effects; reject invalid reloads and retain the last working settings. Restore cvars/render/music changes on disable/unload only when the value still equals Decluttr's last applied value. Refresh map-scoped state on map changes. Connection/pawn identity checks prevent slot/entity reuse effects.

Use the root npm/s2s workspace, one lockfile, native builds, and changesets. Preserve existing uncommitted translation work and MAUL restricted distribution. New TypeScript is an independent implementation of the referenced plugin behavior, with attribution; do not copy unlicensed C# source. Do not publish or deploy as part of this request.

## Verification

Retain behavior tests for config validation/reload, filters/allowlists and staff permissions, command execution with hidden chat, team/life visibility, private owner routing, killfeed intersections, native message edits, cvar restoration, cookies/reconnect/slot reuse and render ownership. Build every runtime plugin and run root `npm run check`. Receiving-client tests for own legs, ping audio/marker separation, knife attribution, gunshot replacement and music remain live CS2 acceptance checks and must be reported separately.
