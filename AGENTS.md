# Repository conventions

Keep one root npm/s2s workspace and one lockfile. Use native s2s commands for builds, versioning and registry publication. Keep product behavior changes separate from workspace maintenance.

Retain tests for essential behavior. Remove temporary and incidental structure tests after they serve their purpose. MAUL's source is public; its registry distribution must remain restricted.

## Agent skills

### Issue tracker

Before issue operations, read `docs/agents/issue-tracker.md`: use GitHub Issues in `edgegamers/edgegamers-s2s`.

### Triage labels

Before triage, read `docs/agents/triage-labels.md`: use the five default role labels.

### Domain docs

Before domain exploration, read `docs/agents/domain.md`: one root glossary and `docs/adr/` for consequential decisions.
