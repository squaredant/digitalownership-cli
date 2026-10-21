import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createDatasetManifest,
  createRunAttestation,
  prepareLineage,
  verifyRunAttestation,
} from "../lib/provenance.js";

function sha512(value) {
  return createHash("sha512").update(value).digest("hex");
}

function receiptFor(fingerprint, registryKey) {
  return {
    schema: "digitalownership-local-record-v1",
    status: "registered",
    documentHash: fingerprint.documentFingerprint,
    hashAlgorithm: fingerprint.hashAlgorithm,
    hashScope: fingerprint.hashScope,
    registryKey,
  };
}

test("provenance chain verifies declared artifacts and rejects later dataset changes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "digitalownership-provenance-"));
  await Promise.all([
    mkdir(path.join(root, "src")),
    mkdir(path.join(root, "data")),
    mkdir(path.join(root, "config")),
    mkdir(path.join(root, "environment")),
    mkdir(path.join(root, "evidence")),
    mkdir(path.join(root, "out")),
  ]);
  await Promise.all([
    writeFile(path.join(root, "src", "train.py"), "print('train')\n"),
    writeFile(path.join(root, "data", "training.csv"), "feature,label\n0.1,0\n"),
    writeFile(path.join(root, "config", "training.json"), '{"seed":7}\n'),
    writeFile(path.join(root, "environment", "requirements.lock"), "example==1.0.0\n"),
  ]);

  const dataset = await createDatasetManifest(path.join(root, "data"), { datasetId: "training-v1", baseDir: root });
  await writeFile(path.join(root, "evidence", "dataset.json"), `${JSON.stringify(dataset, null, 2)}\n`);

  const template = {
    schema: "digitalownership-model-lineage-template-v1",
    kind: "training-run",
    lineageId: "training-v1",
    declaredAt: "2026-10-21T12:00:00.000Z",
    purpose: "Test only.",
    artifacts: {
      trainingCode: { path: "src/train.py", registered: false },
      trainingData: { path: "evidence/dataset.json", registered: false },
      configuration: { path: "config/training.json", registered: false },
      environment: { path: "environment/requirements.lock", registered: false },
    },
    run: { command: "python src/train.py", gitCommit: "test", randomSeed: 7 },
    declaredOutput: { path: "out/model.json", format: "json" },
  };
  const lineage = await prepareLineage(template, { baseDir: root });
  const lineagePath = path.join(root, "evidence", "lineage.json");
  await writeFile(lineagePath, `${JSON.stringify(lineage, null, 2)}\n`);
  const lineageHash = sha512(await readFile(lineagePath));

  const modelPath = path.join(root, "out", "model.json");
  await writeFile(modelPath, `${JSON.stringify({ digitalownershipProvenance: { lineageSha512: lineageHash } }, null, 2)}\n`);
  const lineageFingerprint = {
    documentFingerprint: lineageHash,
    hashAlgorithm: "SHA-512",
    hashScope: "digitalownership-exact-file-v1",
  };
  const modelFingerprint = {
    documentFingerprint: sha512(await readFile(modelPath)),
    hashAlgorithm: "SHA-512",
    hashScope: "digitalownership-exact-file-v1",
  };
  await writeFile(path.join(root, "evidence", "lineage.receipt.json"), JSON.stringify(receiptFor(lineageFingerprint, `0x${"a".repeat(64)}`)));
  await writeFile(path.join(root, "evidence", "model.receipt.json"), JSON.stringify(receiptFor(modelFingerprint, `0x${"b".repeat(64)}`)));
  const attestation = await createRunAttestation("evidence/lineage.json", "out/model.json", {
    baseDir: root,
    createdAt: "2026-10-21T15:00:00.000Z",
    lineageReceiptPath: "evidence/lineage.receipt.json",
    modelReceiptPath: "evidence/model.receipt.json",
  });

  const verified = await verifyRunAttestation(attestation, "out/model.json", { baseDir: root });
  assert.equal(verified.verified, true);
  assert.equal(verified.embeddedLineage.matches, true);
  assert.equal(attestation.lineage.registryKey, `0x${"a".repeat(64)}`);
  assert.equal(attestation.model.registryKey, `0x${"b".repeat(64)}`);
  assert.equal(verified.artifacts.trainingData.dataset.files[0].relativePath, "data/training.csv");

  await writeFile(path.join(root, "data", "training.csv"), "feature,label\n0.9,1\n");
  await assert.rejects(
    () => verifyRunAttestation(attestation, "out/model.json", { baseDir: root }),
    /Dataset hash mismatch: data\/training\.csv/,
  );
});
