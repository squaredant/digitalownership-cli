import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

async function sha512(relativePath) {
  const bytes = await readFile(path.join(root, relativePath));
  return createHash("sha512").update(bytes).digest("hex");
}

const dataset = await readJson("evidence/training-data.dataset-manifest.json");
const lineage = await readJson("evidence/training-v1.lineage.json");
const model = await readJson("artifacts/model-v1.json");
const attestation = await readJson("evidence/training-v1.run-attestation.json");

assert.equal(dataset.schema, "digitalownership-dataset-manifest-v1");
for (const entry of dataset.files) {
  assert.equal(entry.sha512, await sha512(entry.relativePath), `dataset hash mismatch: ${entry.relativePath}`);
}

assert.equal(lineage.schema, "digitalownership-model-lineage-v1");
for (const artifact of Object.values(lineage.artifacts)) {
  assert.equal(artifact.sha512, await sha512(artifact.path), `lineage hash mismatch: ${artifact.path}`);
  assert.equal(artifact.registered, false, "the local fixture must not claim live registration");
}

const lineageHash = await sha512("evidence/training-v1.lineage.json");
const modelHash = await sha512("artifacts/model-v1.json");
assert.equal(model.digitalownershipProvenance.lineageSha512, lineageHash);
assert.equal(attestation.lineage.sha512, lineageHash);
assert.equal(attestation.model.sha512, modelHash);
assert.equal(attestation.model.embeddedLineageSha512, lineageHash);

console.log("Local model provenance example is internally consistent.");
console.log(`lineage SHA-512: ${lineageHash}`);
console.log(`model SHA-512:   ${modelHash}`);
