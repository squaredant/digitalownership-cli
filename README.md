# DigitalOwnership CLI

DigitalOwnership CLI is a terminal program for local document fingerprinting,
account-linked blockchain registration, and independent verification. It is
designed for shell scripts, Python, R, Java, CI systems, and report-generation
pipelines.

Files remain local. The CLI sends only a fingerprint, required registration
metadata, and authentication material; it never uploads the document itself.

## First Release

This release supports local fingerprints, public verification, account-linked
registration, five-minute access tokens, browser approval when required, and
archive copies with JSON receipts compatible with the Mac app and LibreOffice
extension.

Wallet signing adapters, batch manifests, registration-history listing, and
signed outbound webhooks are not included in this release.

## Install As A Terminal Program

The first release is distributed through GitHub rather than the npm registry.
Install Node.js 20 or later, then run:

```sh
git clone https://github.com/squaredant/digitalownership-cli.git
cd digitalownership-cli
npm ci
npm link

digitalownership --help
digitalownership fingerprint ./report.pdf
```

`npm link` places `digitalownership` on the terminal `PATH`. To remove it:

```sh
npm unlink -g @squaredant/digitalownership-cli
```

For development without a global link, replace `digitalownership` in the
examples with `node bin/digitalownership.js`.

## Account Setup

1. Create and sign in to a DigitalOwnership account.
2. On the Account page, open **Developer tools** and create a pipeline
   integration with registration read/write access.
3. Store the one-time `do_pi_...` credential in an OS keychain, CI secret
   store, or protected local secret store. Do not commit it or put it in a
   notebook, report, command history, or shared `.env` file.
4. Exchange it for a current five-minute `do_at_...` access token when the
   pipeline runs.

```sh
export DIGITALOWNERSHIP_REGISTRY_ADDRESS='0xf495d81eb4A64d213f6BAC2bD23EE9A147956169'
export DIGITALOWNERSHIP_CHAIN_ID='0xa4b1'
export DIGITALOWNERSHIP_PIPELINE_CREDENTIAL='do_pi_...'

# Prints JSON containing a five-minute do_at_... access token.
digitalownership token
export DIGITALOWNERSHIP_PIPELINE_TOKEN='do_at_...'
```

### Verification Endpoint

`DIGITALOWNERSHIP_VERIFICATION_URL` is the public endpoint used by
`digitalownership verify` and `digitalownership doctor`. It receives the local
fingerprint, and the registration email only when `--email` is supplied; it
does not receive the file.

It defaults to the production endpoint, so no setting is required for normal
use:

```sh
# Default: https://digitalownership.squaredant.com/api/verify/hash
digitalownership verify ./DigitalOwnershipArchive/report.registered.pdf \
  --email owner@example.com
```

Set it only to use a separately deployed environment or a local test service.
The command-line `--verification-url` option overrides the environment
variable for one command.

```sh
export DIGITALOWNERSHIP_VERIFICATION_URL='https://verification.example.org/api/verify/hash'
digitalownership doctor

# One-command override; does not change the environment.
digitalownership verify ./report.pdf \
  --verification-url 'https://verification.example.org/api/verify/hash'
```

The integration credential remains valid until revoked. The access token lasts
five minutes. Each integration credential can have at most five valid access
tokens; issuing a sixth revokes its oldest valid token. When `--wait` is used,
the CLI can refresh an expired access token only if the protected integration
credential is also available.

## Commands

### Fingerprint

```sh
digitalownership fingerprint ./report.pdf
digitalownership fingerprint ./out/final-report.rds
```

The CLI returns a SHA-512 fingerprint and immutable hash scope:

- `digitalownership-content-v1`: supported ODF and OOXML packages.
- `digitalownership-pdf-file-v1`: complete PDF bytes.
- `digitalownership-exact-file-v1`: exact-file formats such as `.txt`, `.csv`,
  `.json`, `.rds`, `.parquet`, `.hdf5`, `.duckdb`, `.pkl`, and `.npy`.

Exact-file formats are hashed byte-for-byte. Any edit, conversion, or resave
produces a different fingerprint.

### Verify

```sh
# Email-linked registration: provide the registration email.
digitalownership verify ./DigitalOwnershipArchive/report.registered.pdf \
  --email owner@example.com

# Wallet registration: omit --email.
digitalownership verify ./report.pdf
```

Verification hashes the file locally and checks the public verification
service at `DIGITALOWNERSHIP_VERIFICATION_URL` (or the production default). A
confirmed result contains `verified: true` and the final `registryKey`. Verify
the registered archive copy whenever one exists.

### Check Connectivity And Credits

```sh
digitalownership doctor
digitalownership balance
```

`doctor` is non-mutating. `balance` is an advisory credit check; the server
reserves the credit when it processes a real registration.

