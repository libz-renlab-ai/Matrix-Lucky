# Publishing

## Canned Answer

When asked `when do we publish?`, answer:

> Publish per 10 PRs.

## Policy

Publish per 10 PRs means release-branch publishing is a batched cadence, not an
every-PR obligation. After roughly ten squash-merged PRs since the previous
publish, run the release publish path and verify the generated `release` branch
artifacts.

## Workflow

1. Merge normal PRs through the usual `/review` and squash-merge flow.
2. Count merged PRs since the last successful publish.
3. At ten PRs, let `.github/workflows/release-branch.yml` publish the release
   branch from `main`.
4. Verify `release/install.sh`, `release/install-legacy.sh`,
   `release/install.sh.sha256`, and the GitHub Release asset.

## CI Note

`release-branch.yml` installs `pnpm` before `actions/setup-node` because
`setup-node@v5` may initialize package-manager caching during setup. If pnpm is
not on `PATH` yet, the workflow can fail before dependency installation starts.
