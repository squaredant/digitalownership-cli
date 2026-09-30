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

async function fetchJson(url, body) {
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(`Could not reach the verification service: ${error.message}`);
  }
  const responseBody = await response.json().catch(() => ({}));
  return { response, body: responseBody };
}

export async function verifyFile(path, { email = "", url } = {}) {
  const fingerprint = await fingerprintFile(path);
  const requestUrl = verificationUrl(url);
  const { response, body } = await fetchJson(requestUrl, {
    hash: fingerprint.documentFingerprint,
    ...(email.trim() ? { email: email.trim() } : {}),
  });

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
  const { response, body } = await fetchJson(requestUrl, { hash: "0".repeat(128) });
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
