## Summary

Describe what changed and why.

## Plugins affected

- [ ] No publishable plugin behavior changed
- [ ] Plugin list:

## Validation

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] Tested on a local development artifact bundle, when applicable

## Release intent

- [ ] No public plugin behavior or contract changed
- [ ] Added a patch, minor, or major Changeset for every affected public plugin
- [ ] Breaking behavior, configuration, and interfaces are documented
- [ ] Any `private: true` -> `private: false` transition is a separate public-promotion change with a Changeset and platform review
- [ ] No public plugin is directly deleted or changed to `private: true`; retirement is staged through deprecation and a platform-reviewed yank

## Deployment

- [ ] No server deployment is required
- [ ] Development bundle testing is complete when applicable
- [ ] Registry publication will occur through the reviewed version PR and `main` promotion
