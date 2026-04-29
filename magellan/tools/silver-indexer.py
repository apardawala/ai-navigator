#!/usr/bin/env python3
"""
Magellan Silver Layer Indexer

Analyzes kreuzberg text extracts to identify document structure, section
boundaries, and content density. Produces a sidecar .index.json that
enables targeted reading during fact extraction.

Usage:
    silver-indexer.py <file.txt>           Index one file
    silver-indexer.py --dir <path>         Index all .txt files in directory tree
    silver-indexer.py --enrich             Enable Phase 2 LLM enrichment (NYI)
"""

import argparse
import json
import os
import re
import sys
from collections import Counter
from pathlib import Path

SIGNAL_IMPERATIVES = re.compile(
    r'\b(shall|must|will|should|required|prohibited|obligated|mandate[ds]?)\b', re.I
)
SIGNAL_TEMPORAL = re.compile(
    r'\b(within\s+\d+|before|after|deadline|by\s+\w+\s+\d|days?|hours?|business\s+days?)\b', re.I
)
SIGNAL_CONDITIONAL = re.compile(
    r'\b(if\b|when\b|unless|except|provided\s+that|in\s+the\s+event)\b', re.I
)
SIGNAL_QUANTITATIVE = re.compile(
    r'(\$[\d,]+|\b\d+%|\b\d+\s*(?:days?|hours?|months?|years?|percent))\b', re.I
)
SIGNAL_FORM_REF = re.compile(
    r'\b(\d{3}-\d{4}|[A-Z]{2,}-\d{3,}|Form\s+\d|RC-\d{4})\b'
)

BULLET_PATTERN = re.compile(r'^[\s]*[▪•\-\*]\s+')
NUMBERED_LIST = re.compile(r'^\s*\d+[\.\)]\s+')
DOTTED_LEADER = re.compile(r'\.{3,}\s*\d+\s*$')
DEFINITION_PATTERN = re.compile(r'^[“”"""][^“”"""]{2,}[“”"""]\s+(means|is defined as|is the|refers to|is an?)\b', re.I)
PAGE_NUMBER = re.compile(r'^\s*(?:Page\s+)?\d+\s*(?:of\s+\d+)?\s*$', re.I)
SECTION_NUMBER = re.compile(r'^(\d+(?:\.\d+)*|[A-Z](?:\.\d+)*|(?:Section|Chapter|Part|Article)\s+[IVXLCDM\d]+)', re.I)


def find_boilerplate(lines, threshold=3):
    """Find lines that repeat 3+ times — likely headers/footers/watermarks."""
    stripped = [l.strip() for l in lines]
    counts = Counter(stripped)
    boilerplate = set()
    for text, count in counts.items():
        if count >= threshold and len(text) > 5:
            boilerplate.add(text)
    return boilerplate


def detect_page_boundaries(lines, boilerplate):
    """Find line indices where page breaks occur."""
    boundaries = []
    for i, line in enumerate(lines):
        text = line.strip()
        if PAGE_NUMBER.match(text):
            boundaries.append(i)
        elif text in boilerplate and i > 0:
            prev = lines[i - 1].strip() if i > 0 else ""
            if not prev or prev in boilerplate:
                boundaries.append(i)
    return boundaries


BOILERPLATE_PATTERNS = [
    re.compile(r'^Title\s+\d+:', re.I),
    re.compile(r'^Revised\s+\w+\s+\d', re.I),
    re.compile(r'^Chapter\s+[A-Z]\(\d+\)', re.I),
    re.compile(r'^Comm\.\s+\d+', re.I),
    re.compile(r'Employees.?\s*Manual', re.I),
    re.compile(r'Department of Health', re.I),
    re.compile(r'^\s*Page\s+\d+', re.I),
]


def looks_like_boilerplate(text):
    """Check if a line matches common document boilerplate patterns."""
    return any(p.search(text) for p in BOILERPLATE_PATTERNS)


