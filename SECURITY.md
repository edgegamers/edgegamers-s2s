# Security policy

## Report a vulnerability

Use [GitHub's private vulnerability reporting](https://github.com/edgegamers/edgegamers-s2s/security/advisories/new). Private reporting is enabled for this repository. Do not disclose exploit details, credentials or personal information in public issues or pull requests.

Include the affected plugin and version, expected impact, reproduction steps, relevant host/framework versions and a minimal proof of concept where possible. Remove real tokens, MAUL keys, player identifiers and unrelated server data from logs. Maintainers will coordinate a fix and disclosure with the reporter.

## Supported versions

Security fixes target the latest maintained release of each product. Older versions may require an upgrade. Report a finding even if you are unsure which versions it affects.

## Credentials and publication

- Store registry publishing credentials in the `S2SCRIPT_TOKEN` Actions secret. Give install-only servers a separate read-only token.
- Keep MAUL service keys in server configuration. Rotate exposed credentials; removing a value from the latest source does not revoke it.
- MAUL source visibility and registry distribution are separate. Its source is public and its registry downloads must remain restricted.
- Verify package identity, version and access before the first publication. Registry access is fixed on first publication; a manifest change does not retroactively make an existing public package restricted.
- Pull-request checks use no publishing token. Registry publication runs only from the trusted `main` release workflow.

For general bugs and support, use [GitHub Issues](https://github.com/edgegamers/edgegamers-s2s/issues).
