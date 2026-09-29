# CI integration

Two ready-to-use GitHub Actions workflows live in [`docs/examples/`](../examples/). Both just call the same CLI you already use locally; there is nothing CI-specific about `setup-doctor` itself.

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

## A note on `npx setup-doctor@latest`

Both examples pin to `@latest` explicitly rather than letting `npx` resolve an unpinned `setup-doctor`, so a CI run always uses the newest published version without you needing to bump anything by hand. If you would rather pin an exact version for reproducibility, replace `@latest` with a specific version number and update it deliberately when you want to pick up changes.

## Running against a monorepo subdirectory

Both `doctor` and `badge` accept a path as their first positional argument, so you can point CI at a specific package rather than the repo root:

```bash
npx setup-doctor doctor packages/api --ci --fail-under 80
```

Combine with `--config` (see [`config.md`](config.md)) if different subdirectories should use different rule configurations.
