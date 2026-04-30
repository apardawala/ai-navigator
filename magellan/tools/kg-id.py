#!/usr/bin/env python3
"""
Magellan KG ID and Hash Generator

Deterministic ID generation and content hashing for all KG artifacts.
Every ID in the knowledge graph is produced by this tool — never ad-hoc.

Usage:
    kg-id.py entity <domain> <name>              Entity ID from domain + name
    kg-id.py fact <subject> <predicate> <object>  Fact ID from SPO triple
    kg-id.py contradiction <quote1> <quote2>      Contradiction ID from two quotes
    kg-id.py question <domain> <question_text>    Open question ID
    kg-id.py hash <file_path>                     SHA-256 content hash
    kg-id.py slug <text>                          Filesystem-safe slug
    kg-id.py validate-entity <file_path>          Validate entity markdown
    kg-id.py validate-fact <file_path>            Validate fact markdown
"""

import hashlib
import re
import sys
import os

try:
    import yaml
except ImportError:
    yaml = None


def slugify(text):
    """Convert text to a filesystem-safe slug."""
    s = text.lower().strip()
    s = re.sub(r'[^a-z0-9\s_-]', '', s)
    s = re.sub(r'[\s-]+', '_', s)
    s = re.sub(r'_+', '_', s)
    return s.strip('_')


def entity_id(domain, name):
    """Generate deterministic entity ID: <domain>:<slug>"""
    return f"{domain}:{slugify(name)}"


def fact_id(subject, predicate, obj):
    """Generate deterministic fact ID from SPO triple."""
    content = f"{subject.strip()}|{predicate.strip()}|{obj.strip()}"
    h = hashlib.sha256(content.encode('utf-8')).hexdigest()[:8]
    return f"f_{h}"


def contradiction_id(quote1, quote2):
    """Generate deterministic contradiction ID from two quotes."""
    combined = f"{quote1.strip()}|{quote2.strip()}"
    h = hashlib.sha256(combined.encode('utf-8')).hexdigest()[:8]
    return f"c_{h}"


def question_id(domain, question_text):
    """Generate deterministic open question ID."""
    content = f"{domain}|{question_text.strip()}"
    h = hashlib.sha256(content.encode('utf-8')).hexdigest()[:8]
    return f"oq_{h}"


