#!/usr/bin/env python3
"""
Magellan Extraction Layer

Extracts content from source files into rich JSON silver files using
kreuzberg's Python API. Handles documents (PDF, DOCX, XLSX, HTML),
code (248 languages via tree-sitter), and text (markdown, plain text).

kreuzberg is required. If not installed, this script tells you how
to install it and stops.

Usage:
    magellan-extract.py <file>                        Extract one file
    magellan-extract.py --dir <path> --output <dir>   Extract all files
    magellan-extract.py --setup                       Download tree-sitter parsers
"""

import argparse
import hashlib
import json
import os
import platform
import sys
import urllib.request
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

PARSERS_DIRS = [
    Path.home() / ".magellan" / "parsers",
    Path.home() / "Library" / "Caches" / "kreuzberg" / "parsers",
]
PARSER_PACK_VERSION = "v1.7.0"
PARSER_PACK_BASE = f"https://github.com/kreuzberg-dev/tree-sitter-language-pack/releases/download/{PARSER_PACK_VERSION}"

CODE_MIME = "text/x-source-code"


def check_kreuzberg():
    """Verify kreuzberg is installed. Exit with instructions if not."""
    try:
        import kreuzberg
        return kreuzberg
    except ImportError:
        print("ERROR: kreuzberg is not installed.", file=sys.stderr)
        print("", file=sys.stderr)
        print("Install it with:", file=sys.stderr)
        print("  pip install kreuzberg", file=sys.stderr)
        print("", file=sys.stderr)
        print("For code intelligence (optional), also run:", file=sys.stderr)
        print("  python3 magellan-extract.py --setup", file=sys.stderr)
        sys.exit(1)


def detect_platform():
    """Detect platform for parser downloads."""
    machine = platform.machine().lower()
    system = platform.system().lower()

    if system == "darwin":
        return "macos-arm64" if machine in ("arm64", "aarch64") else "macos-x86_64"
    elif system == "linux":
        return "linux-aarch64" if machine in ("arm64", "aarch64") else "linux-x86_64"
    elif system == "windows":
        return "windows-x86_64"
    return None


def setup_parsers():
    """Download tree-sitter parser bundle to ~/.magellan/parsers/."""
    plat = detect_platform()
    if not plat:
        print(f"ERROR: Unsupported platform: {platform.system()} {platform.machine()}", file=sys.stderr)
        sys.exit(1)

    manifest_url = f"{PARSER_PACK_BASE}/parsers.json"
    print(f"Fetching parser manifest from {manifest_url}...")

    try:
        ssl_context = None
        ca_cert = os.environ.get("SSL_CERT_FILE") or os.environ.get("REQUESTS_CA_BUNDLE")
        if ca_cert and os.path.exists(ca_cert):
            import ssl
            ssl_context = ssl.create_default_context(cafile=ca_cert)

        req = urllib.request.Request(manifest_url)
        with urllib.request.urlopen(req, context=ssl_context) as r:
            manifest = json.loads(r.read())
    except Exception as e:
        print(f"ERROR: Failed to fetch manifest: {e}", file=sys.stderr)
        print("", file=sys.stderr)
        print("If behind a corporate proxy, set SSL_CERT_FILE to your CA cert:", file=sys.stderr)
        print("  export SSL_CERT_FILE=/path/to/ca-bundle.pem", file=sys.stderr)
        sys.exit(1)

    plat_info = manifest.get("platforms", {}).get(plat)
    if not plat_info:
        print(f"ERROR: No parsers available for platform '{plat}'", file=sys.stderr)
        sys.exit(1)

    download_url = plat_info["url"]
    expected_hash = plat_info.get("sha256")
    size_mb = plat_info.get("size", 0) / 1024 / 1024

    print(f"Downloading parsers for {plat} ({size_mb:.0f} MB)...")

    with tempfile.NamedTemporaryFile(suffix=".tar.zst", delete=False) as tmp:
        tmp_path = tmp.name
        try:
            req = urllib.request.Request(download_url)
            with urllib.request.urlopen(req, context=ssl_context) as r:
                shutil.copyfileobj(r, tmp)
        except Exception as e:
            print(f"ERROR: Download failed: {e}", file=sys.stderr)
            os.unlink(tmp_path)
            sys.exit(1)

    PARSERS_DIRS[0].mkdir(parents=True, exist_ok=True)

    print("Extracting parsers...")
    zstd = shutil.which("zstd")
    if not zstd:
        print("ERROR: zstd is required to extract parsers.", file=sys.stderr)
        print("  brew install zstd  # macOS", file=sys.stderr)
        print("  apt install zstd   # Linux", file=sys.stderr)
        os.unlink(tmp_path)
        sys.exit(1)

    tar_path = tmp_path.replace(".tar.zst", ".tar")
    subprocess.run(["zstd", "-d", tmp_path, "-o", tar_path], check=True, capture_output=True)
    subprocess.run(["tar", "-xf", tar_path, "-C", str(PARSERS_DIRS[0])], check=True, capture_output=True)

    os.unlink(tmp_path)
    os.unlink(tar_path)

    parser_count = len(list(PARSERS_DIRS[0].glob("*.dylib")) + list(PARSERS_DIRS[0].glob("*.so")))
    print(f"Installed {parser_count} language parsers to {PARSERS_DIRS[0]}")
    print("Code intelligence is ready.")


