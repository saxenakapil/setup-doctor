# CI integration

Two ready-to-use GitHub Actions workflows live in [`docs/examples/`](../examples/), and a real [`.pre-commit-hooks.yaml`](../../.pre-commit-hooks.yaml) manifest lives at the repository root for local pre-commit hooks. All of them just call the same CLI you already use locally; there is nothing CI-specific about `setup-doctor` itself.

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

CI runners are ephemeral by default: without persisting `.setupdoctor-history.jsonl` between runs, `--compare` would only ever see "no previous run recorded" and never actually catch anything. Cache it with [`actions/cache`](https://github.com/actions/cache), keyed so a cache miss never blocks the job:

```yaml
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: actions/cache@v4
        with:
          path: .setupdoctor-history.jsonl
          key: setup-doctor-history-${{ github.repository }}
          restore-keys: setup-doctor-history-
      - run: npx setup-doctor@latest doctor --ci --compare
```

`.setupdoctor-history.jsonl` is in this project's own `.gitignore` and should be in yours too: it is local run history, not something to commit, and `actions/cache` (or your own CI's persistent cache/volume) is what carries it between runs instead.

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
    rev: <a tag or commit SHA>
    hooks:
      - id: setup-doctor
        args: [--fail-under, '75']
```

Then `pre-commit install` once, and it runs on every `git commit`. The hook itself never bakes in a threshold; `--fail-under` (or any other `doctor` flag) is passed the same way any pre-commit hook takes `args`, so you set it per repo, not per hook definition. Without `args`, the hook still runs and prints the report, it just never fails the commit on its own (the same as running `doctor --ci` with no threshold by hand).

It always runs on the whole project, not per staged file (`pass_filenames: false`, `always_run: true`): `doctor` audits your whole agent setup, not individual files, so passing it a list of staged filenames the way most pre-commit hooks do would be meaningless, and was confirmed to actually break the CLI's own path argument during testing (the first staged filename would be read as the project path to scan) before `pass_filenames: false` was added.

Verified against a real local install of the `pre-commit` framework, not just read against its documentation: a scratch project referencing this repository (via `pre-commit try-repo`, at a real commit) ran the hook end to end, printed a real report, passed with no threshold set, and correctly failed the commit (exit 1) once `args: [--fail-under, '99']` was added and the real score came in under it.

This repository has no tagged releases yet; pin `rev` to a specific commit SHA until one exists, and switch to a tag once this project starts cutting them.

## A note on `npx setup-doctor@latest`

Both examples pin to `@latest` explicitly rather than letting `npx` resolve an unpinned `setup-doctor`, so a CI run always uses the newest published version without you needing to bump anything by hand. If you would rather pin an exact version for reproducibility, replace `@latest` with a specific version number and update it deliberately when you want to pick up changes.

## Running against a monorepo subdirectory

Both `doctor` and `badge` accept a path as their first positional argument, so you can point CI at a specific package rather than the repo root:

```bash
npx setup-doctor doctor packages/api --ci --fail-under 80
```

Combine with `--config` (see [`config.md`](config.md)) if different subdirectories should use different rule configurations.