def is_header_candidate(line, prev_line, next_line, boilerplate):
    """Check if a line looks like a section header."""
    text = line.strip()
    if not text or len(text) > 100 or len(text) < 4:
        return False
    if text in boilerplate:
        return False
    if looks_like_boilerplate(text):
        return False
    if BULLET_PATTERN.match(text) or NUMBERED_LIST.match(text):
        return False
    if DEFINITION_PATTERN.match(text):
        return False
    if DOTTED_LEADER.search(text):
        return False
    if PAGE_NUMBER.match(text):
        return False
    if re.match(r'^(Legal|Policy)\s+(reference|statement)', text, re.I):
        return False
    if text.startswith('"') or text.startswith("'"):
        return False

    prev = prev_line.strip() if prev_line else ""
    nxt = next_line.strip() if next_line else ""

    preceded_by_break = not prev or prev in boilerplate or looks_like_boilerplate(prev)
    if not preceded_by_break:
        return False

    has_numbering = bool(SECTION_NUMBER.match(text))
    words = text.split()
    is_title_case = (
        len(words) >= 2
        and words[0][0].isupper()
        and not text.endswith('.')
        and not text.endswith(',')
        and not text.endswith(';')
    )

    return has_numbering or is_title_case


def classify_section_type(section_lines):
    """Classify a section's content type."""
    if not section_lines:
        return "empty"

    total = len(section_lines)
    dotted_leaders = sum(1 for l in section_lines if DOTTED_LEADER.search(l))
    definitions = sum(1 for l in section_lines if DEFINITION_PATTERN.match(l.strip()))
    bullets = sum(1 for l in section_lines if BULLET_PATTERN.match(l) or NUMBERED_LIST.match(l))
    non_empty = [l for l in section_lines if l.strip()]

    if total > 5 and dotted_leaders / max(len(non_empty), 1) > 0.2:
        return "toc"
    if definitions >= 3 or (total > 10 and definitions / max(len(non_empty), 1) > 0.05):
        return "glossary"
    if bullets / max(len(non_empty), 1) > 0.5:
        return "structured_list"
    avg_len = sum(len(l.strip()) for l in non_empty) / max(len(non_empty), 1)
    if avg_len > 60:
        return "narrative"
    return "mixed"


def score_section_density(section_lines):
    """Score how much actionable content a section contains."""
    text = "\n".join(section_lines)
    if not text.strip():
        return 0.0

    signals = 0
    signals += len(SIGNAL_IMPERATIVES.findall(text)) * 3
    signals += len(SIGNAL_TEMPORAL.findall(text)) * 2
    signals += len(SIGNAL_CONDITIONAL.findall(text)) * 1
    signals += len(SIGNAL_QUANTITATIVE.findall(text)) * 2
    signals += len(SIGNAL_FORM_REF.findall(text)) * 2

    non_empty = max(sum(1 for l in section_lines if l.strip()), 1)
    return min(signals / non_empty, 1.0)


def density_label(score, section_type):
    """Convert a numeric score + type into a density label."""
    if section_type == "toc":
        return "skip"
    if section_type == "glossary":
        return "reference"
    if section_type == "empty":
        return "skip"
    if score >= 0.4:
        return "high"
    if score >= 0.15:
        return "medium"
    return "low"


def extract_title_from_header(lines):
    """Try to extract a document title from the first few lines."""
    for line in lines[:30]:
        text = line.strip()
        if text and len(text) > 10 and len(text) < 120:
            if text[0].isupper() and not DOTTED_LEADER.search(text) and text not in ("", " "):
                if not PAGE_NUMBER.match(text):
                    return text
    return None


