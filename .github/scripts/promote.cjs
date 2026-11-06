module.exports = async function promote({ github, context, core }) {
  const repo = context.repo;
  const existing = await github.rest.pulls.list({
    ...repo, state: 'open', base: 'main', head: `${repo.owner}:dev`,
  });
  let pr = existing.data[0];
  if (!pr) {
    const comparison = await github.rest.repos.compareCommitsWithBasehead({ ...repo, basehead: 'main...dev' });
    if (comparison.data.ahead_by === 0) {
      core.notice('No dev changes are waiting for promotion.');
      return;
    }
    ({ data: pr } = await github.rest.pulls.create({
      ...repo, base: 'main', head: 'dev', title: 'Release tested dev changes',
      body: 'Promote all accumulated dev changes to the stable release flow.\n\nReview the successful dev release and live test results, then use **Create a merge commit**. Stable versions and registry publication are handled by the Release workflow after merge. Production servers are updated separately.',
    }));
  }
  core.notice(`Release PR: ${pr.html_url}`);
  // PRs opened with GITHUB_TOKEN do not trigger pull_request workflows themselves.
  await github.rest.actions.createWorkflowDispatch({
    ...repo, workflow_id: 'check.yml', ref: 'dev', inputs: { pull_request: String(pr.number) },
  });
};
