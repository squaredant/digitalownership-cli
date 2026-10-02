#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fingerprintFile } from "../lib/fingerprint.js";
import { doctor, verifyFile } from "../lib/verification.js";
import { getBalance, issueAccessToken, registerFile, requestApprovalFile, waitForApproval, waitForRegistration } from "../lib/pipeline-api.js";
import { writeArchiveReceipt } from "../lib/archive.js";
import { createPublicationManifest } from "../lib/publication-manifest.js";

const HELP = `DigitalOwnership CLI (pre-release)

Usage:
  digitalownership fingerprint <file>
  digitalownership verify <file> [--email <registration-email>] [--verification-url <url>]
  digitalownership doctor [--verification-url <url>]
  digitalownership token [--pipeline-api-url <url>]
  digitalownership balance [--pipeline-api-url <url>]
  digitalownership register <file> --account --email <account-email> --approval none|required [--wait] [--dry-run] [--no-archive --receipt-out <path>]
  digitalownership publication manifest --receipt <receipt.json> --archive <registered-file> --url <https-url> --label <label> --publisher <publisher> --out <manifest.json> [--email <public-account-email>] [--published-at <ISO-8601>]
  digitalownership publication publish <content.json> --account --email <public-account-email> --url <https-url> --label <label> --publisher <publisher> --approval required --wait --manifest-out <manifest.json> --receipt-dir <private-directory> [--published-at <ISO-8601>]

Environment:
  DIGITALOWNERSHIP_VERIFICATION_URL  Public verification endpoint.
  DIGITALOWNERSHIP_PIPELINE_CREDENTIAL  Pipeline credential, read only by \`token\`.
  DIGITALOWNERSHIP_PIPELINE_TOKEN  Five-minute pipeline access token.
  DIGITALOWNERSHIP_REGISTRY_ADDRESS / DIGITALOWNERSHIP_CHAIN_ID  Registration target.
`;

function fail(message, exitCode = 2) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  process.exitCode = exitCode;
}

function parseOptions(args) {
  const options = {};
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }
    const name = value.slice(2);
    if (!new Set(["email", "verification-url", "pipeline-api-url", "approval", "account", "dry-run", "no-archive", "receipt-out", "wait", "receipt", "archive", "url", "label", "publisher", "out", "manifest-out", "receipt-dir", "published-at"]).has(name)) {
      throw new Error(`Unknown option: ${value}`);
    }
    if (new Set(["account", "dry-run", "no-archive", "wait"]).has(name)) {
      options[name] = true;
      continue;
    }
    const optionValue = args[index + 1];
    if (!optionValue || optionValue.startsWith("--")) throw new Error(`Missing value for ${value}.`);
    options[name] = optionValue;
    index += 1;
  }
  return { options, positional };
}

function isExpiredTokenError(error) {
  return /invalid or expired/i.test(error?.message || "");
}

async function requestApprovalWithRefresh(sourcePath, { url } = {}) {
  try {
    return await requestApprovalFile(sourcePath, { url });
  } catch (error) {
    if (!isExpiredTokenError(error) || !process.env.DIGITALOWNERSHIP_PIPELINE_CREDENTIAL) throw error;
    const { accessToken } = await issueAccessToken({ url });
    return requestApprovalFile(sourcePath, { token: accessToken, url });
  }
}

function showApproval(approval, label) {
  if (!approval?.approvalUrl) throw new Error("Pipeline approval did not include an approval URL.");
  process.stderr.write(`${label}: ${approval.approvalUrl}\n`);
}

async function registerWithRequiredApproval(sourcePath, { email, receiptOut, noArchive = false, url, label = "Open the browser approval URL" } = {}) {
  const result = await requestApprovalWithRefresh(sourcePath, { url });
  const approval = result.response.approval;
  showApproval(approval, label);
  const approved = await waitForApproval(approval.id, { url });
  if (approved.status !== "approved" || !approved.registrationRequestId) {
    throw new Error(`Pipeline approval is ${approved.status || "not approved"}.`);
  }
  const registration = await waitForRegistration(approved.registrationRequestId, { url });
  if (registration.status !== "completed") throw new Error(registration.error || "Registration failed.");
  const archive = await writeArchiveReceipt({
    sourcePath,
    fingerprint: result.fingerprint,
    registration,
    accountEmail: email,
    noArchive,
    receiptOut,
  });
  return { ...result, approval: approved, registration, archive };
}

