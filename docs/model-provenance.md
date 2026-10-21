# Model Provenance Manifests

This document specifies the DigitalOwnership workflow for creating an
auditable evidence trail around a model build. The `digitalownership
provenance` commands create and locally verify the JSON records. They do not
register a file, spend credits, contact the API, or claim that a model was
executed.

The purpose is to record a clear, verifiable statement of the files and
settings declared for a particular model run. It is suitable for selected
high-value builds, releases, validation reports, and handovers. It is not a
replacement for a quality-management system, source control, access controls,
or model validation.

## What This Establishes

For each listed item, the workflow can establish that:

1. a particular file had a particular SHA-512 fingerprint;
2. when registered separately, the fingerprint existed no later than its
   public-ledger timestamp;
3. a versioned provenance declaration linked the stated inputs, configuration,
   environment, and intended output; and
4. a later run attestation linked the resulting model and declared evidence.

The resulting record is auditable because a reviewer can re-fingerprint the
available files, inspect the immutable JSON documents, and independently check
their registry keys.

It does **not**, by itself, prove that the code actually executed, that a
listed dataset was truly consumed, that the data was lawful or correct, or that
the model performs as claimed. A protected, signed CI or controlled execution
environment is needed for a stronger execution claim.

## Record Chain

The chain deliberately avoids circular references:

```text
registered input artifacts
  (training code, data manifest, configuration, environment lock file)
                |
                v
registered lineage declaration
  (the intended run and its declared inputs)
                |
                v
model artifact
  (may carry a lineage reference in safe metadata through a future adapter)
                |
                v
registered run attestation
  (links the completed model, lineage declaration, metrics, and runner facts)
```

The lineage declaration is made before the output model exists. The run
attestation is made after it exists. A model must never include the key of an
attestation that also fingerprints that same model.

## Recommended Files

Keep private evidence separate from public source or release directories:

```text
project/
  data/
  src/train.py
  config/training-v3.json
  environment/requirements.lock
  out/model-v3.onnx
  evidence/
    data-v3.dataset-manifest.json
    training-v3.lineage.json
    training-v3.run-attestation.json
    receipts/                         # Git-ignored local CLI receipts
```

For a multi-file dataset, create a deterministic dataset manifest that lists
each relative path and SHA-512 value. Register that dataset manifest instead
of trying to treat an unstable directory as a single file. Do not include
absolute paths, credentials, personal data, access tokens, or raw sensitive
parameters in any provenance file.

## Provenance Template

`digitalownership provenance init --kind training-run` creates this pre-run
template. Edit the identifiers, paths, purpose, and run settings. Paths are
relative to `--base-dir`; do not add hashes manually. `prepare` fingerprints
each selected artifact, writes the SHA-512 values and fingerprint rules, then
creates the immutable lineage declaration.

If an input has already been registered, set `registered` to `true` and copy
its `registryKey` from the private registration receipt. Otherwise leave
`registered` as `false` and omit `registryKey`.

```json
{
  "schema": "digitalownership-model-lineage-template-v1",
  "kind": "training-run",
  "lineageId": "training-v3-2026-10-21",
  "declaredAt": "2026-10-21T12:00:00Z",
  "purpose": "Train candidate model v3 for internal validation.",
  "account": {
    "expectedAccountEmail": "ml-operations@example.org"
  },
  "artifacts": {
    "trainingCode": {
      "path": "src/train.py",
      "registered": true,
      "registryKey": "0x<32-byte registry key>"
    },
    "trainingData": {
      "path": "evidence/data-v3.dataset-manifest.json",
      "registered": true,
      "registryKey": "0x<32-byte registry key>"
    },
    "configuration": {
      "path": "config/training-v3.json",
      "registered": false
    },
    "environment": {
      "path": "environment/requirements.lock",
      "registered": true,
      "registryKey": "0x<32-byte registry key>",
      "containerImageDigest": "sha256:<OCI image digest, if used>"
    }
  },
  "run": {
    "command": "python -m pipeline.train --config config/training-v3.json",
    "gitCommit": "<full Git commit ID>",
    "randomSeed": 42691,
    "parameters": {
      "epochs": 50,
      "learningRate": 0.001
    }
  },
  "declaredOutput": {
    "path": "out/model-v3.onnx",
    "format": "onnx"
  }
}
```

