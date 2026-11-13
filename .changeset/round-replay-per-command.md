---
"@edgegamers/round-replay": minor
---

Per-command sampling for OnPlayerRunCmdPost: several commands in one tick keep the last state and OR their buttons; `hold()` marks a tick with no command (STATE_NO_CMD) instead of dropping the player.
