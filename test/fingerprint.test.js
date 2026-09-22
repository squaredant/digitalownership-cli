import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { emailAnchoredRegistryKey, fingerprintFile, walletRegistryKey } from "../lib/fingerprint.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const CLI_ROOT = join(ROOT, "..");
const VECTOR_ROOT = join(CLI_ROOT, "test-vectors");
const manifest = JSON.parse(await readFile(join(VECTOR_ROOT, "manifest.v1.json"), "utf8"));

for (const vector of manifest.fingerprintVectors) {
  test(`fingerprint vector: ${vector.id}`, async () => {
    const result = await fingerprintFile(join(VECTOR_ROOT, vector.file));
    assert.equal(result.hashAlgorithm, "SHA-512");
    assert.equal(result.hashScope, vector.hashScope);
    assert.equal(result.documentFingerprint, vector.documentFingerprint);
    assert.equal(Object.hasOwn(result, "walletRegistryKey"), false);
  });
}

for (const vector of manifest.registryKeyVectors) {
  test(`registry key vector: ${vector.id}`, () => {
    if (vector.registrationMethod === "wallet") {
      assert.equal(walletRegistryKey(vector.sourceHash), vector.registryKey);
      return;
    }
    assert.equal(
      emailAnchoredRegistryKey(vector.sourceHash, vector.email),
      vector.registryKey,
    );
  });
}

for (const extension of ["rds", "parquet", "hdf5", "duckdb", "jsonl"]) {
  test(`common pipeline extension uses exact-file scope: .${extension}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "digitalownership-cli-"));
    const path = join(directory, `pipeline-output.${extension}`);
    await writeFile(path, Buffer.from(`synthetic pipeline output for .${extension}\n`));
    const result = await fingerprintFile(path);
    assert.equal(result.hashScope, "digitalownership-exact-file-v1");
    assert.match(result.documentFingerprint, /^[0-9a-f]{128}$/);
  });
}
