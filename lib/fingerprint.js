import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { ethers } from "ethers";
import { unzipSync } from "fflate";

export const HASH_ALGORITHM = "SHA-512";
export const CONTENT_HASH_SCOPE = "digitalownership-content-v1";
export const PDF_HASH_SCOPE = "digitalownership-pdf-file-v1";
export const EXACT_FILE_HASH_SCOPE = "digitalownership-exact-file-v1";
export const EMAIL_REGISTRATION_SCOPE = "digitalownership-email-v1";

const OFFICE_EXTENSIONS = new Set(["odt", "ods", "odp", "odg", "docx", "xlsx", "pptx"]);
const EXACT_FILE_EXTENSIONS = new Set([
  "svg", "txt", "csv", "rtf", "md", "json", "xml", "zip",
  "tsv", "tab", "jsonl", "ndjson", "yaml", "yml", "toml", "ini", "log",
  "rds", "rda", "rdata", "pkl", "pickle", "joblib", "npy", "npz",
  "parquet", "feather", "arrow", "avro", "orc",
  "h5", "hdf", "hdf5", "nc", "netcdf", "dta", "sav", "sas7bdat",
  "sqlite", "db", "duckdb",
  "png", "jpg", "jpeg", "tif", "tiff", "gif", "doc", "xls", "ppt",
  "mp4", "mov", "mp3", "wav", "m4a", "aac", "flac", "aiff", "ogg",
]);
const ODF_VOLATILE_ENTRIES = new Set(["meta.xml", "settings.xml", "styles.xml"]);

function sha512Hex(bytes) {
  return createHash("sha512").update(bytes).digest("hex");
}

function extensionOf(path) {
  return extname(path).slice(1).toLowerCase();
}

function includedEntryNames(entries, extension) {
  const names = Object.keys(entries).filter((name) => !name.endsWith("/"));

  if (["odt", "ods", "odp", "odg"].includes(extension)) {
    if (!entries.mimetype || (!entries["content.xml"] && !entries["META-INF/manifest.xml"])) {
      throw new Error("This is not a supported OpenDocument package.");
    }
    return names
      .filter((name) => !ODF_VOLATILE_ENTRIES.has(name) && !name.startsWith("Thumbnails/"))
      .sort();
  }

  const requirements = {
    docx: ["word/document.xml", "word/", "word/settings.xml"],
    xlsx: ["xl/workbook.xml", "xl/", "xl/calcChain.xml"],
    pptx: ["ppt/presentation.xml", "ppt/", ""],
  };
  const [required, prefix, volatile] = requirements[extension] || [];
  if (!entries["[Content_Types].xml"] || !entries[required]) {
    throw new Error(`This is not a supported ${extension.toUpperCase()} package.`);
  }
  return names.filter((name) => name.startsWith(prefix) && name !== volatile).sort();
}

function contentHash(bytes, extension) {
  let entries;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new Error("The file is not a readable ZIP/Office package.");
  }

  const names = includedEntryNames(entries, extension);
  if (!names.length) throw new Error("No stable document content was found in this package.");

  const parts = [];
  for (const name of names) {
    const entry = entries[name];
    const fileHash = sha512Hex(entry);
    parts.push(Buffer.from("FILE\0", "utf8"));
    parts.push(Buffer.from(name, "utf8"));
    parts.push(Buffer.from("\0", "utf8"));
    parts.push(Buffer.from(String(entry.length), "ascii"));
    parts.push(Buffer.from("\0", "utf8"));
    parts.push(Buffer.from(fileHash, "ascii"));
    parts.push(Buffer.from("\0", "utf8"));
  }

  return { documentFingerprint: sha512Hex(Buffer.concat(parts)), includedEntries: names };
}

export function walletRegistryKey(documentFingerprint) {
  const normalized = String(documentFingerprint || "").trim().toLowerCase();
  if (!/^[0-9a-f]{128}$/.test(normalized)) {
    throw new Error("A wallet registry key requires a lowercase SHA-512 document fingerprint.");
  }
  return ethers.keccak256(ethers.toUtf8Bytes(normalized));
}

export function emailAnchoredRegistryKey(documentFingerprint, email) {
  const normalizedFingerprint = String(documentFingerprint || "").trim().toLowerCase();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!/^[0-9a-f]{128}$/.test(normalizedFingerprint)) {
    throw new Error("An account registry key requires a lowercase SHA-512 document fingerprint.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error("An account registry key requires a valid email address.");
  }
  const emailClaimHash = ethers.keccak256(
    ethers.toUtf8Bytes(`${EMAIL_REGISTRATION_SCOPE}:email:${normalizedEmail}`),
  );
  return ethers.keccak256(
    ethers.toUtf8Bytes(`${EMAIL_REGISTRATION_SCOPE}:registration:${normalizedFingerprint}:${emailClaimHash}`),
  );
}

export async function fingerprintFile(path) {
  const extension = extensionOf(path);
  const bytes = await readFile(path);
  let result;

  if (OFFICE_EXTENSIONS.has(extension)) {
    result = {
      ...contentHash(bytes, extension),
      hashScope: CONTENT_HASH_SCOPE,
    };
  } else if (extension === "pdf") {
    result = {
      documentFingerprint: sha512Hex(bytes),
      includedEntries: [],
      hashScope: PDF_HASH_SCOPE,
    };
  } else if (EXACT_FILE_EXTENSIONS.has(extension)) {
    result = {
      documentFingerprint: sha512Hex(bytes),
      includedEntries: [],
      hashScope: EXACT_FILE_HASH_SCOPE,
    };
  } else {
    throw new Error(`Unsupported file type: ${extension || basename(path)}.`);
  }

  return {
    fileName: basename(path),
    format: extension,
    hashAlgorithm: HASH_ALGORITHM,
    ...result,
  };
}
