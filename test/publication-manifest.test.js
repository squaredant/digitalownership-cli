import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

import { createPublicationManifest, validatePublicationManifest } from "../lib/publication-manifest.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(await readFile(path.join(root, "test-vectors", "publication-manifest.v1.example.json"), "utf8"));

test("publication manifest v1 accepts one public exact-file content resource", () => {
  const manifest = validatePublicationManifest(fixture);
  assert.equal(manifest.registrationEmail, "evidence@example.org");
  assert.equal(manifest.files.length, 1);
  assert.equal(manifest.files[0].hashScope, "digitalownership-exact-file-v1");
});

test("publication manifest v1 rejects multiple files until multi-file verification is specified", () => {
  assert.throws(
    () => validatePublicationManifest({ ...fixture, files: [fixture.files[0], fixture.files[0]] }),
    /exactly one canonical content file/,
  );
});

test("publication manifest v1 requires an HTTPS canonical content URL", () => {
  assert.throws(
    () => validatePublicationManifest({
      ...fixture,
      files: [{ ...fixture.files[0], url: "http://www.example.org/content.json" }],
    }),
    /absolute HTTPS URL/,
  );
});

const receipt = {
  schema: "digitalownership-local-record-v1",
  status: "registered",
  hashAlgorithm: "SHA-512",
  hashScope: "digitalownership-exact-file-v1",
  documentHash: fixture.files[0].sha512,
  registryKey: fixture.files[0].registryKey,
  transactionHash: fixture.files[0].transactionHash,
  accountEmail: "evidence@example.org",
};
const archiveFingerprint = {
  hashAlgorithm: "SHA-512",
  hashScope: "digitalownership-exact-file-v1",
  documentFingerprint: fixture.files[0].sha512,
};

test("publication manifest is created from a completed exact-file receipt", () => {
  const manifest = createPublicationManifest({
    receipt,
    archiveFingerprint,
    publisher: "Example Organisation",
    label: "Terms of Service",
    url: fixture.files[0].url,
    publishedAt: "2026-10-01T10:00:00Z",
  });
  assert.deepEqual(manifest, {
    ...fixture,
    publishedAt: "2026-10-01T10:00:00.000Z",
  });
});

test("publication manifest rejects an incompatible receipt scope or account email", () => {
  assert.throws(
    () => createPublicationManifest({ ...fixture, receipt: { ...receipt, hashScope: "digitalownership-content-v1" }, archiveFingerprint }),
    /receipt.hashScope/,
  );
  assert.throws(
    () => createPublicationManifest({ ...fixture, receipt, archiveFingerprint, email: "other@example.org" }),
    /must match receipt.accountEmail/,
  );
});

test("publication manifest accepts a completed legacy CLI receipt with an explicit email", () => {
  const manifest = createPublicationManifest({
    receipt: {
      ...receipt,
      schema: "digitalownership-cli-receipt-v1",
      status: "completed",
      accountEmail: "",
    },
    archiveFingerprint,
    publisher: "Example Organisation",
    label: "Terms of Service",
    url: fixture.files[0].url,
    email: "evidence@example.org",
    publishedAt: "2026-10-01T10:00:00Z",
  });
  assert.equal(manifest.registrationEmail, "evidence@example.org");
});

test("publication manifest rejects an archive that does not match the receipt", () => {
  assert.throws(
    () => createPublicationManifest({
      receipt,
      archiveFingerprint: { ...archiveFingerprint, documentFingerprint: "f".repeat(128) },
      publisher: "Example Organisation",
      label: "Terms of Service",
      url: fixture.files[0].url,
    }),
    /archive fingerprint does not match/,
  );
});
