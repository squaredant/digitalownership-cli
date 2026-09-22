import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { getBalance, requestApprovalFile } from "../lib/pipeline-api.js";

async function withServer(handler, callback) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await callback(`http://127.0.0.1:${port}/api/v1`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("balance uses the access token and returns the advisory available-credit value", async () => {
  await withServer((request, response) => {
    assert.equal(request.method, "GET");
    assert.equal(request.url, "/api/v1/balance");
    assert.equal(request.headers.authorization, "Bearer do_at_test-token");
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ availableCredits: 4 }));
  }, async (url) => {
    const result = await getBalance({ token: "do_at_test-token", url });
    assert.deepEqual(result, { availableCredits: 4 });
  });
});

test("required approval creates a browser-approval request instead of registering directly", async () => {
  const originalRegistryAddress = process.env.DIGITALOWNERSHIP_REGISTRY_ADDRESS;
  const originalChainId = process.env.DIGITALOWNERSHIP_CHAIN_ID;
  process.env.DIGITALOWNERSHIP_REGISTRY_ADDRESS = "0xf495d81eb4A64d213f6BAC2bD23EE9A147956169";
  process.env.DIGITALOWNERSHIP_CHAIN_ID = "0xa4b1";
  try {
  await withServer((request, response) => {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/api/v1/approvals");
    assert.equal(request.headers.authorization, "Bearer do_at_test-token");
    let raw = "";
    request.on("data", (chunk) => { raw += chunk; });
    request.on("end", () => {
      const body = JSON.parse(raw);
      assert.equal(body.approvalMode, "required");
      assert.match(body.idempotencyKey, /^cli-required-/);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        approval: {
          id: "approval-1",
          status: "pending",
          approvalUrl: "https://example.test/account?pipelineApproval=approval-1",
        },
      }));
    });
  }, async (url) => {
    const result = await requestApprovalFile("test-vectors/fixtures/exact-file-v1.txt", {
      token: "do_at_test-token",
      url,
    });
    assert.equal(result.response.approval.status, "pending");
    assert.equal(result.fingerprint.hashScope, "digitalownership-exact-file-v1");
  });
  } finally {
    if (originalRegistryAddress === undefined) delete process.env.DIGITALOWNERSHIP_REGISTRY_ADDRESS;
    else process.env.DIGITALOWNERSHIP_REGISTRY_ADDRESS = originalRegistryAddress;
    if (originalChainId === undefined) delete process.env.DIGITALOWNERSHIP_CHAIN_ID;
    else process.env.DIGITALOWNERSHIP_CHAIN_ID = originalChainId;
  }
});