def compute_hash(filepath):
    """Compute SHA-256 hash of a file."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return f"sha256:{h.hexdigest()}"


def build_config(filepath):
    """Build the appropriate ExtractionConfig based on file type."""
    from kreuzberg import (
        ExtractionConfig,
        LanguageDetectionConfig,
        ContentFilterConfig,
        PageConfig,
        TreeSitterConfig,
        TreeSitterProcessConfig,
        detect_mime_type_from_path,
    )

    mime = detect_mime_type_from_path(str(filepath))
    is_code = mime == CODE_MIME

    config = ExtractionConfig()
    config.language_detection = LanguageDetectionConfig(enabled=True)

    if is_code:
        ts = TreeSitterConfig()
        ts.enabled = True
        for pdir in PARSERS_DIRS:
            if pdir.exists():
                ts.cache_dir = str(pdir)
                break
        proc = TreeSitterProcessConfig()
        proc.structure = True
        proc.imports = True
        proc.exports = True
        proc.symbols = True
        proc.docstrings = True
        proc.content_mode = "structure"
        ts.process = proc
        config.tree_sitter = ts
    else:
        config.output_format = "markdown"
        config.content_filter = ContentFilterConfig(strip_repeating_text=True)
        config.pages = PageConfig(extract_pages=True)

    return config, mime, is_code


def extract_one(filepath, output_dir=None):
    """Extract a single file and produce a .silver.json."""
    from kreuzberg import extract_file_sync
    import kreuzberg

    filepath = Path(filepath)
    if not filepath.exists():
        print(f"ERROR: File not found: {filepath}", file=sys.stderr)
        return None

    config, mime, is_code = build_config(filepath)

    try:
        result = extract_file_sync(str(filepath), config=config)
    except Exception as e:
        print(f"ERROR: Extraction failed for {filepath}: {e}", file=sys.stderr)
        return None

    content_hash = compute_hash(filepath)
    lang = None
    if result.detected_languages:
        for dl in result.detected_languages:
            if isinstance(dl, dict):
                lang = dl.get("code") or dl.get("language")
            elif isinstance(dl, str):
                lang = dl
            if lang:
                break

    metadata = {}
    if result.metadata:
        raw_meta = dict(result.metadata) if hasattr(result.metadata, "items") else result.metadata
        for k in ("title", "authors", "created_at", "created_by", "page_count",
                   "format_type", "language", "metrics", "structure", "imports", "symbols"):
            if k in raw_meta:
                metadata[k] = raw_meta[k]

    silver = {
        "source_file": str(filepath),
        "extracted_at": datetime.now(timezone.utc).isoformat(),
        "extraction_tool": "kreuzberg",
        "extraction_tool_version": kreuzberg.__version__,
        "content_hash": content_hash,
        "file_type": "code" if is_code else "document",
        "mime_type": result.mime_type,
        "language": lang or metadata.get("language"),
        "quality_score": result.quality_score,
        "metadata": metadata,
        "content": result.content,
        "content_format": "source" if is_code else "markdown",
        "total_lines": result.content.count("\n") + 1 if result.content else 0,
    }

    if is_code:
        ci = result.code_intelligence
        if ci and isinstance(ci, dict):
            silver["code_intelligence"] = ci
        elif metadata.get("structure") or metadata.get("imports") or metadata.get("symbols"):
            silver["code_intelligence"] = {
                "language": metadata.get("language"),
                "metrics": metadata.get("metrics"),
                "structure": metadata.get("structure"),
                "imports": metadata.get("imports"),
                "symbols": metadata.get("symbols"),
            }

    if not is_code:
        sections = []
        if hasattr(result, "uris") and result.uris:
            for uri in result.uris:
                if isinstance(uri, dict) and uri.get("kind") == "anchor":
                    sections.append({
                        "title": uri.get("label", "").strip(),
                        "page": uri.get("page"),
                    })
        silver["sections"] = sections

        pages = []
        if hasattr(result, "pages") and result.pages:
            for p in result.pages:
                if isinstance(p, dict):
                    pages.append({
                        "page_number": p.get("page_number"),
                        "content": p.get("content", ""),
                    })
        silver["pages"] = pages

        uris = []
        if hasattr(result, "uris") and result.uris:
            for uri in result.uris:
                if isinstance(uri, dict) and uri.get("kind") == "hyperlink":
                    uris.append({
                        "url": uri.get("url", ""),
                        "label": uri.get("label", ""),
                    })
        silver["uris"] = uris

    if output_dir:
        out_dir = Path(output_dir)
        rel = filepath.name
        out_path = out_dir / f"{rel}.silver.json"
        out_path.parent.mkdir(parents=True, exist_ok=True)
    else:
        out_path = filepath.with_suffix(filepath.suffix + ".silver.json")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(silver, f, indent=2, default=str)

    return silver, out_path


def extract_directory(dirpath, output_dir):
    """Extract all supported files in a directory tree."""
    from kreuzberg import detect_mime_type_from_path

    dirpath = Path(dirpath)
    output_dir = Path(output_dir)

    files = []
    for root, dirs, filenames in os.walk(dirpath):
        dirs[:] = [d for d in dirs if d not in (".git", ".magellan", "__pycache__", "node_modules", ".next", "build")]
        for fname in sorted(filenames):
            fpath = Path(root) / fname
            if fpath.suffix in (".pyc", ".class", ".o", ".so", ".dylib"):
                continue
            files.append(fpath)

    results = []
    errors = []

    for i, fpath in enumerate(files, 1):
        rel = fpath.relative_to(dirpath)
        out_path = output_dir / f"{rel}.silver.json"
        out_path.parent.mkdir(parents=True, exist_ok=True)

        try:
            result = extract_one(fpath, output_dir=str(out_path.parent))
            if result:
                silver, _ = result
                final_out = output_dir / f"{rel}.silver.json"
                with open(final_out, "w", encoding="utf-8") as f:
                    json.dump(silver, f, indent=2, default=str)
                ftype = silver.get("file_type", "?")
                lang = silver.get("language", "?")
                lines = silver.get("total_lines", 0)
                print(f"  [{i}/{len(files)}] {rel}  ({ftype}, {lang}, {lines} lines)")
                results.append((str(rel), silver))
            else:
                errors.append(str(rel))
                print(f"  [{i}/{len(files)}] {rel}  FAILED", file=sys.stderr)
        except Exception as e:
            errors.append(str(rel))
            print(f"  [{i}/{len(files)}] {rel}  ERROR: {e}", file=sys.stderr)

    print(f"\nExtracted {len(results)} files ({len(errors)} errors)")
    if errors:
        print("Failed files:")
        for e in errors:
            print(f"  {e}")

    return results


def main():
    parser = argparse.ArgumentParser(description="Magellan Extraction Layer")
    parser.add_argument("file", nargs="?", help="Single file to extract")
    parser.add_argument("--dir", help="Directory to extract recursively")
    parser.add_argument("--output", help="Output directory for silver files")
    parser.add_argument("--setup", action="store_true", help="Download tree-sitter parsers for code intelligence")
    args = parser.parse_args()

    if args.setup:
        setup_parsers()
        return

    kb = check_kreuzberg()

    if args.dir:
        if not args.output:
            print("ERROR: --output is required with --dir", file=sys.stderr)
            sys.exit(1)
        extract_directory(args.dir, args.output)
    elif args.file:
        result = extract_one(args.file, output_dir=args.output)
        if result:
            silver, out_path = result
            print(f"Extracted: {args.file}")
            print(f"  Output: {out_path}")
            print(f"  Type: {silver['file_type']}")
            print(f"  MIME: {silver['mime_type']}")
            print(f"  Language: {silver.get('language', 'unknown')}")
            print(f"  Lines: {silver['total_lines']}")
            if silver.get('metadata', {}).get('title'):
                print(f"  Title: {silver['metadata']['title']}")
            if silver.get('code_intelligence'):
                ci = silver['code_intelligence']
                print(f"  Code: {ci.get('language', '?')} — "
                      f"{ci.get('metrics', {}).get('code_lines', '?')} code lines, "
                      f"{len(ci.get('symbols', []))} symbols")
            if silver.get('sections'):
                print(f"  Sections: {len(silver['sections'])}")
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
