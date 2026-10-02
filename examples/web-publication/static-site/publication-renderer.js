import { publication } from "./publication-config.js";

function text(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is missing.`);
  return value.trim();
}

function append(parent, tagName, value) {
  const element = document.createElement(tagName);
  element.textContent = value;
  parent.append(element);
}

function render(content) {
  if (!content || content.schema !== "publisher-visible-content-v1" || !Array.isArray(content.sections)) {
    throw new Error("This page needs publisher-visible-content-v1 JSON.");
  }
  const root = document.querySelector("#publication-content");
  root.replaceChildren();
  append(root, "h1", text(content.publication, "Publication title"));
  append(root, "p", `Version ${text(content.version, "Publication version")}`);
  for (const section of content.sections) {
    const sectionElement = document.createElement("section");
    append(sectionElement, "h2", text(section.heading, "Section heading"));
    for (const paragraph of section.paragraphs || []) append(sectionElement, "p", text(paragraph, "Paragraph"));
    root.append(sectionElement);
  }
}

async function main() {
  const contentUrl = new URL(publication.contentPath, window.location.origin).toString();
  const manifestUrl = new URL(publication.manifestPath, window.location.origin).toString();
  document.querySelector("#verify-publication").href = `${publication.verifierUrl}?manifest=${encodeURIComponent(manifestUrl)}`;
  document.querySelector("#view-manifest").href = manifestUrl;
  const response = await fetch(contentUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`The canonical content could not be loaded: HTTP ${response.status}.`);
  render(await response.json());
}

main().catch((error) => {
  document.querySelector("#publication-content").textContent = error.message || "The canonical content could not be displayed.";
});