### Unattended Account Registration

Use this only for an authorised automated pipeline:

```sh
digitalownership register ./out/final-report.json --account \
  --email owner@example.com --approval none
```

`--account` selects an account-linked registration through the
DigitalOwnership service. It uses the five-minute pipeline access token and
spends a credit from the account that owns that token. The server derives the
email-linked registry key from that authenticated account; it is not a wallet
registration flag. Wallet signing is not included in this CLI release.

The command waits for completion, creates a read-only archive copy in
`DigitalOwnershipArchive`, and writes a `digitalownership-local-record-v1`
receipt in `DigitalOwnershipArchive/.DigitalOwnershipRecords/`. `--email` must
be the email address of the account that owns the pipeline credential. The CLI
copies it to the local receipt as `accountEmail`, so the archive can later be
verified with the correct email. The server does not return the account email
through the pipeline API. Treat the receipt as private metadata when the email
is personal or otherwise confidential.

To control where the receipt is written, provide an explicit receipt path:

```sh
digitalownership register ./out/final-report.json --account \
  --email owner@example.com --approval none \
  --no-archive --receipt-out ./evidence/final-report.digitalownership.json
```

### Browser-Approved Registration

Use this when an account owner must approve one exact fingerprint:

```sh
# Waits for browser approval, completion, archive copy, and receipt.
digitalownership register ./out/final-report.pdf --account \
  --email owner@example.com --approval required --wait
```

Open the URL, sign in to the same account, inspect the fingerprint, scope, and
target, then choose **Approve registration and spend one credit**. If you did
not include `--wait`, rerun the same command **with** `--wait` to resume its
idempotent approval/job without creating a second registration.

## Python Example

```python
import json
import os
import subprocess

def digitalownership(*args):
    result = subprocess.run(
        ["digitalownership", *args], check=True, text=True, capture_output=True
    )
    return json.loads(result.stdout)

# DIGITALOWNERSHIP_PIPELINE_CREDENTIAL is injected by an OS keychain, CI secret
# store, or other protected environment; it is never written in this script.
token = digitalownership("token")
os.environ["DIGITALOWNERSHIP_PIPELINE_TOKEN"] = token["accessToken"]
registration = digitalownership(
    "register", "out/final-report.json", "--account", "--email",
    "owner@example.com", "--approval", "none"
)
print(registration["registration"]["result"]["registration"]["transactionHash"])

verification = digitalownership(
    "verify", registration["archive"]["archivePath"],
    "--email", "owner@example.com",
)
assert verification["verified"] is True
```

For human approval, replace `"none"` with `"required", "--wait"`.

## R Example

```r
# install.packages(c("jsonlite", "processx", "purrr"))
library(jsonlite)
library(processx)
library(purrr)

digitalownership <- function(...) {
  result <- processx::run(
    command = "digitalownership",
    args = c(...),
    error_on_status = FALSE
  )

  if (result$status != 0L) stop(result$stderr, call. = FALSE)

  result$stdout |>
    jsonlite::fromJSON(simplifyVector = FALSE)
}

# DIGITALOWNERSHIP_PIPELINE_CREDENTIAL is supplied by a protected environment.
token <- digitalownership("token")
Sys.setenv(DIGITALOWNERSHIP_PIPELINE_TOKEN = token |> 
  purrr::pluck("accessToken"))

registration <- digitalownership(
  "register", "out/final-report.rds", "--account", "--email",
  "owner@example.com", "--approval", "none"
)

registration |>
  purrr::pluck("registration", "result", "registration", "transactionHash") |>
  print()

archive_path <- registration |>
  purrr::pluck("archive", "archivePath")

verification <- digitalownership(
  "verify", archive_path,
  "--email", "owner@example.com"
)

verification |>
  purrr::pluck("verified") |>
  stopifnot()
```

## Security And Compatibility

- Pipeline integrations are separate from LibreOffice and Mac device links.
- The server stores hashes of integration credentials and access tokens, not
  their raw values.
- Account registration derives the registry key from the authenticated account.
  `--email` is local receipt metadata only: it is never sent to the server and
  must match the account that owns the pipeline credential.
- `--approval none` is authorised automation, not an individual electronic
  signature. `--approval required` adds a signed-in, five-minute approval.
- This release does not by itself establish GxP, EMA Annex 11, 21 CFR Part 11,
  or other regulated-workflow compliance.

## Development

These checks are for contributors. Run them from the root of the cloned
`digitalownership-cli` repository, after `cd digitalownership-cli` and
`npm ci`; do not run them from a data-pipeline project directory.

```sh
npm test
python3 test-vectors/scripts/verify-vectors.py
```

The public vectors define the fingerprint scopes. Existing vector values and
scope rules are immutable. The public CLI release also includes
`docs/pipeline-api.md` with API and database details.
