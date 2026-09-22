# DigitalOwnership Public Test Vectors

This directory is the normative interoperability fixture set for the first
DigitalOwnership CLI release and public API. All documents are synthetic and
may be published. They contain no personal, customer, or production registration data.

## Contents

- `fixtures/`: deterministic test files.
- `manifest.v1.json`: expected fingerprints, hash scopes, and registry-key
  derivation vectors.
- `schemas/registration-manifest.v1.schema.json`: the versioned JSON Schema
  for local multi-file registration input.
- `batch-registration-manifest.v1.example.json`: a synthetic valid batch
  manifest. The idempotency key is deliberately not in the manifest: it is a
  request-level value supplied separately by the CLI or API client.
- `scripts/generate-fixtures.py`: regenerates the synthetic fixture files.
- `scripts/verify-vectors.py`: checks the fingerprint values with the current
  LibreOffice Python implementation.

## Rules

1. `manifest.v1.json` is append-only after publication. Existing vector IDs,
   fixture bytes, scopes, fingerprints and expected registry keys never change.
2. A hash-policy change requires a new scope and new vector IDs. It must not
   alter a vector published for an existing scope.
3. A compatible implementation must reproduce every expected value before it
   uses the production pipeline API.
4. A fixture tests only the hashing and derivation contract. It is not a
   blockchain registration, ownership assertion, or certificate.

## Current Scopes

| Scope | Meaning |
| --- | --- |
| `digitalownership-content-v1` | Canonical SHA-512 manifest hash for supported ODF and OOXML packages. |
| `digitalownership-pdf-file-v1` | SHA-512 over complete PDF bytes. The separate scope prevents an office-package parser from silently treating a hybrid PDF as an office document. |
| `digitalownership-exact-file-v1` | SHA-512 over complete bytes for other exact-file formats. |

## Regeneration and Verification

```sh
python3 test-vectors/scripts/generate-fixtures.py
python3 test-vectors/scripts/verify-vectors.py
```

Regenerating fixtures is a maintainer operation. It must be followed by a
review confirming that byte-identical fixtures and manifest values remain
unchanged. The verification script does not write files.
