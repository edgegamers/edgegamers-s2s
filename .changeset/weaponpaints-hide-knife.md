---
"@edgegamers/s2s-weaponpaints": patch
---

A knife whose model is being changed is hidden from every client until the change has run and the finish is on. The queued ChangeSubclass always runs a tick after the give (server debug log), so clients drew the stock knife first and kept its stock finish under the new model, at random. Now a client's first sight of the knife is the finished one.
