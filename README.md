# DigitalOwnership CLI

DigitalOwnership CLI fingerprints a file on your machine, registers that
fingerprint through a DigitalOwnership account, and verifies the same file
later. Original files are never uploaded during registration.

It is intended for individual files, controlled workflows, and build or data
pipelines where an independently verifiable record of a specific version is
useful.

## What It Does

- Calculates a SHA-512 fingerprint locally.
- Registers the fingerprint on the configured public registry.
- Creates a local archive and JSON receipt for registered files.
- Verifies a supplied file against the registry later.
- Supports browser-approved account registrations and unattended pipeline
  registrations.

A successful verification concerns the bytes of the file presented for
verification. The receipt is useful evidence and operational metadata, but it
is not required to verify the file registration.

## Quick Start

### 1. Install

The CLI currently runs from this repository.

```bash
git clone https://github.com/squaredant/digitalownership-cli.git
cd digitalownership-cli
npm ci
npm link
digitalownership --help
```

### 2. Create a pipeline integration

Sign in to [DigitalOwnership](https://digitalownership.squaredant.com/account),
open **Developer tools**, and create a pipeline integration. Store its
credential in the environment that runs the CLI. Do not commit it to source
control.

```bash
export DIGITALOWNERSHIP_REGISTRY_ADDRESS='0xf495d81eb4A64d213f6BAC2bD23EE9A147956169'
export DIGITALOWNERSHIP_CHAIN_ID='0xa4b1'
export DIGITALOWNERSHIP_PIPELINE_CREDENTIAL='do_pi_...'
export DIGITALOWNERSHIP_PIPELINE_TOKEN="$(digitalownership token | jq -r '.accessToken')"
```

The account connected to the integration supplies the registration identity
and credits. Use a durable shared account where appropriate, for example
`publications@example.org`, rather than an individual employee account.

### 3. Check readiness

```bash
digitalownership doctor
digitalownership balance
```

`doctor` checks the local configuration and service reachability. `balance`
shows the credits available to the connected account.

### 4. Register a file

For a first registration, require account-owner approval:

```bash
digitalownership register ./report.pdf --account \
  --approval required --wait
```

The command prints a review link. The account owner reviews and approves the
exact fingerprint in the DigitalOwnership account. One credit is spent only
after approval. The CLI writes a registered archive and receipt unless you
opt out explicitly.

### 5. Verify later

```bash
digitalownership verify ./DigitalOwnershipArchive/report.<registry-key>.registered.pdf \
  --email publications@example.org
```

Verification fingerprints the supplied file again and checks the resulting
registration key against the public registry. Use the email address associated
with the account registration.

## Core Commands

Fingerprint a file without registering it:

```bash
digitalownership fingerprint ./report.pdf
```

Register with a browser review by the account owner:

```bash
digitalownership register ./out/final-report.json --account \
  --approval required --wait
```

Register without a browser review only in a controlled, authorised pipeline:

```bash
digitalownership register ./out/final-report.json --account --approval none
```

`--approval none` is deliberately for unattended workflows. Start with
`--approval required` until the pipeline and its access controls are proven.

## A Simple Pipeline

Use the CLI after a valuable output has been created, approved, or released.
Do not timestamp every transient build log or intermediate file.

```text
protected pipeline credential
        -> short-lived access token
        -> optional doctor and balance check
        -> register selected output
        -> retain archive and receipt
        -> verify at handover, audit, or release
```

The [pipeline API guide](docs/pipeline-api.md) describes credentials, approval
modes, error handling, and environment variables. The
[receipt data dictionary](docs/receipt-schema.md) explains the JSON fields.
The [GitHub Actions example](examples/github-actions/README.md) shows a
release-triggered workflow.

## Built Solutions

### Model Provenance

The CLI can prepare a local, auditable lineage declaration and a run
attestation for a model, its declared inputs, and selected outputs. This is a
provenance evidence layer, not a claim that the CLI independently executed a
training run.

- [Model provenance guide](docs/model-provenance.md)
- [Runnable local example](examples/model-provenance/README.md)

### Web Publication Verification

The publication commands create and retain a manifest for a public,
fixed-content file. A visitor can then independently compare the declared
content with its registration.

- [Web publication quick start](examples/web-publication/README.md)
- [Hosting, CORS, and verification guide](docs/web-publication-verification.md)
- [Publication manifest schema](test-vectors/schemas/publication-manifest.v1.schema.json)

The WordPress implementation is a separate plugin product. It uses this
protocol but has its own release and WordPress.org review lifecycle.

## Command Reference

```text
digitalownership fingerprint <file>
digitalownership verify <file> [--email <registration-email>]
digitalownership doctor
digitalownership token
digitalownership balance
digitalownership register <file> --account --approval none|required [--wait]
digitalownership publication manifest ...
digitalownership publication publish ...
digitalownership publication retain ...
digitalownership provenance init|prepare|attest|verify ...
```

Run `digitalownership <command> --help` for the complete options and examples.

## Security And Limits

- Keep pipeline credentials and access tokens secret.
- Do not put credentials in repositories, screenshots, receipts, or logs.
- Registration establishes evidence that a fingerprint was registered no later
  than the recorded transaction time. It does not itself prove authorship,
  legal ownership, truthfulness, or regulatory compliance.
- Preserve registered files and receipts according to your own retention
  requirements.
- Direct wallet registrations are separate from the account-credit workflow.

## Development

```bash
npm test
python3 test-vectors/scripts/verify-vectors.py
npm run example:model-provenance
```

The CLI, provenance support, and web-publication protocol remain in this
repository because their formats and releases are version-coupled. Keep the
WordPress plugin in a separate repository because it is a separately
distributed product with its own release cycle.
