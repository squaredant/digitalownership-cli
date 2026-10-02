# Web Publication Quick Start

Use this pattern for a stable public page such as Terms, a report, or a public
statement. It verifies one versioned canonical JSON file at a time.

## Release Sequence

1. Copy `terms-2026-10-01.content.json` to your website's
   `public/.well-known/digitalownership/` directory and edit it.
2. Render the page from that same file, using either example below.
3. Run `digitalownership publication publish` after the text and final public
   URL are approved. It creates a matching manifest and two private receipts.
4. Deploy the unchanged canonical JSON, its generated manifest, and page
   together. Keep the receipts outside the deployed directory.
5. Configure CORS for `/.well-known/digitalownership/` so
   `https://digitalownership.squaredant.com` can read these already-public
   files in a visitor's browser.

```sh
digitalownership publication publish \
  ./public/.well-known/digitalownership/terms-2026-10-01.content.json \
  --account --email evidence@example.org \
  --url 'https://www.example.org/.well-known/digitalownership/terms-2026-10-01.content.json' \
  --label 'Terms of Service' --publisher 'Example Organisation' \
  --approval required --wait \
  --manifest-out ./public/.well-known/digitalownership/terms-2026-10-01.manifest.json \
  --receipt-dir ./private-evidence/publications/terms-2026-10-01
```

The command prints two browser-approval URLs: one for the canonical content
and one for its manifest. Do not edit either public JSON file after approval.
A changed version needs new content and manifest filenames, registrations, and
button configuration.

## Static Site

Copy the `static-site/` files into a simple static website. Edit only
`publication-config.js` for each version. The renderer uses `textContent`, not
HTML injection, when displaying canonical text.

## Next.js

Copy `nextjs/public/.well-known/` into your Next.js `public/` folder and adapt
`nextjs/app/terms/page.js`. The example imports and server-renders the exact
same JSON file served publicly. Set `MANIFEST_URL` to the matching manifest.

## Hosting

Nginx example:

```nginx
location ^~ /.well-known/digitalownership/ {
  add_header Access-Control-Allow-Origin "https://digitalownership.squaredant.com" always;
}
```

See [`docs/web-publication-verification.md`](../../docs/web-publication-verification.md)
for the complete protocol, security boundaries, and visitor experience.
