# JSON Output And Receipt Reference

The CLI prints one JSON object to standard output for every command. It writes
a `digitalownership-local-record-v1` receipt after a completed registration
unless `--no-archive` is used. This reference describes the stable public
output fields and every field written to that local receipt.

The original file is never included in CLI output or sent to the
DigitalOwnership services.

## Fingerprint Object

`digitalownership fingerprint <file>` returns this object under `fingerprint`.
The same object is included in `verify` and `register` output.

| Field | Meaning |
| --- | --- |
| `fileName` | Base file name only, without the local directory path. |
| `format` | Lowercase file extension without the dot, for example `odt`, `pdf`, or `rds`. |
| `hashAlgorithm` | Hash used for `documentFingerprint`; currently `SHA-512`. |
| `documentFingerprint` | Lowercase, 128-character SHA-512 hexadecimal value calculated locally. It is the source value from which registry keys are derived. |
| `hashScope` | Versioned rule that specifies what was hashed. A verifier must use the same scope. |
| `includedEntries` | Ordered paths inside an Office ZIP package that contributed to the content fingerprint. It is `[]` when the complete file bytes were hashed instead. |

### Hash Scopes And `includedEntries`

| `hashScope` | Applies to | Meaning of `includedEntries` |
| --- | --- | --- |
| `digitalownership-content-v1` | ODF (`.odt`, `.ods`, `.odp`, `.odg`) and OOXML (`.docx`, `.xlsx`, `.pptx`) packages | Lists the stable internal ZIP entries hashed by the versioned content algorithm. Volatile package entries are excluded. |
| `digitalownership-pdf-file-v1` | `.pdf` | `[]`: SHA-512 was calculated over all PDF bytes. |
| `digitalownership-exact-file-v1` | Exact-file formats, including `.txt`, `.json`, `.rds`, `.parquet`, `.hdf5`, `.duckdb`, images, and media | `[]`: SHA-512 was calculated over all file bytes. |

An empty `includedEntries` array is expected for PDFs and exact-file formats.
It does not mean that no data was fingerprinted.

## Verification Output

`digitalownership verify <file>` returns `verified: true` only after the public
verification service has confirmed the derived registry key on-chain.

| Field | Meaning |
| --- | --- |
| `ok` | Same outcome as `verified` for the CLI command. A non-confirmed lookup exits with status `1`. |
| `endpoint` | Verification service URL used, without query parameters. |
| `fingerprint` | The local fingerprint object described above. |
| `verified` | `true` only when a registration was found. |
| `registryKey` | Confirmed 32-byte registry key, prefixed with `0x`. It is blank when no registration was confirmed. |
| `status` | HTTP status returned by the verification service. |
| `verification` | On-chain result and optional transaction/event enrichment fields below. |

### `verification` Object

| Field | Meaning |
| --- | --- |
| `ok` | `true` when the registry key exists on-chain. |
| `hash` | SHA-512 source fingerprint supplied for lookup. |
| `registrationMethod` | `email_anchored_account` when verification used `--email`; otherwise `wallet_or_document_key`. |
| `registrant` | On-chain address recorded by the registry contract. This is an address, not an email address. |
| `creationTimeStamp` | Unix timestamp in seconds recorded by the registry contract. |
| `contractAddress` | Registry contract in which the registration was found. |
| `currentRegistryAddress` | Currently configured registry contract used as the start of lookup. |
| `foundInPreviousRegistry` | `true` when the registration was found in a predecessor registry. |
| `registryDepth` | Number of predecessor links followed before finding the registration. |
| `searchedRegistries` | Registry addresses checked during lookup. |
| `network` | Network name, currently `arbitrum-one` in production. |
| `transactionHash` | Optional Arbitrum transaction hash recovered from the registration event. |
| `transactionUrl` | Optional explorer URL for `transactionHash`. |
| `blockNumber` | Optional Arbitrum block number containing the recovered event. |

`owner` may appear in direct raw API responses from older service versions. It
is a backwards-compatible alias of `registrant`, not an account email. The CLI
normalizes it to `registrant` and does not emit `owner` in its verification
output.

## Local Registration Receipt

