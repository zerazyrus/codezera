# Codezera PMS

This discovery stub loads the version-matched guide from the Codezera executable used for this session.

<!-- shared-omit: resolver -->

## Pick the Codezera command

PMS commands exist only in Codezera, never in Orca. Choose the executable once and reuse it:

- In a dev checkout whose session exposes `ORCA_DEV_REPO_ROOT`, use `orca-dev`.
- Otherwise use `codezera`. Do not use `orca`: outside Codezera's terminals it usually runs
  Orca, which has no `pms` commands.

Below, `ORCA` is a placeholder for the executable you picked. Substitute it before running
anything; do not create a shell variable or run `ORCA` literally.

If the selected executable cannot run, report its exact error and stop.

## Load the version-matched guide before running PMS commands

```text
ORCA skills get orca-pms
```

<!-- shared: no-guessing -->
