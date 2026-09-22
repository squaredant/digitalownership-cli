#!/usr/bin/env node

import { fingerprintFile } from "../lib/fingerprint.js";
import { doctor, verifyFile } from "../lib/verification.js";
import { getBalance, issueAccessToken, registerFile, requestApprovalFile, waitForApproval, waitForRegistration } from "../lib/pipeline-api.js";
import { writeArchiveReceipt } from "../lib/archive.js";

const HELP = `DigitalOwnership CLI (pre-release)

Usage:
  digitalownership fingerprint <file>
  digitalownership verify <file> [--email <registration-email>] [--verification-url <url>]
  digitalownership doctor [--verification-url <url>]
  digitalownership token [--pipeline-api-url <url>]
  digitalownership balance [--pipeline-api-url <url>]
  digitalownership register <file> --account --email <account-email> --approval none|required [--wait] [--dry-run] [--no-archive --receipt-out <path>]

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
    if (!new Set(["email", "verification-url", "pipeline-api-url", "approval", "account", "dry-run", "no-archive", "receipt-out", "wait"]).has(name)) {
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

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(HELP);
    return;
  }

  const { options, positional } = parseOptions(args);
  const url = options["verification-url"];

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
      const result = await requestApprovalFile(positional[0], { url: options["pipeline-api-url"] });
      const approval = result.response.approval;
      if (!options.wait) {
        process.stdout.write(`${JSON.stringify({ ok: true, ...result, approval })}\n`);
        return;
      }
      const approved = await waitForApproval(approval.id, { url: options["pipeline-api-url"] });
      if (approved.status !== "approved" || !approved.registrationRequestId) {
        throw new Error(`Pipeline approval is ${approved.status || "not approved"}.`);
      }
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
