import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { fingerprintFile, HASH_ALGORITHM } from "./fingerprint.js";

const DATASET_SCHEMA = "digitalownership-dataset-manifest-v1";
const TEMPLATE_SCHEMA = "digitalownership-model-lineage-template-v1";
const LINEAGE_SCHEMA = "digitalownership-model-lineage-v1";
const ATTESTATION_SCHEMA = "digitalownership-model-run-attestation-v1";
const SHA512_PATTERN = /^[0-9a-f]{128}$/;
const REGISTRY_KEY_PATTERN = /^0x[0-9a-f]{64}$/i;

function sha512(bytes) {
  return createHash("sha512").update(bytes).digest("hex");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(value, label) {
  const result = String(value || "").trim();
  if (!result) throw new Error(`${label} is required.`);
  return result;
}

function requireSha512(value, label) {
  const result = String(value || "").trim().toLowerCase();
  if (!SHA512_PATTERN.test(result)) throw new Error(`${label} must be a lowercase SHA-512 hexadecimal value.`);
  return result;
}

function resolveRelative(baseDir, relativePath, label) {
  const raw = requireString(relativePath, label);
  if (path.isAbsolute(raw)) throw new Error(`${label} must be relative to the project base directory.`);
  const base = path.resolve(baseDir);
  const resolved = path.resolve(base, raw);
  const relation = path.relative(base, resolved);
  if (relation.startsWith(`..${path.sep}`) || relation === ".." || path.isAbsolute(relation)) {
    throw new Error(`${label} must remain inside the project base directory.`);
  }
  return resolved;
}

function portableRelative(baseDir, target) {
  return path.relative(path.resolve(baseDir), target).split(path.sep).join("/");
}

async function readJson(filePath, label) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read ${label}: ${error.message}`);
  }
}

export async function writeNewJson(outputPath, value, label = "output file") {
  try {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error.code === "EEXIST") throw new Error(`Refusing to overwrite existing ${label}: ${outputPath}`);
    throw new Error(`Cannot write ${label}: ${error.message}`);
  }
}

export function createLineageTemplate({ kind, createdAt = new Date().toISOString() } = {}) {
  if (kind !== "training-run") throw new Error("--kind must currently be training-run.");
  return {
    schema: TEMPLATE_SCHEMA,
    kind,
    lineageId: "training-v1",
    declaredAt: createdAt,
    purpose: "Describe the selected model training run.",
    artifacts: {
      trainingCode: { path: "src/train.py", registered: false },
      trainingData: { path: "evidence/training-data.dataset-manifest.json", registered: false },
      configuration: { path: "config/training.json", registered: false },
      environment: { path: "environment/requirements.lock", registered: false },
    },
    run: {
      command: "python -m pipeline.train --config config/training.json",
      gitCommit: "<full Git commit ID>",
      randomSeed: 0,
      parameters: {},
    },
    declaredOutput: { path: "out/model.onnx", format: "onnx" },
  };
}

async function walkDataset(directory, root, files) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    const stat = await lstat(entryPath);
    if (stat.isSymbolicLink()) throw new Error(`Dataset directories cannot contain symbolic links: ${portableRelative(root, entryPath)}`);
    if (stat.isDirectory()) {
      await walkDataset(entryPath, root, files);
      continue;
    }
    if (!stat.isFile()) throw new Error(`Dataset directories can contain only regular files: ${portableRelative(root, entryPath)}`);
    files.push({
      relativePath: portableRelative(root, entryPath),
      sha512: sha512(await readFile(entryPath)),
      bytes: stat.size,
    });
  }
}

export async function createDatasetManifest(directory, { datasetId, baseDir = directory } = {}) {
  const datasetRoot = path.resolve(directory);
  const projectRoot = path.resolve(baseDir);
  const relation = path.relative(projectRoot, datasetRoot);
  if (relation.startsWith(`..${path.sep}`) || relation === ".." || path.isAbsolute(relation)) {
    throw new Error("Dataset directory must remain inside the project base directory.");
  }
  const stat = await lstat(datasetRoot).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`Dataset directory does not exist: ${directory}`);
  const files = [];
  await walkDataset(datasetRoot, projectRoot, files);
  if (!files.length) throw new Error("Dataset directory contains no regular files.");
  return {
    schema: DATASET_SCHEMA,
    datasetId: String(datasetId || path.basename(datasetRoot)).trim() || "dataset",
    files,
  };
}

export async function validateDatasetManifest(manifest, { baseDir }) {
  if (!isPlainObject(manifest) || manifest.schema !== DATASET_SCHEMA) {
    throw new Error(`Dataset manifest schema must be ${DATASET_SCHEMA}.`);
  }
  if (!Array.isArray(manifest.files) || !manifest.files.length) throw new Error("Dataset manifest must contain at least one file.");
  const checked = [];
  let previousPath = "";
  for (const entry of manifest.files) {
    if (!isPlainObject(entry)) throw new Error("Dataset manifest file entries must be objects.");
    const relativePath = requireString(entry.relativePath, "dataset file relativePath");
    if (previousPath && relativePath <= previousPath) throw new Error("Dataset manifest files must be sorted by relativePath.");
    previousPath = relativePath;
    const sourcePath = resolveRelative(baseDir, relativePath, `dataset file ${relativePath}`);
    const stat = await lstat(sourcePath);
    if (!stat.isFile()) throw new Error(`Dataset entry is not a regular file: ${relativePath}`);
    const actual = sha512(await readFile(sourcePath));
    const expected = requireSha512(entry.sha512, `dataset hash for ${relativePath}`);
    if (actual !== expected) throw new Error(`Dataset hash mismatch: ${relativePath}`);
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0) throw new Error(`Dataset byte count is invalid: ${relativePath}`);
    if (stat.size !== entry.bytes) throw new Error(`Dataset byte count mismatch: ${relativePath}`);
    checked.push({ relativePath, sha512: actual, bytes: stat.size });
  }
  return { datasetId: String(manifest.datasetId || ""), files: checked };
}

function normalizeArtifactRegistration(artifact, label) {
  const registryKey = String(artifact.registryKey || "").trim();
  const registered = Boolean(artifact.registered || registryKey);
  if (registered && !REGISTRY_KEY_PATTERN.test(registryKey)) {
    throw new Error(`${label}.registryKey is required when the artifact is marked registered.`);
  }
  return registered ? { registered: true, registryKey } : { registered: false };
}

function optionalRegistryKey(value, label) {
  const registryKey = String(value || "").trim();
  if (!registryKey) return {};
  if (!REGISTRY_KEY_PATTERN.test(registryKey)) throw new Error(`${label} must be a 32-byte 0x-prefixed registry key.`);
  return { registryKey };
}

async function registryKeyFromReceipt(receiptPath, record, { baseDir, label }) {
  const resolvedPath = path.resolve(baseDir, requireString(receiptPath, label));
  const receipt = await readJson(resolvedPath, `${label} JSON`);
  if (!isPlainObject(receipt) || !["registered", "already_registered"].includes(receipt.status)) {
    throw new Error(`${label} must be a completed DigitalOwnership local receipt.`);
  }
  if (receipt.documentHash !== record.sha512 || receipt.hashAlgorithm !== record.hashAlgorithm || receipt.hashScope !== record.hashScope) {
    throw new Error(`${label} does not match the local file fingerprint.`);
  }
  const registryKey = String(receipt.registryKey || "").trim();
  if (!REGISTRY_KEY_PATTERN.test(registryKey)) throw new Error(`${label} does not contain a valid registry key.`);
  return registryKey;
}

async function registrationReference(record, { baseDir, receiptPath, explicitRegistryKey, receiptLabel, keyLabel }) {
  const receiptRegistryKey = receiptPath
    ? await registryKeyFromReceipt(receiptPath, record, { baseDir, label: receiptLabel })
    : "";
  const explicit = optionalRegistryKey(explicitRegistryKey, keyLabel).registryKey || "";
  if (receiptRegistryKey && explicit && receiptRegistryKey.toLowerCase() !== explicit.toLowerCase()) {
    throw new Error(`${keyLabel} does not match ${receiptLabel}.`);
  }
  return receiptRegistryKey || explicit ? { registryKey: receiptRegistryKey || explicit } : {};
}

export async function prepareLineage(template, { baseDir } = {}) {
  if (!isPlainObject(template) || template.schema !== TEMPLATE_SCHEMA || template.kind !== "training-run") {
    throw new Error(`Lineage template schema must be ${TEMPLATE_SCHEMA} with kind training-run.`);
  }
  if (!isPlainObject(template.artifacts) || !Object.keys(template.artifacts).length) {
    throw new Error("Lineage template must contain artifacts.");
  }
  const artifacts = {};
  for (const [name, artifact] of Object.entries(template.artifacts)) {
    if (!isPlainObject(artifact)) throw new Error(`Artifact ${name} must be an object.`);
    const sourcePath = resolveRelative(baseDir, artifact.path, `artifacts.${name}.path`);
    const fingerprint = await fingerprintFile(sourcePath);
    artifacts[name] = {
      path: portableRelative(baseDir, sourcePath),
      sha512: fingerprint.documentFingerprint,
      hashAlgorithm: fingerprint.hashAlgorithm,
      hashScope: fingerprint.hashScope,
      ...(artifact.containerImageDigest ? { containerImageDigest: String(artifact.containerImageDigest) } : {}),
      ...normalizeArtifactRegistration(artifact, `artifacts.${name}`),
    };
  }
  const outputPath = resolveRelative(baseDir, template.declaredOutput?.path, "declaredOutput.path");
  return {
    schema: LINEAGE_SCHEMA,
    lineageId: requireString(template.lineageId, "lineageId"),
    declaredAt: requireString(template.declaredAt, "declaredAt"),
    purpose: requireString(template.purpose, "purpose"),
    ...(isPlainObject(template.account) ? { account: template.account } : {}),
    artifacts,
    run: isPlainObject(template.run) ? template.run : {},
    declaredOutput: {
      path: portableRelative(baseDir, outputPath),
      format: requireString(template.declaredOutput?.format, "declaredOutput.format"),
    },
  };
}

export async function validateLineage(lineage, { baseDir } = {}) {
  if (!isPlainObject(lineage) || lineage.schema !== LINEAGE_SCHEMA) {
    throw new Error(`Lineage schema must be ${LINEAGE_SCHEMA}.`);
  }
  if (!isPlainObject(lineage.artifacts) || !Object.keys(lineage.artifacts).length) throw new Error("Lineage must contain artifacts.");
  const artifacts = {};
  for (const [name, artifact] of Object.entries(lineage.artifacts)) {
    if (!isPlainObject(artifact)) throw new Error(`Lineage artifact ${name} must be an object.`);
    const sourcePath = resolveRelative(baseDir, artifact.path, `artifacts.${name}.path`);
    const fingerprint = await fingerprintFile(sourcePath);
    const expected = requireSha512(artifact.sha512, `artifacts.${name}.sha512`);
    if (fingerprint.documentFingerprint !== expected) throw new Error(`Lineage hash mismatch: ${artifact.path}`);
    if (artifact.hashAlgorithm !== fingerprint.hashAlgorithm || artifact.hashScope !== fingerprint.hashScope) {
      throw new Error(`Lineage fingerprint rule mismatch: ${artifact.path}`);
    }
    const registration = normalizeArtifactRegistration(artifact, `artifacts.${name}`);
    let dataset;
    if (name === "trainingData") {
      const content = await readJson(sourcePath, `dataset manifest ${artifact.path}`);
      dataset = await validateDatasetManifest(content, { baseDir });
    }
    artifacts[name] = { path: artifact.path, fingerprint, ...registration, ...(dataset ? { dataset } : {}) };
  }
  return { lineageId: requireString(lineage.lineageId, "lineageId"), artifacts };
}

function embeddedLineageSha512(model) {
  const value = model?.digitalownershipProvenance?.lineageSha512;
  return SHA512_PATTERN.test(String(value || "")) ? String(value).toLowerCase() : "";
}

async function fingerprintAndDescribe(filePath, baseDir, label) {
  const resolved = resolveRelative(baseDir, filePath, label);
  const fingerprint = await fingerprintFile(resolved);
  return {
    resolved,
    record: {
      path: portableRelative(baseDir, resolved),
      sha512: fingerprint.documentFingerprint,
      hashAlgorithm: fingerprint.hashAlgorithm,
      hashScope: fingerprint.hashScope,
    },
  };
}

export async function createRunAttestation(lineagePath, modelPath, {
  baseDir,
  metricsPath,
  attestationId,
  createdAt = new Date().toISOString(),
  lineageRegistryKey,
  modelRegistryKey,
  metricsRegistryKey,
  lineageReceiptPath,
  modelReceiptPath,
  metricsReceiptPath,
} = {}) {
  const lineageFile = await fingerprintAndDescribe(lineagePath, baseDir, "--lineage");
  const lineage = await readJson(lineageFile.resolved, "lineage JSON");
  const checkedLineage = await validateLineage(lineage, { baseDir });
  const modelFile = await fingerprintAndDescribe(modelPath, baseDir, "--model");
  if (lineage.declaredOutput?.path !== modelFile.record.path) {
    throw new Error(`Model path does not match declaredOutput.path: ${lineage.declaredOutput?.path || "missing"}`);
  }
  let modelJson = null;
  try {
    modelJson = JSON.parse(await readFile(modelFile.resolved, "utf8"));
  } catch {
    // Most model formats are binary. Metadata inspection is optional in Phase 1.
  }
  const embedded = embeddedLineageSha512(modelJson);
  if (embedded && embedded !== lineageFile.record.sha512) throw new Error("Model metadata lineage SHA-512 does not match the lineage declaration.");
  const evaluation = metricsPath ? (await fingerprintAndDescribe(metricsPath, baseDir, "--metrics")).record : undefined;
  if (!evaluation && (metricsReceiptPath || metricsRegistryKey)) {
    throw new Error("--metrics-receipt and --metrics-registry-key require --metrics.");
  }
  const lineageRegistration = await registrationReference(lineageFile.record, {
    baseDir,
    receiptPath: lineageReceiptPath,
    explicitRegistryKey: lineageRegistryKey,
    receiptLabel: "--lineage-receipt",
    keyLabel: "--lineage-registry-key",
  });
  const modelRegistration = await registrationReference(modelFile.record, {
    baseDir,
    receiptPath: modelReceiptPath,
    explicitRegistryKey: modelRegistryKey,
    receiptLabel: "--model-receipt",
    keyLabel: "--model-registry-key",
  });
  const evaluationRegistration = evaluation ? await registrationReference(evaluation, {
    baseDir,
    receiptPath: metricsReceiptPath,
    explicitRegistryKey: metricsRegistryKey,
    receiptLabel: "--metrics-receipt",
    keyLabel: "--metrics-registry-key",
  }) : {};
  return {
    schema: ATTESTATION_SCHEMA,
    attestationId: String(attestationId || `${checkedLineage.lineageId}-attestation`).trim(),
    createdAt,
    lineage: { ...lineageFile.record, ...lineageRegistration },
    model: { ...modelFile.record, ...modelRegistration, ...(embedded ? { embeddedLineageSha512: embedded } : {}) },
    ...(evaluation ? { evaluation: { ...evaluation, ...evaluationRegistration } } : {}),
    runner: { type: "local-cli" },
    claim: "This attestation declares the listed relationship between the model and the recorded lineage.",
  };
}

function compareFingerprint(record, fingerprint, label) {
  if (!isPlainObject(record)) throw new Error(`${label} record is required.`);
  const actualHash = fingerprint.documentFingerprint || fingerprint.sha512;
  if (requireSha512(record.sha512, `${label}.sha512`) !== actualHash) throw new Error(`${label} hash mismatch.`);
  if (record.hashAlgorithm !== fingerprint.hashAlgorithm || record.hashScope !== fingerprint.hashScope) {
    throw new Error(`${label} fingerprint rule mismatch.`);
  }
}

export async function verifyRunAttestation(attestation, modelPath, { baseDir } = {}) {
  if (!isPlainObject(attestation) || attestation.schema !== ATTESTATION_SCHEMA) {
    throw new Error(`Run attestation schema must be ${ATTESTATION_SCHEMA}.`);
  }
  const modelFile = await fingerprintAndDescribe(modelPath, baseDir, "--model");
  compareFingerprint(attestation.model, modelFile.record, "Model");
  const lineagePath = resolveRelative(baseDir, attestation.lineage?.path, "attestation.lineage.path");
  const lineageFingerprint = await fingerprintFile(lineagePath);
  compareFingerprint(attestation.lineage, lineageFingerprint, "Lineage");
  const lineage = await readJson(lineagePath, "lineage JSON");
  const checkedLineage = await validateLineage(lineage, { baseDir });
  let embedded = "";
  try {
    embedded = embeddedLineageSha512(JSON.parse(await readFile(modelFile.resolved, "utf8")));
  } catch {
    // Binary model formats do not expose metadata to Phase 1.
  }
  if (attestation.model.embeddedLineageSha512 && embedded !== attestation.lineage.sha512) {
    throw new Error("Model embedded lineage SHA-512 does not match the attestation.");
  }
  return {
    verified: true,
    model: modelFile.record,
    lineage: { path: attestation.lineage.path, sha512: attestation.lineage.sha512 },
    embeddedLineage: { present: Boolean(embedded), matches: !embedded || embedded === attestation.lineage.sha512 },
    artifacts: checkedLineage.artifacts,
  };
}

export async function readProvenanceJson(filePath, label) {
  return readJson(filePath, label);
}
