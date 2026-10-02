# Web Publication Verification

This workflow lets a publisher make selected visible web content independently
verifiable. It is intended for stable public material such as terms, reports,
release notes, or statements. It does not prove legal ownership, authorship,
or the real-world identity of a publisher.

Start with the copy-paste [web publication quick start](../examples/web-publication/README.md).
It includes a static-site renderer and a Next.js page pattern.

## Quick Start

Before starting, you need:

- a DigitalOwnership account owned by your organisation;
- a pipeline integration created under **Developer tools**;
- the integration credential in a secret manager or protected local shell;
- a current five-minute access token; and
- a website repository with a public web directory and a Git-ignored private
  evidence directory.

Create a versioned canonical `.json` file with the text visitors should verify.
Render the verified area of your page from this file rather than maintaining a
separate hand-copied version in page source. Then run:

```sh
digitalownership publication publish \
  ./public/.well-known/digitalownership/terms-2026-10-01.content.json \
  --account --email evidence@example.org \
  --url 'https://www.example.org/.well-known/digitalownership/terms-2026-10-01.content.json' \
  --label 'Terms of Service' \
  --publisher 'Example Organisation' \
  --approval required --wait \
  --manifest-out ./public/.well-known/digitalownership/terms-2026-10-01.manifest.json \
  --receipt-dir ./private-evidence/publications/terms-2026-10-01
```

The command opens two approval URLs: approve the canonical content first, then
the manifest. It writes the generated manifest to your public directory and
keeps read-only archive copies and private sidecar receipts beneath
`./private-evidence/`. Deploy only the unchanged canonical JSON and manifest.

For complete static-site and Next.js page examples, see
[`examples/web-publication`](../examples/web-publication/README.md).

The manifest command is local-only. It fingerprints `--archive` first and only
continues when its SHA-512 value, algorithm, and hash scope match the completed
receipt. It then copies the canonical content's fingerprint, registry key, and
transaction hash into the manifest. It does not publish or register the
manifest. The manifest includes the public
registration email, so `--email` must be a public organisation address and
must match the receipt's `accountEmail` when present. Completed legacy CLI
receipts are accepted too, but require an explicit `--email` because they do
not contain that field.

The hosted content at `--url` must remain byte-identical to the registered
source file. Do not register one JSON file and later host an edited copy at
that URL.

## Hosting

Host both files under a stable public HTTPS path, for example:

```text
/.well-known/digitalownership/terms-2026-10-01.content.json
/.well-known/digitalownership/terms-2026-10-01.manifest.json
```

Allow the independent verifier to read only that public directory in a
visitor's browser:

```http
Access-Control-Allow-Origin: https://digitalownership.squaredant.com
```

Apache example:

```apache
<Location "/.well-known/digitalownership/">
  Header always set Access-Control-Allow-Origin "https://digitalownership.squaredant.com"
</Location>
```

Nginx example:

```nginx
location ^~ /.well-known/digitalownership/ {
    add_header Access-Control-Allow-Origin "https://digitalownership.squaredant.com" always;
}
```

CORS does not make a file private. It only lets the stated independent website
read an already-public response in a browser. Do not expose private receipts;
publish only the canonical content and manifest.

## Publisher Button

Place a visible link near the canonical text. It must open the independent
DigitalOwnership origin, not run verification in the publisher's page:

```html
<a
  href="https://digitalownership.squaredant.com/verify-publication?manifest=https%3A%2F%2Fwww.example.org%2F.well-known%2Fdigitalownership%2Fterms-2026-10-01.manifest.json"
  target="_blank"
  rel="noopener"
>Verify this version</a>
```

For a generated website, URL-encode the full manifest URL before inserting it
as the `manifest` query parameter. The independent verifier starts
automatically and displays a green result only after all checks succeed.

## Visitor Result

The independent verifier downloads the hosted manifest and canonical content
in the visitor's browser, calculates SHA-512 locally, and checks the content
registration on-chain using the manifest's public email. A successful result
shows that the fetched canonical file matches the version registered at the
recorded blockchain time.

The verifier is not a guarantee that every dynamic element of a website is
unchanged. Navigation, analytics, cookie banners, account controls, and other
changing UI should remain outside the verified content area.

## Current Scope

The first manifest version supports exactly one HTTPS canonical JSON file per
publication. It does not support arbitrary live HTML, personalised pages,
multiple assets, or a collection of files. The independently hosted verifier
must be tested against the publisher's separate HTTPS origin before a public
launch.
