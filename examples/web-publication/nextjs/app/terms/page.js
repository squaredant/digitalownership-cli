import content from "../../public/.well-known/digitalownership/terms-2026-10-01.content.json";

const MANIFEST_URL = "https://www.example.org/.well-known/digitalownership/terms-2026-10-01.manifest.json";
const VERIFY_URL = `https://digitalownership.squaredant.com/verify-publication?manifest=${encodeURIComponent(MANIFEST_URL)}`;

export default function TermsPage() {
  return (
    <main>
      <h1>{content.publication}</h1>
      <p>Version {content.version}</p>
      {content.sections.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          {section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </section>
      ))}
      <p>
        <a href={VERIFY_URL} rel="noreferrer" target="_blank">Verify this version</a>
        {" | "}
        <a href="/.well-known/digitalownership/terms-2026-10-01.manifest.json">View publication manifest</a>
      </p>
    </main>
  );
}
