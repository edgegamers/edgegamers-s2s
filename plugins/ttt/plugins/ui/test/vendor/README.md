# Stock hudkit test fixture

`components-v0.7.0.js.gz` is the byte-identical `games/cs2/js/components.js` from
[official s2script commit be0a3e33041e921ec113203d4e14a22c996deab7](https://github.com/s2script/s2script/blob/be0a3e33041e921ec113203d4e14a22c996deab7/games/cs2/js/components.js),
compressed with gzip and a zero timestamp. It is used only by UI integration
tests; it is not bundled into the TTT plugin or deployed.

Uncompressed SHA-256: `bdc3998d39178b0ee4519a6b72db3be568e8f346f8bccf758a7d8c3a602f5cbd`.

The test checks the uncompressed SHA-256 before evaluation. Keeping the actual
stock implementation makes the suite exercise real modal click, paint,
invalidation, and teardown behavior offline. Native HUD drives are the test
boundary. When upgrading the framework, update this fixture and its hash
together after checking the affected behavior. The upstream MIT license is
included alongside it.
