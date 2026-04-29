#!/usr/bin/env python3
"""
Magellan Silver Layer Indexer

Two-layer document preprocessing for targeted reading during fact extraction:
  Layer 1: Deterministic boilerplate detection (repeated lines)
  Layer 2: LLM document mapping (Gemini CLI) for section classification

Usage:
    silver-indexer.py <file.txt>           Index one file
    silver-indexer.py --dir <path>         Index all .txt files in directory tree
    silver-indexer.py --stats              Print per-file breakdown
    silver-indexer.py --no-llm             Skip LLM mapping, boilerplate only
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from collections import Counter

LLM_THRESHOLD = 1500

DENSITY_MAP = {
    "toc": "skip",
    "glossary": "reference",
    "data": "reference",
    "reference": "reference",
    "procedure": "high",
    "policy": "high",
    "narrative": "medium",
}

DOCUMENT_MAP_PROMPT = """Read this document excerpt (first lines of a larger document).
Produce a JSON document map with:
1) "document_type" — one of: procedure_manual, report, form, guide, training_material, policy, legal, technical, handbook, reference
2) "title" — the document's title
3) "sections" — a list of sections you can identify from the table of contents or document structure, each with:
   - "title": the section name exactly as it appears in the document
   - "content_type": one of: toc, glossary, procedure, policy, narrative, data, reference

