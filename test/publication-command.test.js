import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
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

test("publication publish coordinates two required approvals and keeps receipts outside public files", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "digitalownership-publication-publish-"));
  const contentPath = path.join(directory, "terms.content.json");
  const manifestPath = path.join(directory, "public", "terms.manifest.json");
  const receiptDir = path.join(directory, "private-receipts");
  await writeFile(contentPath, '{"publication":"Terms"}\n');

  let approvalCount = 0;
  const server = createServer((request, response) => {
    const respond = (body) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(body));
    };
    if (request.method === "POST" && request.url === "/api/v1/approvals") {
      approvalCount += 1;
      respond({ approval: { id: `approval-${approvalCount}`, status: "pending", approvalUrl: `https://approve.example/${approvalCount}` } });
      return;
    }
    if (request.method === "GET" && request.url?.startsWith("/api/v1/approvals/approval-")) {
      const id = request.url.split("/").pop();
      respond({ approval: { id, status: "approved", registrationRequestId: `registration-${id}` } });
      return;
    }
    if (request.method === "GET" && request.url?.startsWith("/api/v1/registrations/registration-approval-")) {
      const requestId = request.url.split("/").pop();
      respond({ registration: {
        id: requestId,
        status: "completed",
        createdAt: "2026-10-02 12:00:00",
        result: {
          registration: {
            documentHash: registryKey,
            registrationMethod: "email_anchored_account",
            registrant: "0xa78E595e5513603D8Cdba6acD0977ADf0301f64e",
            chainId: "0xa4b1",
          },
          relay: {
            registryAddress: "0xf495d81eb4A64d213f6BAC2bD23EE9A147956169",
            transactionHash,
            registeredAt: "1790942400",
            chainId: "0xa4b1",
          },
        },
      } });
      return;
    }
    response.statusCode = 404;
    respond({ error: "not found" });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      "bin/digitalownership.js", "publication", "publish", contentPath,
      "--account", "--email", "digitalownership@squaredant.com",
      "--url", "https://digitalownership.squaredant.com/.well-known/digitalownership/terms.content.json",
      "--label", "Terms", "--publisher", "SquaredAnt GmbH",
      "--approval", "required", "--wait",
      "--manifest-out", manifestPath,
      "--receipt-dir", receiptDir,
      "--pipeline-api-url", `http://127.0.0.1:${port}/api/v1`,
    ], {
      cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname), ".."),
      env: {
        ...process.env,
        DIGITALOWNERSHIP_PIPELINE_TOKEN: "do_at_test-token",
        DIGITALOWNERSHIP_REGISTRY_ADDRESS: "0xf495d81eb4A64d213f6BAC2bD23EE9A147956169",
        DIGITALOWNERSHIP_CHAIN_ID: "0xa4b1",
      },
    });

    const output = JSON.parse(stdout);
    assert.equal(output.ok, true);
    assert.equal(approvalCount, 2);
    assert.match(stderr, /Approve canonical content registration: https:\/\/approve\.example\/1/);
    assert.match(stderr, /Approve publication manifest registration: https:\/\/approve\.example\/2/);
    assert.equal(output.publication.content.receiptPath, path.join(receiptDir, "terms.content.json.digitalownership.json"));
    assert.equal(output.publication.manifest.receiptPath, path.join(receiptDir, "terms.manifest.json.digitalownership.json"));
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(manifest.registrationEmail, "digitalownership@squaredant.com");
    assert.equal(manifest.files[0].url, "https://digitalownership.squaredant.com/.well-known/digitalownership/terms.content.json");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
