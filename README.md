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

The CLI can create a publication manifest from an existing exact-file receipt
for the separately documented web-publication verification workflow. See the
[publication-manifest schema](test-vectors/schemas/publication-manifest.v1.schema.json),
[synthetic example](test-vectors/publication-manifest.v1.example.json), and
[web publication quick start](examples/web-publication/README.md), and
[publisher workflow](docs/web-publication-verification.md).

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

### Advanced Configuration

Verification uses the DigitalOwnership production service by default. Set
`DIGITALOWNERSHIP_VERIFICATION_URL` or pass `--verification-url <url>` only
for a separate deployment or local test service. See
[the pipeline API guide](docs/pipeline-api.md#verification-endpoint)
for details.

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

See the [JSON output and receipt reference](docs/receipt-schema.md) for a
field-by-field explanation. In particular, `includedEntries: []` means the
complete file was hashed; a populated list identifies the stable package
entries included in an Office-document fingerprint.

### Verify

```sh
# Email-linked registration: provide the registration email.
digitalownership verify ./DigitalOwnershipArchive/report.registered.pdf \
  --email owner@example.com

# Wallet registration: omit --email.
digitalownership verify ./report.pdf
```

Verification hashes the file locally and checks the public verification
service at `DIGITALOWNERSHIP_VERIFICATION_URL` (or the production default) by
JSON `POST`. When supplied, the registration email is sent in the request body,
not the URL. A confirmed result contains `verified: true` and the final
`registryKey`. Verify the registered archive copy whenever one exists.
The [JSON output and receipt reference](docs/receipt-schema.md) explains every
fingerprint, verification, and local-receipt field.

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

The receipt stores the on-chain registration address as `registrationWallet`.
The `digitalownership verify` response calls the same address `registrant`,
matching the registry contract. Older receipts and API responses may include an
ambiguous `owner` field; new CLI receipts do not write it.

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

### Store Only The Receipt

By default, a completed registration creates both an archive copy and a JSON
receipt. Use `--no-archive` when the source file must remain in its existing
controlled location and no duplicate archive copy is wanted. It requires
`--receipt-out <path>` so that the registration evidence is still retained at
an explicit local path.

This works with both `--approval none` and `--approval required --wait`:

```sh
digitalownership register ./out/final-report.json --account \
  --email owner@example.com --approval none \
  --no-archive --receipt-out ./evidence/final-report.digitalownership.json
```

### Create A Publication Manifest

For a public web publication, first register the canonical `.json` content
file as above. Then create its public manifest from the completed local
receipt. This command only reads and writes local files: it does not contact
DigitalOwnership or register anything.

```sh
digitalownership publication manifest \
  --receipt ./DigitalOwnershipArchive/.DigitalOwnershipRecords/terms-2026-10-01.registered.json.digitalownership.json \
  --archive ./DigitalOwnershipArchive/terms-2026-10-01.registered.json \
  --url 'https://www.example.org/.well-known/digitalownership/terms-2026-10-01.content.json' \
  --label 'Terms of Service' \
  --publisher 'Example Organisation' \
  --email evidence@example.org \
  --out ./terms-2026-10-01.manifest.json
```

`--archive` is required. The CLI fingerprints it locally and refuses to create
a manifest unless its SHA-512 fingerprint, algorithm, and hash scope match the
receipt. `--email` must be a public organisation email and must match the receipt's
`accountEmail` when that private field exists. It is included in the manifest
because visitors need it to verify the account-linked registrations. The
command also accepts completed legacy CLI receipts, but those do not contain an
account email, so `--email` is required for them. It refuses to overwrite an
existing output file.

Host byte-identical canonical content at `--url`, then register the generated
manifest as a second document:

```sh
digitalownership register ./terms-2026-10-01.manifest.json --account \
  --email evidence@example.org --approval required --wait
```

Use `--published-at '2026-10-01T10:00:00Z'` when a reproducible release build
must set the manifest timestamp explicitly. See the
[web-publication verification guide](docs/web-publication-verification.md)
for hosting, CORS, and visitor-verification requirements.

### Publish A Verified Web Version

For a controlled web release, use one command to register the canonical JSON,
create its manifest, and register that manifest. It always uses two separate
browser approvals: one for the content and one for the public manifest. The
command prints each approval URL to the terminal and waits for the signed-in
account owner to approve it.

```sh
digitalownership publication publish ./public/.well-known/digitalownership/terms-2026-10-02.content.json \
  --account --email digitalownership@squaredant.com \
  --url 'https://www.example.org/.well-known/digitalownership/terms-2026-10-02.content.json' \
  --label 'Terms of Service' --publisher 'Example Organisation' \
  --approval required --wait \
  --manifest-out ./public/.well-known/digitalownership/terms-2026-10-02.manifest.json \
  --receipt-dir ./private-evidence/publications/terms-2026-10-02
```

`--receipt-dir` must be outside the published web directory. It stores the two
private local receipts, including the account email, and an `archive/`
subdirectory with read-only copies of the registered canonical file and
manifest. The public source files remain the exact files that must later be
deployed. It refuses to overwrite an existing manifest or receipt.

For an earlier publication created before this archive behavior, retain a
read-only private copy only after the CLI confirms it matches its receipt:

```sh
digitalownership publication retain \
  --receipt ./private-evidence/publications/terms-2026-10-02/terms-2026-10-02.content.json.digitalownership.json \
  --file ./public/.well-known/digitalownership/terms-2026-10-02.content.json \
  --out ./private-evidence/publications/terms-2026-10-02/archive/terms-2026-10-02.content.json
```

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
