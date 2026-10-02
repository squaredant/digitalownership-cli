import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const registryKey = `0x${"b".repeat(64)}`;
const transactionHash = `0x${"c".repeat(64)}`;

test("publication manifest command creates a public manifest from a local receipt", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "digitalownership-publication-"));
  const receiptPath = path.join(directory, "content.digitalownership.json");
  const archivePath = path.join(directory, "content.registered.txt");
  const manifestPath = path.join(directory, "publication.manifest.json");
  const archiveContent = "published content\n";
  const sha512 = createHash("sha512").update(archiveContent).digest("hex");
  await writeFile(archivePath, archiveContent);
  await writeFile(receiptPath, JSON.stringify({
    schema: "digitalownership-local-record-v1",
    status: "registered",
    hashAlgorithm: "SHA-512",
    hashScope: "digitalownership-exact-file-v1",
    documentHash: sha512,
    registryKey,
    transactionHash,
    accountEmail: "evidence@example.org",
  }));

  const { stdout } = await execFileAsync(process.execPath, [
    "bin/digitalownership.js", "publication", "manifest",
    "--receipt", receiptPath,
    "--archive", archivePath,
    "--url", "https://publisher.example/.well-known/digitalownership/content.json",
    "--label", "Published content",
    "--publisher", "Example Organisation",
    "--out", manifestPath,
    "--published-at", "2026-10-01T10:00:00Z",
  ], { cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname), "..") });

  const output = JSON.parse(stdout);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(output.ok, true);
  assert.equal(output.archive.fingerprint.documentFingerprint, sha512);
  assert.equal(manifest.registrationEmail, "evidence@example.org");
  assert.equal(manifest.files[0].sha512, sha512);
});
