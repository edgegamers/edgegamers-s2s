# Changelog

## 1.3.3 — 2026-10-26

- Update to s2script SDK 0.33.0 and CS2 types 0.22.0.
- Add CI that tests, typechecks, builds, and uploads installable artifacts.
- Publish to the s2script registry on matching version tags or manual dispatch,
  using the `S2SCRIPT_TOKEN` GitHub Actions secret.
- Add registry source packaging and repository metadata. Gameplay and clientprefs
  behavior are unchanged.
- Publish as `@edgegamers/s2s-hide` for the organization-scoped deploy token, and
  package the SDK's scoped artifact filename in the install ZIP.

## 1.3.2-s2s.1 — 2026-10-11

- Initial s2script port of edgegamers/CS2-HidePlayers 1.3.2, with native clientprefs,
  per-viewer transmit filtering, English/Russian messages, and behavioral tests.
