import assert from "node:assert/strict";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { doctor, verifyFile } from "../lib/verification.js";

const ROOT = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(ROOT, "..", "test-vectors", "fixtures", "exact-file-v1.txt");

async function withServer(handler, callback) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await callback(`http://127.0.0.1:${port}/api/verify/hash`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("verify sends a local fingerprint and reports a registered result", async () => {
  await withServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    assert.equal(url.searchParams.get("email"), "vector.owner@example.test");
    assert.match(url.searchParams.get("hash") || "", /^[0-9a-f]{128}$/);
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ ok: true, network: "testnet", registryKey: "0x" + "1".repeat(64) }));
  }, async (url) => {
    const result = await verifyFile(FIXTURE, { email: "vector.owner@example.test", url });
    assert.equal(result.verified, true);
    assert.equal(result.status, 200);
    assert.equal(result.verification.network, "testnet");
    assert.equal(result.registryKey, "0x" + "1".repeat(64));
    assert.equal(Object.hasOwn(result.verification, "registryKey"), false);
  });
});

test("verify hides a derived candidate key when no registration is confirmed", async () => {
  await withServer((_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ ok: false, registryKey: "0x" + "3".repeat(64), network: "testnet" }));
  }, async (url) => {
    const result = await verifyFile(FIXTURE, { url });
    assert.equal(result.verified, false);
    assert.equal(result.registryKey, "");
    assert.equal(Object.hasOwn(result.verification, "registryKey"), false);
  });
});

test("doctor performs a read-only valid-hash request", async () => {
  await withServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    assert.equal(url.searchParams.get("hash"), "0".repeat(128));
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ ok: false, network: "testnet", currentRegistryAddress: "0x" + "2".repeat(40) }));
  }, async (url) => {
    const result = await doctor({ url });
    assert.equal(result.reachable, true);
    assert.equal(result.network, "testnet");
    assert.equal(result.contractAddress, "0x" + "2".repeat(40));
  });
});

test("doctor rejects a reachable but unhealthy verification service", async () => {
  await withServer((_request, response) => {
    response.statusCode = 503;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ ok: false, error: "Verification service is not configured." }));
  }, async (url) => {
    await assert.rejects(doctor({ url }), /Verification service is not configured/);
  });
});
