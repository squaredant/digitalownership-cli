# GitHub Actions Release Evidence (Beta)

This untested beta workflow registers one archive of the source code for a
published GitHub Release. It is useful when a team wants an independent record
for a selected release tag. It is not intended for every commit, build log, or
pipeline event.

## When It Runs

The workflow runs only when a GitHub Release is published. It does not run on
ordinary commits or pushes.

In the repository where you copied the workflow:

1. Open **Releases** on GitHub.
2. Create a release from the tag you want to preserve.
3. Choose **Publish release**.

GitHub then starts this workflow for that published tag. Use a test tag and
test repository first, because each successful registration spends one credit.

The workflow creates a ZIP directly from the published Git tag, registers that
ZIP with the DigitalOwnership CLI, and uploads these private workflow artifacts:

- `release-source-<tag>.zip`: the exact source archive that was registered;
- `release-source-<tag>.digitalownership.json`: the private registration
  receipt; and
- `registration-result.json`: the CLI result captured during the run.

The archive and receipt must be retained together. The receipt alone cannot
verify a later copy of the source archive.

## Before You Enable It

1. Create a DigitalOwnership account and a pipeline integration with
   registration read/write access.
2. Add the integration credential, beginning with `do_pi_`, to the repository
   or protected GitHub Environment as the secret
   `DIGITALOWNERSHIP_PIPELINE_CREDENTIAL`.
3. Copy [release-evidence.yml](release-evidence.yml) to the repository you want
   to protect, at `.github/workflows/digitalownership-release-evidence.yml`.
4. Replace `<immutable-cli-commit>` with a specific released DigitalOwnership
   CLI Git commit. Do not use `main` or another moving branch.
5. Review who may publish GitHub Releases and who may change workflow files.
   `--approval none` is authorised unattended automation: it spends one credit
   without a person approving each individual registration.

Place the copied file at the root of the repository you want to protect:

```text
.github/workflows/digitalownership-release-evidence.yml
```

The workflow file must be present on the default branch before the GitHub
Release is published.

## What It Registers

The workflow checks out the release tag and uses `git archive` to create the
ZIP. This avoids `.git` data and temporary GitHub runner files. A matching
verification supports that this exact source archive was registered no later
than the blockchain time recorded in its receipt.

It does not establish authorship, copyright ownership, code quality, or build
reproducibility. Register a separate build artifact when the released binary
or container image also needs its own evidence record.

## Evidence Retention

GitHub Actions artifacts expire. The beta workflow sets a 90-day retention
period only to make the first test easy to inspect. Download the ZIP and JSON
receipt after a successful run and retain them in the organisation's controlled
evidence location. They are not committed to Git and do not enlarge repository
history.

After testing, a later version can add a reviewed release-asset or external
archive retention step. Do not rely only on a GitHub Actions artifact for
long-term evidence.

## Test Safely

Test first in a non-production repository and release tag with a small source
tree. Confirm that the workflow produces all three artifacts, then download the
ZIP and receipt and run a local `digitalownership verify` command with the
account email in the receipt.
