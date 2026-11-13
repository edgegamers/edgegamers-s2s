# Repository conventions

Keep one root npm/s2s workspace and one lockfile. Use native s2s commands for builds, versioning and registry publication. Keep product behavior changes separate from workspace maintenance.

Retain tests for essential behavior. Remove temporary and incidental structure tests after they serve their purpose. MAUL's source is public; its registry distribution must remain restricted.

## Player-facing text

Before adding, changing or reviewing player-facing messages, command feedback, translation keys or chat renderers in any plugin or bundle member, read and follow [the translation and chat standard](docs/translations/STYLE.md). Apply the same review to messages introduced by merges and upstream updates.

Keep owned chat text in registered, editable phrase files. Use the guide's key schema, semantic colors, recipient-language lookup and output boundaries. Its TTT prefix and role colors, legacy MAUL leadership wrappers and Decluttr player markers are deliberate exceptions to the general system-prefix rule.

For each affected message, verify the key exists, its placeholders match the caller, its audience is preserved and its destination uses the correct presentation. Include dynamic keys, nested phrases and locale overrides. Preserve literal player/map/config text and stable protocol identifiers. Follow the validation workflow in [CONTRIBUTING.md](CONTRIBUTING.md) before submitting.

## Agent skills

### Issue tracker

Before issue operations, read `docs/agents/issue-tracker.md`: use GitHub Issues in `edgegamers/edgegamers-s2s`.

### Triage labels

Before triage, read `docs/agents/triage-labels.md`: use the five default role labels.

### Domain docs

Before domain exploration, read `docs/agents/domain.md`: one root glossary and `docs/adr/` for consequential decisions.