async function assertNewFile(targetPath, label) {
  try {
    await access(targetPath);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw new Error(`Cannot access ${label}: ${error.message}`);
  }
  throw new Error(`Refusing to overwrite existing ${label}: ${targetPath}`);
}

async function publishPublication(contentPath, options) {
  const email = options.email.trim();
  const receiptDir = path.resolve(options["receipt-dir"]);
  const manifestPath = path.resolve(options["manifest-out"]);
  const contentReceiptPath = path.join(receiptDir, `${path.basename(contentPath)}.digitalownership.json`);
  const manifestReceiptPath = path.join(receiptDir, `${path.basename(manifestPath)}.digitalownership.json`);
  await mkdir(receiptDir, { recursive: true });
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await assertNewFile(contentReceiptPath, "content receipt");
  await assertNewFile(manifestPath, "manifest");
  await assertNewFile(manifestReceiptPath, "manifest receipt");

  const content = await registerWithRequiredApproval(contentPath, {
    email,
    noArchive: true,
    receiptOut: contentReceiptPath,
    url: options["pipeline-api-url"],
    label: "Approve canonical content registration",
  });
  const manifest = createPublicationManifest({
    receipt: content.archive.receipt,
    archiveFingerprint: await fingerprintFile(contentPath),
    url: options.url,
    label: options.label,
    publisher: options.publisher,
    email,
    publishedAt: options["published-at"],
  });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  const manifestRegistration = await registerWithRequiredApproval(manifestPath, {
    email,
    noArchive: true,
    receiptOut: manifestReceiptPath,
    url: options["pipeline-api-url"],
    label: "Approve publication manifest registration",
  });
  return {
    content: { path: path.resolve(contentPath), receiptPath: contentReceiptPath, registration: content.registration },
    manifest: { path: manifestPath, receiptPath: manifestReceiptPath, registration: manifestRegistration.registration },
  };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(HELP);
    return;
  }

  const { options, positional } = parseOptions(args);
  const url = options["verification-url"];

  if (command === "publication") {
    if (positional[0] === "publish") {
      if (positional.length !== 2 || !options.account || options.approval !== "required" || !options.wait) {
        throw new Error("Usage: digitalownership publication publish <content.json> --account --email <public-account-email> --url <https-url> --label <label> --publisher <publisher> --approval required --wait --manifest-out <manifest.json> --receipt-dir <private-directory>");
      }
      for (const name of ["email", "url", "label", "publisher", "manifest-out", "receipt-dir"]) {
        if (!options[name]?.trim()) throw new Error(`--${name} is required for publication publish.`);
      }
      const result = await publishPublication(positional[1], options);
      process.stdout.write(`${JSON.stringify({ ok: true, publication: result })}\n`);
      return;
    }
    if (positional.length !== 1 || positional[0] !== "manifest") {
      throw new Error("Usage: digitalownership publication manifest --receipt <receipt.json> --archive <registered-file> --url <https-url> --label <label> --publisher <publisher> --out <manifest.json>");
    }
    for (const name of ["receipt", "archive", "url", "label", "publisher", "out"]) {
      if (!options[name]?.trim()) throw new Error(`--${name} is required for publication manifest.`);
    }
    let receipt;
    try {
      receipt = JSON.parse(await readFile(options.receipt, "utf8"));
    } catch (error) {
      throw new Error(`Cannot read receipt JSON: ${error.message}`);
    }
    const archiveFingerprint = await fingerprintFile(options.archive);
    const manifest = createPublicationManifest({
      receipt,
      archiveFingerprint,
      url: options.url,
      label: options.label,
      publisher: options.publisher,
      email: options.email,
      publishedAt: options["published-at"],
    });
    try {
      await writeFile(options.out, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    } catch (error) {
      if (error.code === "EEXIST") throw new Error(`Refusing to overwrite existing manifest: ${options.out}`);
      throw new Error(`Cannot write manifest: ${error.message}`);
    }
    process.stdout.write(`${JSON.stringify({ ok: true, manifestPath: options.out, archive: { path: options.archive, fingerprint: archiveFingerprint }, manifest })}\n`);
    return;
  }
  if (command === "fingerprint") {
    if (positional.length !== 1) throw new Error("Usage: digitalownership fingerprint <file>");
    process.stdout.write(`${JSON.stringify({ ok: true, fingerprint: await fingerprintFile(positional[0]) })}\n`);
    return;
  }
  if (command === "verify") {
    if (positional.length !== 1) throw new Error("Usage: digitalownership verify <file> [--email <registration-email>]");
    const result = await verifyFile(positional[0], { email: options.email || "", url });
    process.stdout.write(`${JSON.stringify({ ok: result.verified, ...result })}\n`);
    if (!result.verified) process.exitCode = 1;
    return;
  }
  if (command === "doctor") {
    if (positional.length) throw new Error("Usage: digitalownership doctor [--verification-url <url>]");
    process.stdout.write(`${JSON.stringify({ ok: true, doctor: await doctor({ url }) })}\n`);
    return;
  }
  if (command === "token") {
    if (positional.length) throw new Error("Usage: digitalownership token [--pipeline-api-url <url>]");
    const result = await issueAccessToken({ url: options["pipeline-api-url"] });
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
    return;
  }
  if (command === "balance") {
    if (positional.length) throw new Error("Usage: digitalownership balance [--pipeline-api-url <url>]");
    process.stdout.write(`${JSON.stringify({ ok: true, ...(await getBalance({ url: options["pipeline-api-url"] })) })}\n`);
    return;
  }
  if (command === "register") {
    if (positional.length !== 1 || !options.account || !options.email?.trim()) {
      throw new Error("Usage: digitalownership register <file> --account --email <account-email> --approval none|required [--wait] [--dry-run]");
    }
    if (options["no-archive"] && !options["receipt-out"]) {
      throw new Error("--no-archive requires --receipt-out <path> so the registration receipt is retained.");
    }
    if (options.approval === "required") {
      if (options["dry-run"]) throw new Error("--dry-run is available only with --approval none.");
      const result = await requestApprovalWithRefresh(positional[0], { url: options["pipeline-api-url"] });
      const approval = result.response.approval;
      if (!options.wait) {
        process.stdout.write(`${JSON.stringify({ ok: true, ...result, approval })}\n`);
        return;
      }
      showApproval(approval, "Open the browser approval URL");
      const approved = await waitForApproval(approval.id, { url: options["pipeline-api-url"] });
      if (approved.status !== "approved" || !approved.registrationRequestId) throw new Error(`Pipeline approval is ${approved.status || "not approved"}.`);
      const registration = await waitForRegistration(approved.registrationRequestId, { url: options["pipeline-api-url"] });
      if (registration.status !== "completed") throw new Error(registration.error || "Registration failed.");
      const archive = await writeArchiveReceipt({ sourcePath: positional[0], fingerprint: result.fingerprint, registration, accountEmail: options.email.trim(), noArchive: Boolean(options["no-archive"]), receiptOut: options["receipt-out"] });
      process.stdout.write(`${JSON.stringify({ ok: true, ...result, approval: approved, registration, archive })}\n`);
      return;
    }
    const result = await registerFile(positional[0], {
      approvalMode: options.approval,
      dryRun: Boolean(options["dry-run"]),
      url: options["pipeline-api-url"],
    });
    if (options["dry-run"]) {
      process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
      return;
    }
    const registration = await waitForRegistration(result.response.registration.id, { url: options["pipeline-api-url"] });
    if (registration.status !== "completed") throw new Error(registration.error || "Registration failed.");
    const archive = await writeArchiveReceipt({
      sourcePath: positional[0],
      fingerprint: result.fingerprint,
      registration,
      accountEmail: options.email.trim(),
      noArchive: Boolean(options["no-archive"]),
      receiptOut: options["receipt-out"],
    });
    process.stdout.write(`${JSON.stringify({ ok: true, ...result, registration, archive })}\n`);
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => fail(error.message || "Command failed."));
