# Batch promotion with low-precedence dev snapshots

Feature branches integrate into `dev`, and one `dev` to `main` PR promotes all accumulated work; the user selected this over individual feature promotion to keep the contributor workflow simple. Native s2s snapshots use `0.0.0-dev.<sequence>.g<commit>` while retaining authored interface versions, so dev servers can select prereleases explicitly and stable package versions retain greater precedence.

Snapshot manifests remain temporary CI files, preserving stable changesets for promotion. A leased publication checkpoint and immutable restart-event tags keep failed uploads and restart delivery retryable without putting generated dev versions on either source branch; this requires the native SDK snapshot operation before automatic dev publication is enabled.
