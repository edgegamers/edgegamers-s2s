# Issue tracker

Use GitHub Issues in `edgegamers/edgegamers-s2s`. Before mutations, verify `gh repo view --json nameWithOwner` resolves to that repository.

Read with `gh issue view <number> --json number,title,body,labels,comments`; list with `gh issue list`. Create with `gh issue create --title <title> --body-file <file>`. Use `gh issue edit` for labels and `gh issue comment --body-file <file>` for comments. Post the resolution before closing an issue.

Use native sub-issues and issue dependencies when work requires them. Track a feature's spec and tasks in issues, and reference the relevant issue from its implementation.

PRs as a request surface: no.
