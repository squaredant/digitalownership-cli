import { fingerprintFile } from "./fingerprint.js";

export const DEFAULT_VERIFICATION_URL = "https://digitalownership.squaredant.com/api/verify/hash";

function verificationUrl(configuredUrl) {
  const value = configuredUrl || process.env.DIGITALOWNERSHIP_VERIFICATION_URL || DEFAULT_VERIFICATION_URL;
  try {
    return new URL(value);
  } catch {
    throw new Error("DIGITALOWNERSHIP_VERIFICATION_URL must be an absolute URL.");
  }
}

async function fetchJson(url) {
  let response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (error) {
    throw new Error(`Could not reach the verification service: ${error.message}`);
  }
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

export async function verifyFile(path, { email = "", url } = {}) {
  const fingerprint = await fingerprintFile(path);
  const requestUrl = verificationUrl(url);
  requestUrl.searchParams.set("hash", fingerprint.documentFingerprint);
  if (email.trim()) requestUrl.searchParams.set("email", email.trim());
  const { response, body } = await fetchJson(requestUrl);

  if (!response.ok) {
    throw new Error(body?.error || `Verification service returned HTTP ${response.status}.`);
  }
  const verified = Boolean(body?.ok);
  const { registryKey: responseRegistryKey, ...verification } = body;
  return {
    endpoint: requestUrl.origin + requestUrl.pathname,
    fingerprint,
    verification,
    verified,
    // `registryKey` is reserved for a registration confirmed by the service.
    registryKey: verified ? String(responseRegistryKey || "") : "",
    status: response.status,
  };
}

export async function doctor({ url } = {}) {
  const requestUrl = verificationUrl(url);
  requestUrl.searchParams.set("hash", "0".repeat(128));
  const { response, body } = await fetchJson(requestUrl);
  if (!response.ok) {
    throw new Error(body?.error || `Verification service returned HTTP ${response.status}.`);
  }
  return {
    endpoint: requestUrl.origin + requestUrl.pathname,
    reachable: true,
    status: response.status,
    network: body?.network || "",
    contractAddress: body?.currentRegistryAddress || body?.contractAddress || "",
  };
}
