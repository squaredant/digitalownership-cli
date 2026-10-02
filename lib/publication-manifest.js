export const PUBLICATION_MANIFEST_SCHEMA = "digitalownership-publication-manifest-v1";
export const PUBLICATION_MANIFEST_HASH_SCOPE = "digitalownership-exact-file-v1";

const SHA512_PATTERN = /^[0-9a-f]{128}$/;
const REGISTRY_KEY_PATTERN = /^0x[0-9a-f]{64}$/i;
const TRANSACTION_HASH_PATTERN = /^0x[0-9a-f]{64}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOCAL_RECEIPT_SCHEMA = "digitalownership-local-record-v1";
const LEGACY_CLI_RECEIPT_SCHEMA = "digitalownership-cli-receipt-v1";

function requireObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be a JSON object.`);
  }
}

function requireText(value, name, { maxLength = 500 } = {}) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new Error(`${name} must be a non-empty string of at most ${maxLength} characters.`);
  }
  return value.trim();
}

function canonicalHttpsUrl(value, name) {
  const text = requireText(value, name, { maxLength: 2_048 });
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${name} must be an absolute HTTPS URL.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error(`${name} must be an absolute HTTPS URL without credentials or a fragment.`);
  }
  return url.toString();
}

// This validates the narrow first-release publication contract. Browser fetch,
// CORS diagnostics, and visible-page comparison are implemented separately.
export function validatePublicationManifest(manifest) {
  requireObject(manifest, "manifest");
  if (manifest.schema !== PUBLICATION_MANIFEST_SCHEMA) {
    throw new Error(`schema must be ${PUBLICATION_MANIFEST_SCHEMA}.`);
  }
  const registrationEmail = requireText(manifest.registrationEmail, "registrationEmail", { maxLength: 320 }).toLowerCase();
  if (!EMAIL_PATTERN.test(registrationEmail)) throw new Error("registrationEmail must be a valid public email address.");
  const publishedAt = requireText(manifest.publishedAt, "publishedAt", { maxLength: 64 });
  if (Number.isNaN(Date.parse(publishedAt))) throw new Error("publishedAt must be an ISO 8601 timestamp.");
  const publisher = requireText(manifest.publisher, "publisher", { maxLength: 200 });

  if (!Array.isArray(manifest.files) || manifest.files.length !== 1) {
    throw new Error("files must contain exactly one canonical content file in publication-manifest-v1.");
  }
  const [file] = manifest.files;
  requireObject(file, "files[0]");
  const sha512 = requireText(file.sha512, "files[0].sha512", { maxLength: 128 }).toLowerCase();
  if (!SHA512_PATTERN.test(sha512)) throw new Error("files[0].sha512 must be a lowercase SHA-512 hexadecimal fingerprint.");
  if (file.hashScope !== PUBLICATION_MANIFEST_HASH_SCOPE) {
    throw new Error(`files[0].hashScope must be ${PUBLICATION_MANIFEST_HASH_SCOPE}.`);
  }
  const registryKey = requireText(file.registryKey, "files[0].registryKey", { maxLength: 66 });
  if (!REGISTRY_KEY_PATTERN.test(registryKey)) throw new Error("files[0].registryKey must be a 32-byte 0x-prefixed hexadecimal value.");
  const transactionHash = requireText(file.transactionHash, "files[0].transactionHash", { maxLength: 66 });
  if (!TRANSACTION_HASH_PATTERN.test(transactionHash)) throw new Error("files[0].transactionHash must be a 32-byte 0x-prefixed hexadecimal value.");

  return {
    schema: PUBLICATION_MANIFEST_SCHEMA,
    publisher,
    registrationEmail,
    publishedAt: new Date(publishedAt).toISOString(),
    files: [{
      label: requireText(file.label, "files[0].label", { maxLength: 200 }),
      url: canonicalHttpsUrl(file.url, "files[0].url"),
      sha512,
      hashScope: PUBLICATION_MANIFEST_HASH_SCOPE,
      registryKey: registryKey.toLowerCase(),
      transactionHash: transactionHash.toLowerCase(),
    }],
  };
}

// Builds the public manifest from the local receipt without contacting a
// DigitalOwnership service. The publisher remains responsible for hosting
// byte-identical content at the supplied public URL.
export function createPublicationManifest({ receipt, archiveFingerprint, url, label, publisher, email = "", publishedAt = new Date().toISOString() }) {
  requireObject(receipt, "receipt");
  const currentReceipt = receipt.schema === LOCAL_RECEIPT_SCHEMA
    && new Set(["registered", "already_registered"]).has(receipt.status);
  const legacyReceipt = receipt.schema === LEGACY_CLI_RECEIPT_SCHEMA && receipt.status === "completed";
  if (!currentReceipt && !legacyReceipt) {
    throw new Error(`receipt must be a completed ${LOCAL_RECEIPT_SCHEMA} or ${LEGACY_CLI_RECEIPT_SCHEMA} record.`);
  }
  if (receipt.hashAlgorithm !== "SHA-512") {
    throw new Error("receipt.hashAlgorithm must be SHA-512.");
  }
  if (receipt.hashScope !== PUBLICATION_MANIFEST_HASH_SCOPE) {
    throw new Error(`receipt.hashScope must be ${PUBLICATION_MANIFEST_HASH_SCOPE}.`);
  }
  requireObject(archiveFingerprint, "archive fingerprint");
  if (archiveFingerprint.hashAlgorithm !== receipt.hashAlgorithm) {
    throw new Error("The archive hash algorithm does not match the receipt.");
  }
  if (archiveFingerprint.hashScope !== receipt.hashScope) {
    throw new Error("The archive hash scope does not match the receipt.");
  }
  if (String(archiveFingerprint.documentFingerprint || "").toLowerCase() !== String(receipt.documentHash || "").toLowerCase()) {
    throw new Error("The archive fingerprint does not match the receipt documentHash.");
  }

  const receiptEmail = typeof receipt.accountEmail === "string" ? receipt.accountEmail.trim().toLowerCase() : "";
  const requestedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (receiptEmail && requestedEmail && receiptEmail !== requestedEmail) {
    throw new Error("--email must match receipt.accountEmail when the receipt contains an account email.");
  }
  const registrationEmail = requestedEmail || receiptEmail;
  if (!registrationEmail) {
    throw new Error("Provide --email because this receipt does not contain accountEmail.");
  }

  return validatePublicationManifest({
    schema: PUBLICATION_MANIFEST_SCHEMA,
    publisher,
    registrationEmail,
    publishedAt,
    files: [{
      label,
      url,
      sha512: receipt.documentHash,
      hashScope: receipt.hashScope,
      registryKey: receipt.registryKey,
      transactionHash: receipt.transactionHash,
    }],
  });
}