After a completed registration, the CLI writes a receipt in:

```text
DigitalOwnershipArchive/.DigitalOwnershipRecords/<archive-file>.digitalownership.json
```

With `--no-archive`, `--receipt-out <path>` selects the receipt location. Keep
the receipt with the registered archive or source file. It is private metadata:
it can include `accountEmail`.

For an exact-file JSON receipt, `digitalownership publication manifest` can
copy the public evidence fields into a `digitalownership-publication-manifest-v1`
file. It requires the registered archive file through `--archive` and first
checks its local fingerprint against the receipt. It does not publish the
receipt or contact the service. The resulting
manifest includes a public `registrationEmail`; it must match `accountEmail`
when the receipt contains that private field. See the
[publication-manifest schema](../test-vectors/schemas/publication-manifest.v1.schema.json)
and [publisher workflow](web-publication-verification.md).

| Field | Meaning |
| --- | --- |
| `schema` | Receipt schema identifier; currently `digitalownership-local-record-v1`. |
| `tool` | Producer identifier; `digitalownership-cli`. |
| `toolVersion` | CLI version that wrote the receipt. |
| `status` | `registered` for a new on-chain registration or `already_registered` when its registry key already existed. |
| `sourceFileName` | Original file name. |
| `archiveFileName` | Read-only archive-copy name. Empty when `--no-archive` was used. |
| `archivePath` | Local archive-copy path. Empty when `--no-archive` was used. |
| `documentHash` | Local SHA-512 document fingerprint, without an `0x` prefix. |
| `hashAlgorithm` | Algorithm for `documentHash`; currently `SHA-512`. |
| `hashScope` | Versioned fingerprint rule used for the document. |
| `format` | Lowercase source file extension without the dot. |
| `registryKey` | On-chain 32-byte registry key, prefixed with `0x`. |
| `registrationMethod` | Registration path, normally `email_anchored_account` for this CLI release. |
| `registrationWallet` | On-chain registry `registrant` address. It is an address, not the gas-paying relayer. |
| `contract` | Registry contract address. |
| `chainId` | EVM chain ID in hexadecimal form, for example `0xa4b1` for Arbitrum One. |
| `network` | Derived network name, for example `arbitrum-one`. |
| `transactionHash` | Arbitrum transaction hash that submitted or confirmed the registration. |
| `transactionUrl` | Explorer URL for `transactionHash`, when known. |
| `registeredAt` | Registry timestamp in Unix seconds. |
| `blockNumber` | Arbitrum block number containing the confirmed transaction. |
| `blockHash` | Hash of that Arbitrum block. |
| `transactionIndex` | Position of the transaction within its block. |
| `logIndex` | Position of the `DocumentRegistered` event log within its block. |
| `eventName` | Expected event name: `DocumentRegistered`. |
| `eventRegistryKey` | Registry key decoded from the confirmed event. It should equal `registryKey`. |
| `eventRegistrant` | Registrant address decoded from the confirmed event. It should equal `registrationWallet`. |
| `eventRegisteredAt` | Unix timestamp decoded from the confirmed event. It should equal `registeredAt`. |
| `transactionStatus` | `confirmed-success` after the receipt and event were checked. |
| `registrationStartedAt` | Pipeline request creation time, in UTC database timestamp form. |
| `pipelineRequestId` | DigitalOwnership pipeline registration request ID. |
| `clientReference` | Caller-visible source reference sent with the registration; the CLI uses the file name. |
| `accountEmail` | Private local metadata supplied through `--email`. It must be the email of the account that owns the pipeline credential. It is never returned by the pipeline API. |
| `createdAt` | ISO 8601 UTC time at which the CLI wrote this receipt. |

New receipts do not write an `owner` field. Historic records can contain it:
for old account records it may be an email, and for old wallet records it may
be an address. Prefer `accountEmail` and `registrationWallet` instead.

## Registration And Approval Responses

`digitalownership register` first returns a `response` object containing an
immediate queued registration or browser-approval request. With `--wait`, the
final output also contains `registration` and `archive`. The
[pipeline API reference](pipeline-api.md) defines those job objects. For
durable evidence, retain the local receipt rather than relying only on
transient command output.
