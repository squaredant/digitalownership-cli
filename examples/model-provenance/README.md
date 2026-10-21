# Local Model Provenance Example

This small synthetic package demonstrates the Phase 1 provenance
records without contacting DigitalOwnership or requiring an account. It checks
that a dataset manifest, lineage declaration, model metadata, and post-run
attestation reference the exact expected file bytes.

From the CLI repository root, run:

```sh
npm run example:model-provenance
```

The output prints the SHA-512 values for the lineage declaration and model
after checking every local link. Try changing one character in an artifact,
then run the command again: it must fail with a hash mismatch.

This is a consistency test, not a blockchain registration. The beta CLI can
also locally verify this package with:

```sh
digitalownership provenance verify --base-dir examples/model-provenance \
  --model artifacts/model-v1.json \
  --attestation evidence/training-v1.run-attestation.json
```

To turn the fixture into timestamped evidence, register selected input
artifacts, the lineage declaration, the final model, and the completed
attestation using `digitalownership register ... --account`. Store each
resulting receipt in a private evidence directory. See the
[workflow](../../docs/model-provenance.md).

The fixture intentionally makes no execution claim. A protected runner with a
verifiable signature is required before a pipeline may claim that it actually
executed the declared code against the declared inputs.
