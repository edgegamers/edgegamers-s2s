---
"@edgegamers/s2s-maul": patch
---

Route non-leaders' `%` messages to leadership from all and team chat, with a sender echo. Support leaders' `%%target message` private messages in both channels, checking the private alias before the single-prefix route as in s2script basechat PR #359. Preserve leaders' existing `%` audiences and Dedicated Supporter chat behavior.
