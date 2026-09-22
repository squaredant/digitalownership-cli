import { chmod, copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const CLI_VERSION = "0.1.0";

function archiveName(sourcePath, fingerprint) {
  const extension = path.extname(sourcePath);
  const base = path.basename(sourcePath, extension);
  return `${base}.${fingerprint.documentFingerprint.slice(-16)}.registered${extension}`;
}

function networkForChainId(chainId) {
  switch (String(chainId || "").trim().toLowerCase()) {
    case "0xa4b1": return "arbitrum-one";
    case "0x66eee": return "arbitrum-sepolia";
    default: return "";
  }
}

function transactionUrlForChainId(chainId, transactionHash) {
  if (!transactionHash) return "";
  switch (networkForChainId(chainId)) {
    case "arbitrum-one": return `https://arbiscan.io/tx/${transactionHash}`;
    case "arbitrum-sepolia": return `https://sepolia.arbiscan.io/tx/${transactionHash}`;
    default: return "";
  }
}

function receiptRecord({ sourcePath, archivePath, fingerprint, registration }) {
  const result = registration?.result || {};
  const relay = result.relay || {};
  const registered = result.registration || {};
  const transactionHash = relay.transactionHash || registered.transactionHash || "";
  return {
    schema: "digitalownership-local-record-v1",
    tool: "digitalownership-cli",
    toolVersion: CLI_VERSION,
    status: registered.alreadyRegistered ? "already_registered" : "registered",
    sourceFileName: path.basename(sourcePath),
    archiveFileName: archivePath ? path.basename(archivePath) : "",
    archivePath: archivePath || "",
    documentHash: fingerprint.documentFingerprint,
    hashAlgorithm: fingerprint.hashAlgorithm,
    hashScope: fingerprint.hashScope,
    format: fingerprint.format,
    registryKey: registered.documentHash || "",
    registrationMethod: registered.registrationMethod || "email_anchored_account",
    registrationWallet: relay.registrant || registered.registrant || "",
    contract: relay.registryAddress || registered.registryAddress || "",
    network: networkForChainId(registration.chainId),
    transactionHash,
    transactionUrl: transactionUrlForChainId(registration.chainId, transactionHash),
    registeredAt: relay.registeredAt || registered.registeredAt || "",
    registrationStartedAt: registration.createdAt || "",
    pipelineRequestId: registration.id,
    clientReference: registration.clientReference || "",
    createdAt: new Date().toISOString(),
  };
}

export async function writeArchiveReceipt({ sourcePath, fingerprint, registration, receiptOut, noArchive = false }) {
  if (noArchive && !receiptOut) {
    throw new Error("--no-archive requires --receipt-out <path> so the registration receipt is retained.");
  }
  let archivePath = "";
  let outputPath = receiptOut || "";
  if (!noArchive) {
    const directory = path.join(path.dirname(path.resolve(sourcePath)), "DigitalOwnershipArchive");
    await mkdir(directory, { recursive: true });
    archivePath = path.join(directory, archiveName(sourcePath, fingerprint));
    await copyFile(sourcePath, archivePath);
    // This is a local accidental-edit safeguard, not immutable storage.
    await chmod(archivePath, 0o444);
    outputPath = path.join(directory, ".DigitalOwnershipRecords", `${path.basename(archivePath)}.digitalownership.json`);
  }
  const receipt = receiptRecord({ sourcePath, archivePath, fingerprint, registration });
  await mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  if (!noArchive) await chmod(outputPath, 0o444);
  return { archivePath, receiptPath: outputPath, receipt };
}
