import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { writeArchiveReceipt } from "../lib/archive.js";

test("archive receipt follows the desktop local-record convention", async () => {
  const directory = await mkdtemp(join(tmpdir(), "digitalownership-cli-archive-"));
  const sourcePath = join(directory, "report.txt");
  await writeFile(sourcePath, "pipeline report\n");
  const archive = await writeArchiveReceipt({
    sourcePath,
    fingerprint: {
      documentFingerprint: "a".repeat(128),
      hashAlgorithm: "SHA-512",
      hashScope: "digitalownership-exact-file-v1",
      format: "txt",
    },
    registration: {
      id: "request-123",
      chainId: "0xa4b1",
      clientReference: "report.txt",
      createdAt: "2026-09-21 08:00:00",
      result: {
        registration: {
          documentHash: `0x${"b".repeat(64)}`,
          registrationMethod: "email_anchored_account",
          registrant: "0xa78E595e5513603D8Cdba6acD0977ADf0301f64e",
        },
        relay: {
          registryAddress: "0xf495d81eb4A64d213f6BAC2bD23EE9A147956169",
          transactionHash: `0x${"c".repeat(64)}`,
          registeredAt: "1789983920",
        },
      },
    },
  });
  const receipt = JSON.parse(await readFile(archive.receiptPath, "utf8"));

  assert.equal(receipt.schema, "digitalownership-local-record-v1");
  assert.equal(receipt.tool, "digitalownership-cli");
  assert.equal(receipt.status, "registered");
  assert.equal(receipt.network, "arbitrum-one");
  assert.equal(receipt.transactionUrl, `https://arbiscan.io/tx/0x${"c".repeat(64)}`);
  assert.equal(receipt.registrationStartedAt, "2026-09-21 08:00:00");
  assert.equal(receipt.pipelineRequestId, "request-123");
  assert.equal(Object.hasOwn(receipt, "networkChainId"), false);
  assert.equal(Object.hasOwn(receipt, "accountEmail"), false);
});
