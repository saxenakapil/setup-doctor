# CI integration

`setup-doctor` runs the same way in CI as on your machine. This page covers ways to gate pull requests, track score history, comment on pull requests, publish a badge, and run it as a pre-commit hook.

## Options at a glance

| Goal | Approach | Section |
| --- | --- | --- |
| Fail a pull request below a score | GitHub Action, or a workflow with `--ci --fail-under` | [Gate a pull request](#gate-a-pull-request) |
| Fail a pull request on any score drop | `--ci --compare` with persisted history | [Track score history](#track-score-history-and-gate-on-regressions) |
| Show the score change on each pull request | Comment workflow | [Comment on a pull request](#comment-on-a-pull-request) |
| Keep a README badge current | Badge workflow | [Publish a badge](#publish-a-badge) |
| Run before each commit | pre-commit hook | [pre-commit](#run-it-as-a-local-pre-commit-hook) |

## Gate a pull request

### With the GitHub Action

[`saxenakapil/setup-doctor-action`](https://github.com/saxenakapil/setup-doctor-action) installs and runs `setup-doctor`, maps inputs to command-line options, and exposes the score and band as outputs.

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

Other inputs are `path`, `agent`, `scope`, `compare` and `min-severity`. The Action's [README](https://github.com/saxenakapil/setup-doctor-action#readme) lists them all.

### With a workflow

Copy [`docs/examples/ci-gate-workflow.yml`](../examples/ci-gate-workflow.yml) to `.github/workflows/setup-doctor-gate.yml`, or write the equivalent job:

```yaml
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

`--ci` disables color and prompts. The job fails with exit code 1 when the score is below `--fail-under`.

Set the threshold to a score your project passes today, then raise it as you fix findings. A threshold that fails every run gets ignored.

Configuration in `.setupdoctorrc` applies in CI without any changes, because the command reads it from the project root.

## Track score history and gate on regressions

`--compare` reports the change since the last recorded run, and `--ci --compare` also fails the job on any drop, including drops that stay above `--fail-under`.

```bash
npx setup-doctor doctor --ci --compare
```

```
Score history: 88 -> 82 (-6) since 2026-09-20T14:03:11.000Z
```

`--ci` appends one line to `.setupdoctor-history.jsonl` on each run. Local runs without `--ci` do not write to it.

CI runners start clean on every run, so the history file must be restored from a cache. Copy [`docs/examples/score-history-workflow.yml`](../examples/score-history-workflow.yml) to `.github/workflows/setup-doctor-history.yml`:

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

The cache key includes `github.run_id`. `actions/cache` saves only when the key misses, so a fixed key would never store the updated history. The `restore-keys` prefix restores the most recent entry on each run.

Add `.setupdoctor-history.jsonl` to your `.gitignore`. It is run history, not something to commit.

## Comment on a pull request

Copy [`docs/examples/pr-comment-workflow.yml`](../examples/pr-comment-workflow.yml) to `.github/workflows/setup-doctor-comment.yml`. The workflow scores the pull request's base commit and head commit in the same job, then posts a comment:

```
### Setup Doctor

Base: **90/100** (Excellent)
This PR: **89/100** (Good)

**Change: -1**

Findings in this PR: 2 (critical 0, high 1, medium 0, low 1)

<details><summary>Critical and high findings</summary>

- **MCP-01** .mcp.json: MCP server demo uses command does-not-exist-binary which was not found on PATH

</details>
```

The comment is updated in place on each push, identified by a hidden marker in its body.

The job never fails because of a score change. Combine it with the gate workflow if you want both a readable summary and a hard requirement.

Scoring the base commit fresh in the same job avoids reading a cached base score, which could be out of date.

### Fork pull requests

GitHub gives workflows triggered by pull requests from forks a read-only token, whatever the `permissions` block says. The scoring steps run, but the comment step is skipped for fork pull requests.

`pull_request_target` gives write access to fork pull requests, but it runs with the base repository's permissions. Use it only if the job never runs code from the pull request.

## Publish a badge

Copy [`docs/examples/badge-workflow.yml`](../examples/badge-workflow.yml) to `.github/workflows/setup-doctor-badge.yml`. It publishes a shields.io endpoint file to a `badges` branch on each push to `main`:

```yaml
jobs:
  badge:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx setup-doctor@latest badge --endpoint --out badge-out --yes
      # then publish badge-out/setup-doctor-badge.json to the badges branch
```

The workflow needs `permissions: contents: write` to push the `badges` branch. Reference the file from your README:

```md
![Setup Doctor score](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/<owner>/<repo>/badges/setup-doctor-badge.json)
```

A static badge, written with `npx setup-doctor badge`, needs no CI at all. See the [repository README](../../README.md#badge).

## Run it as a local pre-commit hook

This repository provides a [pre-commit](https://pre-commit.com) manifest. Add it to `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: https://github.com/saxenakapil/setup-doctor
    rev: v0.3.2
    hooks:
      - id: setup-doctor
        args: [--fail-under, '75']
```

Then run `pre-commit install` once. The hook runs on every commit.

- Without `args`, the hook prints the report and never fails the commit.
- `args` are appended to `doctor --ci`, so any `doctor` option works.
- The hook audits the whole project. It does not receive staged file names.
- Set `rev` to a tag or commit SHA, not a branch. pre-commit caches the hook environment by `rev`, so a branch name would keep running an old version.

## Pinning versions

The examples use `setup-doctor@latest`, so each run uses the newest release. To make runs reproducible, pin an exact version, such as `setup-doctor@0.3.2`, and update it when you choose.

## Audit a subdirectory

`doctor` and `badge` accept a path, so a monorepo can audit one package:

```bash
npx setup-doctor doctor packages/api --ci --fail-under 80
```

Combine with `--config` to give a package its own rules. See [configuration](config.md#using-a-different-configuration-file).
