# CI integration

Four ready-to-use GitHub Actions workflows live in [`docs/examples/`](../examples/), a listed [GitHub Marketplace Action](https://github.com/marketplace/actions/setup-doctor) wraps the most common one, and a real [`.pre-commit-hooks.yaml`](../../.pre-commit-hooks.yaml) manifest lives at the repository root for local pre-commit hooks. All of them just call the same CLI you already use locally; there is nothing CI-specific about `setup-doctor` itself.

## The Marketplace Action: the quickest way to gate a pull request

[`saxenakapil/setup-doctor-action`](https://github.com/saxenakapil/setup-doctor-action) is a small composite Action that installs and runs `setup-doctor` for you, with CLI flags mapped to Action inputs and the score/band exposed as Action outputs:

```yaml
name: setup-doctor gate

on:
  pull_request:

jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: saxenakapil/setup-doctor-action@v1
        with:
          fail-under: 75
```

This is the same result as the hand-written `ci-gate-workflow.yml` below, just without writing the `actions/setup-node` step yourself. `path`, `agent`, `scope`, `compare` and `min-severity` inputs are also available; see the Action's own [README](https://github.com/saxenakapil/setup-doctor-action#readme) for the full list, including the `score`/`band` outputs other steps in your job can read.

The Action wraps only the single-run "gate" workflow; the score-history, PR-comment and badge workflows below are still hand-written YAML you copy in, not (yet) wrapped by the Action.

## Gate a pull request on score

Copy [`docs/examples/ci-gate-workflow.yml`](../examples/ci-gate-workflow.yml) to `.github/workflows/setup-doctor-gate.yml`:

```yaml
name: setup-doctor gate

on:
  pull_request:

jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx setup-doctor@latest doctor --ci --fail-under 75
```

`--ci` disables color and any interactive behavior for stable log output; `--fail-under 75` fails the job (exit code 1) if the score drops below 75. Adjust the threshold to match the score your project currently has, then ratchet it up over time as you fix findings: start at a number you can pass today, not an aspirational one, or the gate just becomes noise everyone ignores.

If you use a [`.setupdoctorrc`](config.md) to disable a rule or tune a threshold, no extra CI configuration is needed: the CLI reads it from the project root the same way it does locally, since it is running the exact same command.

## Track score history and gate on regressions

`--ci` alone appends one line to a local `.setupdoctor-history.jsonl` every run (never on a plain local `doctor` run, only under `--ci`); `--compare` reads it back and reports the delta since the last recorded run, and combined with `--ci` also fails the job on any drop, even one `--fail-under`'s fixed threshold wouldn't catch:

```bash
$ npx setup-doctor doctor --ci --compare
Setup Doctor  score 82/100  (Good)   rules v1.0.0
...
Score history: 88 -> 82 (-6) since 2026-09-20T14:03:11.000Z
$ echo $?
1
```

CI runners are ephemeral by default: without persisting `.setupdoctor-history.jsonl` between runs, `--compare` would only ever see "no previous run recorded" and never actually catch anything. Copy [`docs/examples/score-history-workflow.yml`](../examples/score-history-workflow.yml) to `.github/workflows/setup-doctor-history.yml`, which caches it with [`actions/cache`](https://github.com/actions/cache):

```yaml
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: actions/cache@v4
        with:
          path: .setupdoctor-history.jsonl
          key: setup-doctor-history-${{ github.repository }}-${{ github.run_id }}
          restore-keys: setup-doctor-history-${{ github.repository }}-
      - run: npx setup-doctor@latest doctor --ci --compare
```

The cache `key` includes `github.run_id`, not just the repository name: `actions/cache` only ever saves once for a fixed, unchanging key (a cache hit skips the save step entirely, so a fixed key would silently freeze the history at whatever its first run recorded and never actually grow). Every run getting its own key means every run always saves, and `restore-keys` falls back to the most recent entry under the shared prefix so every run still restores the latest history before appending to it. This is a real, previously-shipped-broken pattern, not a hypothetical: it was found while researching the PR-comment workflow below. That workflow ended up not depending on this cache at all, for exactly this staleness reason (see its own notes), but this history feature is real and shipped on its own, so the fix belongs here regardless.

`.setupdoctor-history.jsonl` is in this project's own `.gitignore` and should be in yours too: it is local run history, not something to commit, and `actions/cache` (or your own CI's persistent cache/volume) is what carries it between runs instead.

## Comment on a pull request with the score change

Copy [`docs/examples/pr-comment-workflow.yml`](../examples/pr-comment-workflow.yml) to `.github/workflows/setup-doctor-comment.yml`:

```yaml
name: setup-doctor PR comment

on:
  pull_request:

permissions:
  pull-requests: write

jobs:
  comment:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Score the base branch
        run: |
          git worktree add /tmp/setup-doctor-base ${{ github.event.pull_request.base.sha }}
          npx --yes setup-doctor@latest doctor /tmp/setup-doctor-base --ci --format json > base-report.json || true
      - name: Score this pull request
        run: npx --yes setup-doctor@latest doctor --ci --format json > head-report.json || true
      - name: Post or update the PR comment
        uses: actions/github-script@v7
        with:
          script: |
            # see docs/examples/pr-comment-workflow.yml for the real script
```

This scores both sides directly in the same job, checking out the PR's real base commit into a `git worktree` alongside the already-checked-out PR head, rather than reading back a score cached from some earlier workflow run. Both approaches were considered; the cached-score approach was rejected specifically because of the cache-staleness bug documented above -- scoring both branches fresh in the same job means the comparison is always against the real, current base branch, with nothing to keep in sync and nothing that can go stale.

A real run posts (and, on the next push to the same PR, updates in place rather than duplicating) a comment like this:

```
### Setup Doctor

Base: **90/100** (Excellent)
This PR: **89/100** (Good)

**Change: -1**

Findings in this PR: 2 (critical 0, high 1, medium 0, low 1)

<details><summary>Critical and high findings</summary>

- **MCP-01** .mcp.json: MCP server demo uses command does-not-exist-binary which was not found on PATH

</details>

_Updated automatically by [setup-doctor](https://github.com/saxenakapil/setup-doctor) on every push to this PR._
```

The comment is found and updated in place on every push to the PR (matched by a hidden HTML marker in the comment body), not reposted from scratch, so a long-lived PR does not accumulate a growing pile of stale score comments.

This is informational only: the job never fails on a score drop (that is `setup-doctor gate`'s job, above; combine both if you want a hard gate and a readable summary together). If a branch has nothing for `setup-doctor` to check at all (no supported agent's config found), the comment says so instead of a raw error -- this really happens, for example when the base branch predates any agent config existing, and was verified directly rather than assumed.

**Fork pull requests get a read-only `GITHUB_TOKEN` by default**, regardless of the `permissions:` block above; this is GitHub's own security default for `pull_request`-triggered workflows, not something this workflow can opt out of. The scoring steps still run either way; the comment step is simply skipped for a fork PR rather than failing loudly. If you need this to work for fork PRs too, the standard alternative is `pull_request_target`, which runs with the base repository's own privileges against a PR you do not control -- a real, well-known risk if that job does anything beyond scoring and commenting (for example, if it were changed to run a script from the PR's own files). Not switched to by default here for that reason.

## Publish a live badge from your own CI

Copy [`docs/examples/badge-workflow.yml`](../examples/badge-workflow.yml) to `.github/workflows/setup-doctor-badge.yml`:

```yaml
name: setup-doctor badge

on:
  push:
    branches: [main]

permissions:
  contents: write

jobs:
  badge:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx setup-doctor@latest badge --endpoint --out badge-out --yes
      - name: Publish the badge file to the badges branch
        run: |
          git config user.name "github-actions"
          git config user.email "github-actions@users.noreply.github.com"
          git checkout --orphan badges
          git rm -rf . > /dev/null 2>&1 || true
          cp badge-out/setup-doctor-badge.json .
          git add setup-doctor-badge.json
          git commit -m "Update Setup Doctor badge"
          git push -f origin badges
```

This publishes the shields.io [endpoint JSON](https://shields.io/badges/endpoint-badge) format (`--endpoint`) to an orphan `badges` branch on every push to `main`, so your badge stays current without you ever running the command by hand. Reference it in your README:

```md
![Setup Doctor score](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/<owner>/<repo>/badges/setup-doctor-badge.json)
```

This is exactly the pattern this repository uses for its own badge (see the top of the main [`README.md`](../../README.md)), except this project's badge is a static, manually-regenerated SVG rather than the live endpoint version: the choice between the two is about how often you want your badge to update automatically versus how much CI write-access you want to grant, not a difference in what the tool supports. `permissions: contents: write` is required for the push step; scope it narrowly if your repository's default permissions are broader than this workflow needs.

## Run it as a local pre-commit hook

This repository ships a real [`.pre-commit-hooks.yaml`](../../.pre-commit-hooks.yaml) manifest, so `setup-doctor` works with the [pre-commit](https://pre-commit.com) framework the same way any other pre-commit-compatible tool does. Add it to your own `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: https://github.com/saxenakapil/setup-doctor
    rev: v0.1.0
    hooks:
      - id: setup-doctor
        args: [--fail-under, '75']
```

Then `pre-commit install` once, and it runs on every `git commit`. The hook itself never bakes in a threshold; `--fail-under` (or any other `doctor` flag) is passed the same way any pre-commit hook takes `args`, so you set it per repo, not per hook definition. Without `args`, the hook still runs and prints the report, it just never fails the commit on its own (the same as running `doctor --ci` with no threshold by hand).

It always runs on the whole project, not per staged file (`pass_filenames: false`, `always_run: true`): `doctor` audits your whole agent setup, not individual files, so passing it a list of staged filenames the way most pre-commit hooks do would be meaningless, and was confirmed to actually break the CLI's own path argument during testing (the first staged filename would be read as the project path to scan) before `pass_filenames: false` was added.

Verified against a real local install of the `pre-commit` framework, not just read against its documentation: a scratch project referencing this repository (via `pre-commit try-repo`, at a real commit) ran the hook end to end, printed a real report, passed with no threshold set, and correctly failed the commit (exit 1) once `args: [--fail-under, '99']` was added and the real score came in under it.

`rev` should always be a real tag (like `v0.1.0` above) or commit SHA, never a branch name: pre-commit caches the hook environment by `rev`, so a floating branch reference would silently keep running whatever code was current the first time you ran it.

## A note on `npx setup-doctor@latest`

Both examples pin to `@latest` explicitly rather than letting `npx` resolve an unpinned `setup-doctor`, so a CI run always uses the newest published version without you needing to bump anything by hand. If you would rather pin an exact version for reproducibility, replace `@latest` with a specific version number and update it deliberately when you want to pick up changes.

## Running against a monorepo subdirectory

Both `doctor` and `badge` accept a path as their first positional argument, so you can point CI at a specific package rather than the repo root:

```bash
npx setup-doctor doctor packages/api --ci --fail-under 80
```

Combine with `--config` (see [`config.md`](config.md)) if different subdirectories should use different rule configurations.