Output only valid JSON, no explanation or markdown fencing."""


def find_boilerplate(lines, threshold=3):
    """Find lines that repeat 3+ times — likely headers/footers/watermarks."""
    stripped = [l.strip() for l in lines]
    counts = Counter(stripped)
    boilerplate = set()
    for text, count in counts.items():
        if count >= threshold and len(text) > 5:
            boilerplate.add(text)
    return boilerplate


def find_gemini():
    """Check if Gemini CLI is available."""
    return shutil.which("gemini")


def call_gemini(text):
    """Call Gemini CLI with a prompt, return the response text."""
    try:
        result = subprocess.run(
            ["gemini", "-p", DOCUMENT_MAP_PROMPT],
            input=text,
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            return None
        return result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return None


def parse_llm_response(response_text):
    """Parse JSON from LLM response, handling markdown fences."""
    if not response_text:
        return None
    text = response_text.strip()
    if text.startswith("```"):
        text = re.sub(r'^```\w*\n?', '', text)
        text = re.sub(r'\n?```\s*$', '', text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def resolve_section_lines(lines, section_titles):
    """Find line numbers for each section title by searching the document.

    Prefers occurrences in the body (after line 100) over TOC entries.
    If a title appears multiple times, uses the last occurrence — the actual
    section header rather than the TOC reference.
    """
    resolved = []
    for title in section_titles:
        best_line = None
        for i, line in enumerate(lines):
            stripped = line.strip()
            if title == stripped or (len(title) > 10 and title in stripped and len(stripped) < len(title) + 40):
                if best_line is None or i > best_line:
                    best_line = i
        if best_line is not None:
            resolved.append((best_line, title))

    if not resolved:
        return []

    resolved.sort(key=lambda x: x[0])

    # Deduplicate: if two sections resolve to within 3 lines, keep the first
    deduped = [resolved[0]]
    for start, title in resolved[1:]:
        if start - deduped[-1][0] > 3:
            deduped.append((start, title))
    resolved = deduped

    sections_with_ranges = []
    for idx, (start, title) in enumerate(resolved):
        if idx + 1 < len(resolved):
            end = resolved[idx + 1][0] - 1
        else:
            end = len(lines) - 1
        sections_with_ranges.append((start, end, title))

    return sections_with_ranges


def index_file(filepath, use_llm=True, gemini_path=None):
    """Analyze a silver text file and produce an index."""
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        raw_lines = f.readlines()

    lines = [l.rstrip('\r\n') for l in raw_lines]
    total_lines = len(lines)

    if total_lines == 0:
        return {
            "source_file": str(filepath),
            "total_lines": 0,
            "sections": [],
            "stats": {"reading_reduction": 0},
        }

    boilerplate = find_boilerplate(lines)
    boilerplate_count = sum(1 for l in lines if l.strip() in boilerplate)

    if total_lines <= LLM_THRESHOLD or not use_llm or not gemini_path:
        method = "full_read" if total_lines <= LLM_THRESHOLD else "no_llm_fallback"
        return {
            "source_file": str(filepath),
            "total_lines": total_lines,
            "boilerplate_lines": boilerplate_count,
            "method": method,
            "sections": [{
                "title": "(entire document)",
                "lines": [1, total_lines],
                "type": "mixed",
                "density": "medium",
            }],
            "recommended_reading_order": [],
            "stats": {
                "high_density_lines": 0,
                "medium_density_lines": total_lines,
                "skip_lines": 0,
                "reading_reduction": 0,
            },
        }

    excerpt = "\n".join(lines[:200])
    response = call_gemini(excerpt)
    doc_map = parse_llm_response(response)

    if not doc_map or "sections" not in doc_map:
        return {
            "source_file": str(filepath),
            "total_lines": total_lines,
            "boilerplate_lines": boilerplate_count,
            "method": "llm_failed",
            "sections": [{
                "title": "(entire document)",
                "lines": [1, total_lines],
                "type": "mixed",
                "density": "medium",
            }],
            "recommended_reading_order": [],
            "stats": {
                "high_density_lines": 0,
                "medium_density_lines": total_lines,
                "skip_lines": 0,
                "reading_reduction": 0,
            },
        }

    llm_titles = [(s.get("title", ""), s.get("content_type", "narrative")) for s in doc_map["sections"]]
    title_list = [t for t, _ in llm_titles]
    type_lookup = {t: ct for t, ct in llm_titles}

    resolved = resolve_section_lines(lines, title_list)

    if not resolved:
        return {
            "source_file": str(filepath),
            "total_lines": total_lines,
            "boilerplate_lines": boilerplate_count,
            "method": "llm_no_matches",
            "document_type": doc_map.get("document_type"),
            "document_title": doc_map.get("title"),
            "sections": [{
                "title": "(entire document)",
                "lines": [1, total_lines],
                "type": "mixed",
                "density": "medium",
            }],
            "recommended_reading_order": [],
            "stats": {
                "high_density_lines": 0,
                "medium_density_lines": total_lines,
                "skip_lines": 0,
                "reading_reduction": 0,
            },
        }

    sections = []
    for start, end, title in resolved:
        content_type = type_lookup.get(title, "narrative")
        density = DENSITY_MAP.get(content_type, "medium")
        sections.append({
            "title": title,
            "lines": [start + 1, end + 1],
            "type": content_type,
            "density": density,
        })

    high = sum(s["lines"][1] - s["lines"][0] + 1 for s in sections if s["density"] == "high")
    medium = sum(s["lines"][1] - s["lines"][0] + 1 for s in sections if s["density"] == "medium")
    skip = sum(s["lines"][1] - s["lines"][0] + 1 for s in sections if s["density"] in ("skip", "reference"))

    recommended = [s["title"] for s in sections if s["density"] == "high"]
    recommended += [s["title"] for s in sections if s["density"] == "medium"]

    return {
        "source_file": str(filepath),
        "total_lines": total_lines,
        "boilerplate_lines": boilerplate_count,
        "method": "llm_mapped",
        "document_type": doc_map.get("document_type"),
        "document_title": doc_map.get("title"),
        "sections": sections,
        "recommended_reading_order": recommended[:10],
        "stats": {
            "high_density_lines": high,
            "medium_density_lines": medium,
            "skip_lines": skip,
            "reading_reduction": round(1 - (high + medium) / max(total_lines, 1), 3),
        },
    }


def write_index(filepath, index_data):
    """Write the index JSON sidecar file."""
    out_path = re.sub(r'\.txt$', '.index.json', str(filepath))
    if out_path == str(filepath):
        out_path = str(filepath) + ".index.json"
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(index_data, f, indent=2)
    return out_path


def process_directory(dirpath, use_llm=True):
    """Index all .txt files in a directory tree."""
    gemini_path = find_gemini() if use_llm else None
    if use_llm and not gemini_path:
        print("Warning: Gemini CLI not found — using full-read fallback for all files", file=sys.stderr)

    results = []
    txt_files = []
    for root, _, files in os.walk(dirpath):
        for fname in sorted(files):
            if fname.endswith('.txt') and not fname.endswith('.index.json'):
                txt_files.append(os.path.join(root, fname))

    for i, fpath in enumerate(txt_files, 1):
        idx = index_file(fpath, use_llm=use_llm, gemini_path=gemini_path)
        write_index(fpath, idx)
        method = idx.get("method", "unknown")
        name = os.path.basename(fpath)
        print(f"  [{i}/{len(txt_files)}] {name:<55} {idx['total_lines']:>6} lines  ({method})", file=sys.stderr)
        results.append((fpath, idx))

    return results


def main():
    parser = argparse.ArgumentParser(description="Magellan Silver Layer Indexer")
    parser.add_argument('file', nargs='?', help='Single .txt file to index')
    parser.add_argument('--dir', help='Directory of .txt files to index recursively')
    parser.add_argument('--no-llm', action='store_true', help='Skip LLM mapping, boilerplate detection only')
    parser.add_argument('--stats', action='store_true', help='Print per-file breakdown')
    args = parser.parse_args()

    use_llm = not args.no_llm

    if args.dir:
        results = process_directory(args.dir, use_llm=use_llm)
        total_lines = sum(r[1]["total_lines"] for r in results)
        high = sum(r[1]["stats"].get("high_density_lines", 0) for r in results)
        medium = sum(r[1]["stats"].get("medium_density_lines", 0) for r in results)
        skip = sum(r[1]["stats"].get("skip_lines", 0) for r in results)

        methods = Counter(r[1].get("method", "unknown") for r in results)
        llm_mapped = methods.get("llm_mapped", 0)
        full_read = methods.get("full_read", 0)
        fallback = methods.get("no_llm_fallback", 0) + methods.get("llm_failed", 0) + methods.get("llm_no_matches", 0)

        print(f"\nIndexed {len(results)} files")
        print(f"  LLM mapped:     {llm_mapped}")
        print(f"  Full read:      {full_read} (≤{LLM_THRESHOLD} lines)")
        print(f"  Fallback:       {fallback}")
        print(f"  Total lines:    {total_lines:,}")
        print(f"  High density:   {high:,} ({high/max(total_lines,1)*100:.1f}%)")
        print(f"  Medium density: {medium:,} ({medium/max(total_lines,1)*100:.1f}%)")
        print(f"  Skip/reference: {skip:,} ({skip/max(total_lines,1)*100:.1f}%)")
        print(f"  Reading reduction: {1-(high+medium)/max(total_lines,1):.1%}")

        if args.stats:
            print("\nPer-file breakdown:")
            for fpath, idx in sorted(results, key=lambda r: -r[1]["total_lines"]):
                name = os.path.basename(fpath)
                s = idx["stats"]
                m = idx.get("method", "?")
                print(f"  {name:<55} {idx['total_lines']:>6}  "
                      f"high:{s.get('high_density_lines',0):>5}  "
                      f"skip:{s.get('skip_lines',0):>5}  "
                      f"reduce:{s.get('reading_reduction',0):.0%}  "
                      f"({m})")

    elif args.file:
        gemini_path = find_gemini() if use_llm else None
        if use_llm and not gemini_path:
            print("Warning: Gemini CLI not found — using fallback", file=sys.stderr)
        idx = index_file(args.file, use_llm=use_llm, gemini_path=gemini_path)
        out = write_index(args.file, idx)
        print(f"Indexed: {args.file}")
        print(f"  Output: {out}")
        print(f"  Method: {idx.get('method', 'unknown')}")
        print(f"  Sections: {len(idx['sections'])}")
        print(f"  Total lines: {idx['total_lines']}")
        if idx.get('document_type'):
            print(f"  Document type: {idx['document_type']}")
        if idx.get('document_title'):
            print(f"  Title: {idx['document_title']}")
        s = idx["stats"]
        print(f"  High density: {s.get('high_density_lines', 0)}")
        print(f"  Reading reduction: {s.get('reading_reduction', 0):.0%}")
        if idx.get('recommended_reading_order'):
            print(f"  Recommended reading order:")
            for title in idx['recommended_reading_order'][:5]:
                print(f"    - {title}")
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == '__main__':
    main()
