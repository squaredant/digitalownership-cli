"""Minimal public Python reference for digitalownership-content-v1."""

import hashlib
import zipfile
from pathlib import Path


ODF_VOLATILE_ENTRIES = {"meta.xml", "settings.xml", "styles.xml"}
ODF_VOLATILE_PREFIXES = ("Thumbnails/",)
OOXML_FORMATS = {
    "docx": {
        "required": "word/document.xml",
        "prefixes": ("word/",),
        "volatile": {"word/settings.xml"},
    },
    "xlsx": {
        "required": "xl/workbook.xml",
        "prefixes": ("xl/",),
        "volatile": {"xl/calcChain.xml"},
    },
    "pptx": {
        "required": "ppt/presentation.xml",
        "prefixes": ("ppt/",),
        "volatile": set(),
    },
}
ODF_SUFFIXES = {".odt", ".ods", ".odp", ".odg", ".odf"}
OOXML_SUFFIXES = {".docx": "docx", ".xlsx": "xlsx", ".pptx": "pptx"}


class UnsupportedDocumentFormat(RuntimeError):
    pass


def compute_document_hash(path):
    """Return the stable v1 content fingerprint for an ODF or OOXML file."""
    document_path = Path(path)
    suffix = document_path.suffix.lower()
    expected_ooxml_format = OOXML_SUFFIXES.get(suffix)
    if suffix not in ODF_SUFFIXES and expected_ooxml_format is None:
        raise UnsupportedDocumentFormat(f"Unsupported document format: {document_path.name}")
    if not zipfile.is_zipfile(document_path):
        raise UnsupportedDocumentFormat(f"Unsupported document format: {document_path.name}")

    with zipfile.ZipFile(document_path, "r") as package:
        names = set(package.namelist())
        if suffix in ODF_SUFFIXES and _is_odf_package(names):
            return _compute_package_hash(package, _odf_hash_entries(package))
        ooxml_format = _ooxml_format(names)
        if ooxml_format == expected_ooxml_format:
            return _compute_package_hash(package, _ooxml_hash_entries(package, ooxml_format))
    raise UnsupportedDocumentFormat(f"Unsupported document package: {document_path.name}")


def _is_odf_package(names):
    return "mimetype" in names and any(name in names for name in ("content.xml", "META-INF/manifest.xml"))


def _ooxml_format(names):
    if "[Content_Types].xml" not in names:
        return None
    for format_name, config in OOXML_FORMATS.items():
        if config["required"] in names:
            return format_name
    return None


def _odf_hash_entries(package):
    return sorted(
        info.filename
        for info in package.infolist()
        if not info.is_dir()
        and info.filename not in ODF_VOLATILE_ENTRIES
        and not info.filename.startswith(ODF_VOLATILE_PREFIXES)
    )


def _ooxml_hash_entries(package, format_name):
    config = OOXML_FORMATS[format_name]
    return sorted(
        info.filename
        for info in package.infolist()
        if not info.is_dir()
        and info.filename.startswith(config["prefixes"])
        and info.filename not in config["volatile"]
    )


def _compute_package_hash(package, names):
    digest = hashlib.sha512()
    for name in names:
        data = package.read(name)
        file_digest = hashlib.sha512(data).hexdigest()
        digest.update(b"FILE\x00")
        digest.update(name.encode("utf-8"))
        digest.update(b"\x00")
        digest.update(str(len(data)).encode("ascii"))
        digest.update(b"\x00")
        digest.update(file_digest.encode("ascii"))
        digest.update(b"\x00")
    return digest.hexdigest()
