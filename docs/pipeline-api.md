# Pipeline API And Credentials

## Status

Integration management, five-minute access-token exchange, and persisted
unattended registration jobs are enabled through the versioned API. Account
owners can expose the optional developer-tools section on the Account page to
create and revoke integrations; the CLI can exchange an integration credential
for a short-lived access token. No existing LibreOffice or macOS device link
uses these tables.

## Security Model

Pipeline access is intentionally separate from a device link:

- A pipeline integration is a named, revocable connection owned by one account.
- Its long-lived integration credential is shown once and stored only as a
  SHA-256 hash.
- A credential exchanges for an opaque access token that expires after five
  minutes. The raw token is also stored only as a SHA-256 hash. Each credential
  is limited to five valid access tokens; issuing a sixth revokes the oldest.
- `--approval required` uses a separate, single-use five-minute browser
  approval tied to an exact manifest. It never silently falls back to
  unattended registration.
- Account registrations will derive the email-linked registry key from the
  authenticated account on the server. The pipeline request never supplies a
  free-form registration email.

## Tables

| Table | Purpose | Sensitive fields |
| --- | --- | --- |
| `api_integrations` | Named account-owned pipeline integrations and scopes. | No raw email or secret. |
| `api_credentials` | Revocable long-lived credential record. | `secret_hash` only. |
| `api_access_tokens` | Five-minute access tokens. | `token_hash` only. |
| `api_registration_requests` | Idempotent account-registration requests and final result. | No document bytes or email. |
| `api_approval_requests` | Five-minute signed-in browser approvals for an exact request. | No document bytes or email. |

`api_registration_requests` is separate from `plugin_registration_jobs`.
The latter remains exclusively for LibreOffice and Mac app device-link flows.
The unique `(account_id, idempotency_key)` constraint prevents a retried API
request from spending a second credit.

## Database Installation

Apply `digitalownership-w3/db/mysql-install-or-upgrade.sql` before enabling
the pipeline API. The new tables have foreign keys to
`prepaid_users.account_id`; they do not modify existing registration,
credential, or device-link rows.

## First Release Endpoints

Available now:

```text
GET  /api/v1/integrations                 Browser session required.
POST /api/v1/integrations                 Browser session required; returns a credential once.
POST /api/v1/integrations/{id}/revoke     Browser session required.
POST /api/v1/tokens                       Integration credential bearer token required.
GET  /api/v1/token/status                 Five-minute access token bearer token required.
GET  /api/v1/balance                      `registrations:read` access token required; advisory credit preflight.
POST /api/v1/approvals                    `registrations:write` token; creates a five-minute browser approval.
GET  /api/v1/approvals/{id}               Account or `registrations:read` token; reads approval status.
POST /api/v1/approvals/{id}/approve       Signed-in browser session required; creates the registration job.
```

Still planned:

```text
GET  /api/v1/registrations?limit=25
```

Registration endpoints available now:

```text
POST /api/v1/registrations/dry-run
POST /api/v1/registrations
GET  /api/v1/registrations/{requestId}
```

`GET /api/v1/balance` returns only `availableCredits`. It does not reserve a
credit; each actual registration checks and reserves its credit transactionally
when processed.

For `approvalMode: "required"`, send the same registration payload to
`POST /api/v1/approvals` instead of `POST /api/v1/registrations`. The response
contains a five-minute `approvalUrl`. The account owner signs in there and
approves the exact fingerprint; only then does the service create the normal
queued registration request. The CLI's optional `--wait` polls this approval
and then the registration job until it can write the final local receipt.

## Manual Smoke Test

An account owner can test the API from the browser console while signed in. Use
a test integration and do not paste a credential or access token into support
tickets, logs, or chat.

```js
const created = await fetch("/api/credit/api/v1/integrations", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "manual-api-test",
    scopes: ["registrations:read", "registrations:write"],
  }),
}).then((response) => response.json());

// Copy created.credential to a protected local secret store now. It is not
// returned by the integration-list endpoint later.
const issued = await fetch("/api/credit/api/v1/tokens", {
  method: "POST",
  headers: { Authorization: `Bearer ${created.credential}` },
}).then((response) => response.json());

await fetch("/api/credit/api/v1/token/status", {
  headers: { Authorization: `Bearer ${issued.accessToken}` },
}).then(async (response) => ({ status: response.status, body: await response.json() }));
```

The final request must return HTTP `200`. Access tokens expire five minutes
after issue. The service stores and compares all pipeline timestamps in UTC;
the database's local `NOW()` display may differ by its server time zone.

Use the same token for a non-mutating preflight. `sourceHash` is the
128-character SHA-512 `documentHash` from a local archive record. This test
does not create a request, spend a credit, or broadcast a transaction.

```js
await fetch("/api/credit/api/v1/registrations/dry-run", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${issued.accessToken}`,
  },
  body: JSON.stringify({
    sourceHash: "YOUR_128_CHARACTER_SHA512_DOCUMENT_HASH",
    hashScope: "digitalownership-exact-file-v1",
    registryAddress: "YOUR_CONFIGURED_REGISTRY_ADDRESS",
    chainId: "0xa4b1",
    approvalMode: "none",
    immediateExecutionAcknowledged: true,
  }),
}).then(async (response) => ({ status: response.status, body: await response.json() }));
```

After the test, revoke the integration. Revoking it also invalidates its
credential; issued access tokens will be rejected because their credential is
revoked.

```js
await fetch(`/api/credit/api/v1/integrations/${created.integration.id}/revoke`, {
  method: "POST",
}).then((response) => response.json());
```

All write requests will require a bearer access token, an explicit
`approvalMode` (`none` or `required`), an idempotency key, source hash, hash
scope, configured registry address, and configured chain ID.