def content_hash(filepath):
    """Compute SHA-256 hash of file contents."""
    h = hashlib.sha256()
    with open(filepath, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            h.update(chunk)
    return f"sha256:{h.hexdigest()}"


def parse_frontmatter(filepath):
    """Parse YAML frontmatter from a markdown file."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    if not content.startswith('---'):
        return None, content

    end = content.find('---', 3)
    if end == -1:
        return None, content

    fm_text = content[3:end].strip()

    if yaml:
        fm = yaml.safe_load(fm_text)
    else:
        fm = {}
        for line in fm_text.split('\n'):
            if ':' in line and not line.strip().startswith('-'):
                key, val = line.split(':', 1)
                key = key.strip()
                val = val.strip()
                if val.startswith('[') and val.endswith(']'):
                    val = [v.strip() for v in val[1:-1].split(',')]
                elif val.replace('.', '').isdigit():
                    val = float(val) if '.' in val else int(val)
                fm[key] = val

    body = content[end + 3:].strip()
    return fm, body


VALID_ENTITY_TYPES = [
    'BusinessProcess', 'BusinessRule', 'Component', 'Service',
    'Database', 'DataEntity', 'Integration', 'Infrastructure',
    'Person', 'Team', 'Operational', 'Constraint', 'Insight',
]

VALID_EDGE_TYPES = [
    'DEPENDS_ON', 'CALLS', 'READS_FROM', 'WRITES_TO',
    'INTEGRATES_WITH', 'ENFORCES', 'CONTAINS', 'TRIGGERS',
    'PRODUCES', 'CONSUMES', 'PART_OF', 'SUCCEEDED_BY',
    'SAME_AS', 'SHARES_DATA_WITH',
]

REQUIRED_ENTITY_FIELDS = ['type', 'domain', 'confidence', 'weight']


def validate_entity(filepath):
    """Validate an entity markdown file."""
    fm, body = parse_frontmatter(filepath)
    errors = []

    if fm is None:
        errors.append("Missing YAML frontmatter")
        return errors

    for field in REQUIRED_ENTITY_FIELDS:
        if field not in fm:
            errors.append(f"Missing required field: {field}")

    if 'type' in fm and fm['type'] not in VALID_ENTITY_TYPES:
        errors.append(f"Invalid type '{fm['type']}'. Valid: {', '.join(VALID_ENTITY_TYPES)}")

    if 'confidence' in fm:
        c = fm['confidence']
        if not isinstance(c, (int, float)) or c < 0 or c > 1:
            errors.append(f"confidence must be 0.0-1.0, got {c}")

    if 'weight' in fm:
        w = fm['weight']
        if not isinstance(w, (int, float)) or w < 0 or w > 1:
            errors.append(f"weight must be 0.0-1.0, got {w}")

    if 'edges' in fm:
        for i, edge in enumerate(fm['edges']):
            if 'to' not in edge:
                errors.append(f"Edge {i}: missing 'to' field")
            if 'type' not in edge:
                errors.append(f"Edge {i}: missing 'type' field")
            elif edge['type'] not in VALID_EDGE_TYPES:
                errors.append(f"Edge {i}: invalid type '{edge['type']}'")

    if not body or len(body) < 50:
        errors.append(f"Body too short ({len(body)} chars, minimum 50)")

    if '## Evidence' not in body:
        errors.append("Missing '## Evidence' section")

    # Derive expected ID from filepath
    basename = os.path.splitext(os.path.basename(filepath))[0]
    parent = os.path.basename(os.path.dirname(os.path.dirname(filepath)))
    expected_id = f"{parent}:{basename}"
    if 'id' in fm and fm['id'] != expected_id:
        errors.append(f"ID mismatch: frontmatter says '{fm['id']}', path implies '{expected_id}'")

    return errors


def validate_fact(filepath):
    """Validate a fact markdown file."""
    fm, body = parse_frontmatter(filepath)
    errors = []

    if fm is None:
        errors.append("Missing YAML frontmatter")
        return errors

    for field in ['source', 'domain']:
        if field not in fm:
            errors.append(f"Missing required field: {field}")

    if not body:
        errors.append("Empty body — no facts")

    fact_headers = re.findall(r'^## (f_[a-f0-9]+)', body, re.MULTILINE)
    if not fact_headers:
        errors.append("No fact entries found (expected ## f_xxxxxxxx headers)")

    return errors


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == 'entity' and len(sys.argv) == 4:
        print(entity_id(sys.argv[2], sys.argv[3]))
    elif cmd == 'fact' and len(sys.argv) == 5:
        print(fact_id(sys.argv[2], sys.argv[3], sys.argv[4]))
    elif cmd == 'contradiction' and len(sys.argv) == 4:
        print(contradiction_id(sys.argv[2], sys.argv[3]))
    elif cmd == 'question' and len(sys.argv) == 4:
        print(question_id(sys.argv[2], sys.argv[3]))
    elif cmd == 'hash' and len(sys.argv) == 3:
        print(content_hash(sys.argv[2]))
    elif cmd == 'slug' and len(sys.argv) == 3:
        print(slugify(sys.argv[2]))
    elif cmd == 'validate-entity' and len(sys.argv) == 3:
        errors = validate_entity(sys.argv[2])
        if errors:
            print(f"INVALID: {len(errors)} errors")
            for e in errors:
                print(f"  - {e}")
            sys.exit(1)
        else:
            print("VALID")
    elif cmd == 'validate-fact' and len(sys.argv) == 3:
        errors = validate_fact(sys.argv[2])
        if errors:
            print(f"INVALID: {len(errors)} errors")
            for e in errors:
                print(f"  - {e}")
            sys.exit(1)
        else:
            print("VALID")
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == '__main__':
    main()