`expectedAccountEmail` is private operational metadata. It helps a pipeline
detect a credential from the wrong account. It must remain in private evidence
and must not be embedded in a distributable model or public attestation. The
current CLI preserves this field in the lineage declaration but does not query
an account or validate the email during `prepare`.

## Dataset Manifest Template

The dataset manifest describes the exact collection used by the run. Sort
`files` by the UTF-8 byte order of `relativePath`; use forward slashes; do not
include file modification times or machine-specific paths. The CLI generates
this list. Each listed path is relative to `--base-dir`, not the dataset
directory.

```json
{
  "schema": "digitalownership-dataset-manifest-v1",
  "datasetId": "training-data-v3",
  "files": [
    {
      "relativePath": "data/cohort-a/features.parquet",
      "sha512": "<128 lowercase hexadecimal characters>",
      "bytes": 12345678
    },
    {
      "relativePath": "data/cohort-a/labels.parquet",
      "sha512": "<128 lowercase hexadecimal characters>",
      "bytes": 123456
    }
  ]
}
```

Only use a file list when revealing file names and sizes is acceptable. For
sensitive datasets, retain a private dataset manifest and register it through
an account-approved workflow; disclose it only to an authorised reviewer.

## Run Attestation

Create this only after the model and optional evaluation report are complete.
`digitalownership provenance attest` generates this file. Give it the private
receipts from the lineage and model registrations; it validates that each
receipt matches the named local file and copies the `registryKey`. The CLI does
not edit model metadata;
`embeddedLineageSha512` appears only when a JSON model already contains a
matching `digitalownershipProvenance.lineageSha512` value.

In plain language, to **attest** is to make a formal statement. Here the
statement is: *this exact model is declared to relate to this exact lineage
declaration and its recorded inputs.* The generated JSON is that statement.

`provenance attest` does the following locally:

1. rechecks the lineage declaration and each declared input file;
2. fingerprints the final model and optional metrics report;
3. validates any supplied registration receipts and copies their registry
   keys; and
4. writes one run-attestation JSON file linking those records.

It does not train a model, submit a blockchain transaction, or independently
prove that the declared code actually executed. Register the resulting
attestation separately when it should become timestamped evidence.

```json
{
  "schema": "digitalownership-model-run-attestation-v1",
  "attestationId": "training-v3-run-001",
  "createdAt": "2026-10-21T15:32:09Z",
  "lineage": {
    "path": "evidence/training-v3.lineage.json",
    "sha512": "<SHA-512 of training-v3.lineage.json>",
    "hashAlgorithm": "SHA-512",
    "hashScope": "digitalownership-exact-file-v1",
    "registryKey": "0x<registered lineage declaration key>"
  },
  "model": {
    "path": "out/model-v3.onnx",
    "sha512": "<SHA-512 of final model bytes>",
    "hashAlgorithm": "SHA-512",
    "hashScope": "digitalownership-exact-file-v1",
    "registryKey": "0x<registered model key>",
    "embeddedLineageSha512": "<same SHA-512 as lineage.sha512, if present>"
  },
  "evaluation": {
    "path": "out/validation-v3.json",
    "sha512": "<SHA-512 of evaluation report>",
    "hashAlgorithm": "SHA-512",
    "hashScope": "digitalownership-exact-file-v1",
    "registryKey": "0x<optional registered evaluation-report key>"
  },
  "runner": { "type": "local-cli" },
  "claim": "This attestation declares the listed relationship between the model and the recorded lineage."
}
```

Do not describe an unsigned manifest as proof of code execution. A future
signed CI or controlled-environment attestation can support a stronger claim.

## CLI Workflow

Use a project root as `--base-dir`. Every path written to a provenance record
is relative to that directory, which keeps the evidence portable between
machines. Start by creating a template and a deterministic dataset manifest:

