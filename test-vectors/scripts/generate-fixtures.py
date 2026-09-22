#!/usr/bin/env python3
"""Generate deterministic, synthetic files for DigitalOwnership hash vectors."""

from pathlib import Path
import json
import zipfile


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "fixtures"
ZIP_TIMESTAMP = (2026, 1, 1, 0, 0, 0)


def write_zip(path, entries):
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_STORED) as archive:
        for name, data in entries:
            info = zipfile.ZipInfo(name, date_time=ZIP_TIMESTAMP)
            info.compress_type = zipfile.ZIP_STORED
            archive.writestr(info, data)


def main():
    FIXTURES.mkdir(parents=True, exist_ok=True)

    write_zip(
        FIXTURES / "office-content-v1.odt",
        [
            ("mimetype", "application/vnd.oasis.opendocument.text"),
            ("META-INF/manifest.xml", "<manifest/>"),
            ("content.xml", "<office:text>DigitalOwnership vector ODT</office:text>"),
            ("meta.xml", "<meta>volatile metadata</meta>"),
            ("settings.xml", "<settings>volatile settings</settings>"),
            ("styles.xml", "<styles>volatile styles</styles>"),
        ],
    )
    write_zip(
        FIXTURES / "office-content-v1.docx",
        [
            ("[Content_Types].xml", "<Types/>"),
            ("word/document.xml", "<w:document>DigitalOwnership vector DOCX</w:document>"),
            ("word/settings.xml", "<w:settings>volatile settings</w:settings>"),
            ("word/styles.xml", "<w:styles>stable styles</w:styles>"),
        ],
    )
    write_zip(
        FIXTURES / "office-content-v1.xlsx",
        [
            ("[Content_Types].xml", "<Types/>"),
            ("xl/workbook.xml", "<workbook>DigitalOwnership vector XLSX</workbook>"),
            ("xl/calcChain.xml", "<calcChain>volatile calculation chain</calcChain>"),
            ("xl/styles.xml", "<styles>stable styles</styles>"),
        ],
    )
    write_zip(
        FIXTURES / "office-content-v1.pptx",
        [
            ("[Content_Types].xml", "<Types/>"),
            ("ppt/presentation.xml", "<presentation>DigitalOwnership vector PPTX</presentation>"),
            ("ppt/slides/slide1.xml", "<slide>Slide 1</slide>"),
        ],
    )

    (FIXTURES / "exact-file-v1.txt").write_text(
        "DigitalOwnership exact-file test vector.\n",
        encoding="utf-8",
        newline="\n",
    )
    (FIXTURES / "exact-file-v1.json").write_text(
        json.dumps({"purpose": "DigitalOwnership test vector", "version": 1}, separators=(",", ":")) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    (FIXTURES / "pdf-file-v1.pdf").write_bytes(
        b"%PDF-1.4\n% DigitalOwnership synthetic test vector\n"
        b"1 0 obj\n<< /Type /Catalog >>\nendobj\n"
        b"trailer\n<< /Root 1 0 R >>\n%%EOF\n"
    )


if __name__ == "__main__":
    main()
