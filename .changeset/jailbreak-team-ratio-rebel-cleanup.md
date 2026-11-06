---
"@edgegamers/jailbreak-core": patch
"@edgegamers/jailbreak-guards": patch
"@edgegamers/jailbreak-warden": patch
"@edgegamers/jailbreak-rtd": patch
"@edgegamers/jailbreak-specialdays": patch
---

Enforce guard queue rules through native team requests and default to three prisoners per guard.
Account for both teams changing size when filling and trimming guards, preventing overfilled
queues and unnecessary transfers on round end. Clear rebel model and screen tints on death and
round end, and prevent post-round damage from reapplying red before the next round.

Clear special-treatment green model/screen tint and no-warden blue at round boundaries.
Expire RTD and special-day colors/transparency without requiring respawn, restoring only
the pawns tinted by those effects.