def index_file(filepath):
    """Analyze a silver text file and produce an index."""
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        raw_lines = f.readlines()

    lines = [l.rstrip('\r\n') for l in raw_lines]
    total_lines = len(lines)

    if total_lines == 0:
        return {"source_file": str(filepath), "total_lines": 0, "sections": [], "stats": {}}

    boilerplate = find_boilerplate(lines)
    boilerplate_indices = set()
    for i, line in enumerate(lines):
        if line.strip() in boilerplate:
            boilerplate_indices.add(i)

    headers = []
    for i, line in enumerate(lines):
        prev = lines[i - 1] if i > 0 else ""
        nxt = lines[i + 1] if i + 1 < len(lines) else ""
        if is_header_candidate(line, prev, nxt, boilerplate):
            headers.append((i, line.strip()))

    # Merge headers that are too close together (< 10 lines apart)
    # Keep the first header in a cluster
    if headers:
        merged = [headers[0]]
        for start, title in headers[1:]:
            prev_start = merged[-1][0]
            if start - prev_start < 10:
                continue
            merged.append((start, title))
        headers = merged

    if not headers:
        section_lines_all = [l for i, l in enumerate(lines) if i not in boilerplate_indices]
        score = score_section_density(section_lines_all)
        stype = classify_section_type(section_lines_all)
        sections = [{
            "title": "(entire document)",
            "lines": [1, total_lines],
            "type": stype,
            "density": density_label(score, stype),
            "signal_score": round(score, 3)
        }]
    else:
        sections = []
        for idx, (start_line, title) in enumerate(headers):
            if idx + 1 < len(headers):
                end_line = headers[idx + 1][0] - 1
            else:
                end_line = total_lines - 1

            sect_lines = [
                lines[i] for i in range(start_line, end_line + 1)
                if i not in boilerplate_indices
            ]

            stype = classify_section_type(sect_lines)
            score = score_section_density(sect_lines)
            dlabel = density_label(score, stype)

            sections.append({
                "title": title,
                "lines": [start_line + 1, end_line + 1],
                "type": stype,
                "density": dlabel,
                "signal_score": round(score, 3)
            })

    high_lines = sum(s["lines"][1] - s["lines"][0] + 1 for s in sections if s["density"] == "high")
    medium_lines = sum(s["lines"][1] - s["lines"][0] + 1 for s in sections if s["density"] == "medium")
    low_lines = sum(s["lines"][1] - s["lines"][0] + 1 for s in sections if s["density"] == "low")
    skip_lines = sum(s["lines"][1] - s["lines"][0] + 1 for s in sections if s["density"] in ("skip", "reference"))

    recommended = [s["title"] for s in sorted(sections, key=lambda s: -s["signal_score"]) if s["density"] in ("high", "medium")]

    title = extract_title_from_header(lines)

    return {
        "source_file": str(filepath),
        "total_lines": total_lines,
        "boilerplate_lines": len(boilerplate_indices),
        "document_title": title,
        "sections": sections,
        "recommended_reading_order": recommended[:10],
        "stats": {
            "high_density_lines": high_lines,
            "medium_density_lines": medium_lines,
            "low_density_lines": low_lines,
            "skip_lines": skip_lines,
            "section_count": len(sections),
            "reading_reduction": round(1 - (high_lines + medium_lines) / max(total_lines, 1), 3)
        }
    }


def write_index(filepath, index_data):
    """Write the index JSON sidecar file."""
    out_path = str(filepath) + ".index.json" if not str(filepath).endswith(".index.json") else filepath
    # Replace the .txt.index.json with .index.json
    out_path = re.sub(r'\.txt\.index\.json$', '.index.json', str(filepath) + ".index.json")
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(index_data, f, indent=2)
    return out_path


def process_directory(dirpath):
    """Index all .txt files in a directory tree."""
    results = []
    for root, _, files in os.walk(dirpath):
        for fname in sorted(files):
            if fname.endswith('.txt') and not fname.endswith('.index.json'):
                fpath = os.path.join(root, fname)
                idx = index_file(fpath)
                out = write_index(fpath, idx)
                results.append((fpath, idx))
    return results


def main():
    parser = argparse.ArgumentParser(description="Magellan Silver Layer Indexer")
    parser.add_argument('file', nargs='?', help='Single .txt file to index')
    parser.add_argument('--dir', help='Directory of .txt files to index recursively')
    parser.add_argument('--enrich', action='store_true', help='Enable Phase 2 LLM enrichment (NYI)')
    parser.add_argument('--stats', action='store_true', help='Print aggregate statistics')
    args = parser.parse_args()

    if args.dir:
        results = process_directory(args.dir)
        total_lines = sum(r[1]["total_lines"] for r in results)
        high = sum(r[1]["stats"]["high_density_lines"] for r in results)
        medium = sum(r[1]["stats"]["medium_density_lines"] for r in results)
        skip = sum(r[1]["stats"]["skip_lines"] for r in results)

        print(f"Indexed {len(results)} files")
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
                print(f"  {name:<60} {idx['total_lines']:>6} lines  "
                      f"high:{s['high_density_lines']:>5}  "
                      f"med:{s['medium_density_lines']:>5}  "
                      f"skip:{s['skip_lines']:>5}  "
                      f"reduce:{s['reading_reduction']:.0%}")

    elif args.file:
        idx = index_file(args.file)
        out = write_index(args.file, idx)
        print(f"Indexed: {args.file}")
        print(f"  Output: {out}")
        print(f"  Sections: {idx['stats']['section_count']}")
        print(f"  Total lines: {idx['total_lines']}")
        print(f"  High density: {idx['stats']['high_density_lines']}")
        print(f"  Reading reduction: {idx['stats']['reading_reduction']:.0%}")
        if idx['recommended_reading_order']:
            print(f"  Recommended reading order:")
            for title in idx['recommended_reading_order'][:5]:
                print(f"    - {title}")
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == '__main__':
    main()
