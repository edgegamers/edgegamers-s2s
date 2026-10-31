# Upstream snapshots

Fresh source imports; upstream Git history is not part of this repository. The fresh repository's existing root LICENSE is preserved. Each imported product retains its own license and attribution.

| Product | Upstream | Imported commit |
| --- | --- | --- |
| ttt | https://github.com/s2script/s2s-ttt | `626bb8713b002e8009c4de71868bb95e26fc1393` |
| surftimer | https://github.com/s2script/s2s-surftimer | `0c8263b760bd6fff459d6186de41d732b0707629` |
| jb | https://github.com/s2script/s2s-jb | `3e77b87f2cd04cae2aada7df6d238c2fae38daf6` |
| hide | https://github.com/ShookEagle/s2s-hide | `2cb26c74d45dd478797b5c63921631957252e670` |
| maul | https://github.com/GabeHirakawa/s2s-maul | `aaaaabb6cb2af2b4a092559805d28baf1449d3c7` |

Keep source changes in this repository. Select future upstream changes deliberately, then add changesets for affected release units. Superseded upstream install/release/agent configuration and historical engineering evidence are omitted; gameplay, required assets and useful product documentation are retained.

TTT upstream declares 2.0.0; public registry metadata on 2026-10-30 already contains 2.0.5 for its bundle and all ten members. Local baselines use 2.0.5 so the initial patch changeset publishes 2.0.6. Jailbreak and Hide baselines match public metadata. Anonymous 404 responses for MAUL, SurfTimer and Jailbreak guards do not establish name availability or absence; the first authenticated release must reconcile their current registry state.

The standalone Hide ZIP publisher and Jailbreak repository check wrapper are superseded by root native builds/checks and Changesets releases. They are omitted rather than maintained as additional release paths.