```sh
# 1. Create and fill a template. Do not put secrets, personal data, or
# absolute paths in it.
digitalownership provenance init --kind training-run \
  --out ./evidence/training-v3.template.json

# 2. Create deterministic file-list evidence for the selected training data.
digitalownership provenance dataset-manifest ./data \
  --base-dir . --dataset-id training-data-v3 \
  --out ./evidence/data-v3.dataset-manifest.json

# 3. Register selected input files and preserve their private receipts.
digitalownership register ./src/train.py --account --approval required --wait \
  --no-archive --receipt-out ./evidence/receipts/train.digitalownership.json

digitalownership register ./evidence/data-v3.dataset-manifest.json \
  --account --approval required --wait \
  --no-archive --receipt-out ./evidence/receipts/data-v3.digitalownership.json

# Copy the resulting registry keys into the relevant artifacts in the template
# only when those parent artifacts have been registered. Otherwise leave
# registered as false.

# 4. Fill and prepare the declaration, then register it before the run.
digitalownership provenance prepare \
  --template ./evidence/training-v3.template.json \
  --base-dir . --out ./evidence/training-v3.lineage.json

digitalownership register ./evidence/training-v3.lineage.json --account \
  --approval required --wait \
  --no-archive --receipt-out ./evidence/receipts/training-v3-lineage.digitalownership.json

# 5. Run training. A format adapter may embed the lineage key in supported
# model metadata; otherwise retain the registered sidecar manifest.
python -m pipeline.train --config config/training-v3.json

# 6. Register the model, then create and register the completed run
# attestation. The receipt options validate and copy each registry key.
digitalownership register ./out/model-v3.onnx --account --approval required --wait \
  --no-archive --receipt-out ./evidence/receipts/model-v3.digitalownership.json

digitalownership provenance attest \
  --lineage ./evidence/training-v3.lineage.json \
  --model ./out/model-v3.onnx --metrics ./out/validation-v3.json --base-dir . \
  --lineage-receipt ./evidence/receipts/training-v3-lineage.digitalownership.json \
  --model-receipt ./evidence/receipts/model-v3.digitalownership.json \
  --out ./evidence/training-v3.run-attestation.json

digitalownership register ./evidence/training-v3.run-attestation.json \
  --account --approval required --wait \
  --no-archive --receipt-out ./evidence/receipts/training-v3-attestation.digitalownership.json

# 7. Recheck all local hashes later, without network access.
digitalownership provenance verify --base-dir . \
  --model ./out/model-v3.onnx \
  --attestation ./evidence/training-v3.run-attestation.json

# 8. Confirm that the completed attestation itself is registered on-chain.
# Use the account email that made the registration.
digitalownership verify ./evidence/training-v3.run-attestation.json \
  --email ml-operations@example.org
```

For an unattended, authorised pipeline, substitute `--approval none` only
where that automation has been approved. Browser approval is more appropriate
for release or handover decisions.

## Verification Review

An auditor or recipient should:

1. obtain the model, the lineage declaration, run attestation, and the stated
   input/evaluation artifacts where disclosure is permitted;
2. re-fingerprint each available file using its declared hash scope;
3. verify each registered artifact with `digitalownership verify`, using the
   registration email for account-based registrations; and
4. inspect that the hashes and registry keys in the lineage declaration and
   attestation agree with the re-fingerprinted files and public registrations.

For example, `digitalownership verify training-v3.run-attestation.json`
confirms the public-ledger registration of the attestation file. It does not
replace `digitalownership provenance verify`, which checks the local links
between that attestation, the model, lineage declaration, dataset manifest,
and other declared artifacts.

If a distributed model format safely supports immutable metadata, the reviewer
can additionally compare its embedded lineage key with the lineage declaration
key. The metadata is useful redundancy, not a substitute for the separately
stored manifest and attestation.

## Implementation Boundary

The current workflow uses exact-file JSON sidecars and no automatic mutation
of model files. This works for every model format and avoids unsafe handling of
serialized model formats such as Python pickle-based `.pt` or `.pth` files.

Later format-specific adapters may safely embed a lineage key in ONNX metadata
or SafeTensors metadata. They must preserve the exact model bytes that are
ultimately registered and must have fixture-based tests that prove they do not
corrupt the model.

The next security increment is a signed execution attestation from a protected
CI identity or controlled runner. It should record the repository, commit,
workflow, CI run ID, container digest, and a signature verifiable without
DigitalOwnership. That makes a stronger statement about where the declared
relationship was asserted, but still does not validate the scientific quality
or real-world provenance of the input data.
