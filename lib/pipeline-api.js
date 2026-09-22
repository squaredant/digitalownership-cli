import { fingerprintFile } from "./fingerprint.js";

const DEFAULT_API_URL = "https://digitalownership.squaredant.com/api/credit/api/v1";

function apiUrl(value) {
  const raw = value || process.env.DIGITALOWNERSHIP_PIPELINE_API_URL || DEFAULT_API_URL;
  try {
    return new URL(raw.endsWith("/") ? raw : `${raw}/`);
  } catch {
    throw new Error("DIGITALOWNERSHIP_PIPELINE_API_URL must be an absolute URL.");
  }
}

async function request(path, { method = "GET", token, body, url } = {}) {
  const endpoint = new URL(path.replace(/^\//, ""), apiUrl(url));
  const response = await fetch(endpoint, {
    method,
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Pipeline API returned HTTP ${response.status}.`);
  return data;
}

export async function issueAccessToken({ credential = process.env.DIGITALOWNERSHIP_PIPELINE_CREDENTIAL, url } = {}) {
  if (!credential) throw new Error("Set DIGITALOWNERSHIP_PIPELINE_CREDENTIAL in a protected local or CI secret store.");
  return request("tokens", { method: "POST", token: credential, url });
}

export async function getBalance({ token = process.env.DIGITALOWNERSHIP_PIPELINE_TOKEN, url } = {}) {
  if (!token) throw new Error("Set DIGITALOWNERSHIP_PIPELINE_TOKEN to a current five-minute access token.");
  return request("balance", { token, url });
}

function registrationPayload(fingerprint, approvalMode) {
  const payload = {
    sourceHash: fingerprint.documentFingerprint,
    hashScope: fingerprint.hashScope,
    registryAddress: process.env.DIGITALOWNERSHIP_REGISTRY_ADDRESS,
    chainId: process.env.DIGITALOWNERSHIP_CHAIN_ID,
    approvalMode,
    immediateExecutionAcknowledged: true,
    // A deliberate approval-mode change must not be mistaken for an earlier submission.
    idempotencyKey: `cli-${approvalMode}-${fingerprint.documentFingerprint.slice(0, 32)}`,
    clientReference: fingerprint.fileName || "",
  };
  if (!payload.registryAddress || !payload.chainId) {
    throw new Error("Set DIGITALOWNERSHIP_REGISTRY_ADDRESS and DIGITALOWNERSHIP_CHAIN_ID.");
  }
  return payload;
}

export async function registerFile(path, { token = process.env.DIGITALOWNERSHIP_PIPELINE_TOKEN, approvalMode, dryRun = false, url } = {}) {
  if (!token) throw new Error("Set DIGITALOWNERSHIP_PIPELINE_TOKEN to a current five-minute access token.");
  if (approvalMode !== "none") throw new Error("Direct registration requires --approval none. Use requestApprovalFile for --approval required.");
  const fingerprint = await fingerprintFile(path);
  const payload = registrationPayload(fingerprint, approvalMode);
  const response = await request(dryRun ? "registrations/dry-run" : "registrations", {
    method: "POST",
    token,
    body: payload,
    url,
  });
  return { fingerprint, response };
}

export async function requestApprovalFile(path, { token = process.env.DIGITALOWNERSHIP_PIPELINE_TOKEN, url } = {}) {
  if (!token) throw new Error("Set DIGITALOWNERSHIP_PIPELINE_TOKEN to a current five-minute access token.");
  const fingerprint = await fingerprintFile(path);
  const response = await request("approvals", {
    method: "POST",
    token,
    body: registrationPayload(fingerprint, "required"),
    url,
  });
  return { fingerprint, response };
}

export async function getApproval(approvalId, { token = process.env.DIGITALOWNERSHIP_PIPELINE_TOKEN, url } = {}) {
  if (!token) throw new Error("Set DIGITALOWNERSHIP_PIPELINE_TOKEN to a current five-minute access token.");
  return request(`approvals/${encodeURIComponent(approvalId)}`, { token, url });
}

export async function waitForApproval(approvalId, { token, url, timeoutMs = 5 * 60_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let activeToken = token || process.env.DIGITALOWNERSHIP_PIPELINE_TOKEN;
  while (true) {
    let response;
    try {
      response = await getApproval(approvalId, { token: activeToken, url });
    } catch (error) {
      if (!/invalid or expired/i.test(error.message) || !process.env.DIGITALOWNERSHIP_PIPELINE_CREDENTIAL) throw error;
      activeToken = (await issueAccessToken({ url })).accessToken;
      continue;
    }
    const approval = response.approval;
    if (["approved", "expired", "rejected"].includes(approval?.status)) return approval;
    if (Date.now() >= deadline) throw new Error(`Approval ${approvalId} is still pending. Open the approval URL, approve it, then check the request again.`);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

export async function getRegistration(requestId, { token = process.env.DIGITALOWNERSHIP_PIPELINE_TOKEN, url } = {}) {
  if (!token) throw new Error("Set DIGITALOWNERSHIP_PIPELINE_TOKEN to a current five-minute access token.");
  return request(`registrations/${encodeURIComponent(requestId)}`, { token, url });
}

export async function waitForRegistration(requestId, { token, url, timeoutMs = 60_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let activeToken = token || process.env.DIGITALOWNERSHIP_PIPELINE_TOKEN;
  while (true) {
    let response;
    try {
      response = await getRegistration(requestId, { token: activeToken, url });
    } catch (error) {
      if (!/invalid or expired/i.test(error.message) || !process.env.DIGITALOWNERSHIP_PIPELINE_CREDENTIAL) throw error;
      activeToken = (await issueAccessToken({ url })).accessToken;
      continue;
    }
    const registration = response.registration;
    if (["completed", "failed"].includes(registration?.status)) return registration;
    if (Date.now() >= deadline) throw new Error(`Registration request ${requestId} is still ${registration?.status || "pending"}. Check its status later.`);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}
