#!/usr/bin/env python3
"""Verify public DigitalOwnership test vectors with the bundled Python reference."""

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

from fingerprint_core import compute_document_hash


PACKAGE_EXTENSIONS = {".odt", ".ods", ".odp", ".odg", ".docx", ".xlsx", ".pptx"}


def sha512_file(path):
    return hashlib.sha512(path.read_bytes()).hexdigest()


def main():
    manifest = json.loads((ROOT / "manifest.v1.json").read_text(encoding="utf-8"))
    failures = []
    for vector in manifest["fingerprintVectors"]:
        path = ROOT / vector["file"]
        actual = compute_document_hash(path) if path.suffix in PACKAGE_EXTENSIONS else sha512_file(path)
        if actual != vector["documentFingerprint"]:
            failures.append(f"{vector['id']}: expected {vector['documentFingerprint']}, got {actual}")

    if failures:
        raise SystemExit("\n".join(failures))
    print(f"Verified {len(manifest['fingerprintVectors'])} DigitalOwnership fingerprint vectors.")


if __name__ == "__main__":
    main()
