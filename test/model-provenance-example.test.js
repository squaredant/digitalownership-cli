import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("local model provenance example has consistent artifact, lineage, and attestation hashes", async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    ["examples/model-provenance/verify-local-example.mjs"],
    { cwd: root },
  );
  assert.match(stdout, /Local model provenance example is internally consistent\./);
});

test("provenance verify command accepts the local model provenance example", async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      "bin/digitalownership.js", "provenance", "verify",
      "--base-dir", "examples/model-provenance",
      "--model", "artifacts/model-v1.json",
      "--attestation", "evidence/training-v1.run-attestation.json",
    ],
    { cwd: root },
  );
  const output = JSON.parse(stdout);
  assert.equal(output.ok, true);
  assert.equal(output.provenance.verified, true);
  assert.equal(output.provenance.embeddedLineage.matches, true);
});
