# E1: KG Write Tool (JSON I/O Safety)

**Priority:** Next
**Status:** In Progress

## Problem

The LLM performs read-modify-write on JSON files, risking corruption
(dropped brackets, trailing commas, malformed arrays). This is the single
biggest reliability risk in the pipeline.

## Solution

A Node.js CLI tool (`tools/kg-write.js`) that handles all KG write
operations. The LLM passes structured arguments, the script handles
JSON serialization, schema validation, and atomic writes.

## Design Decisions

- **No random IDs**: fact_id and edge_id dropped (nothing references them).
  entity_id is deterministic (domain:snake_case_name). contradiction_id
  and question_id are sequence-assigned by the script.
- **Domain registry**: `.magellan/domains.json` is the single source of
  truth for valid domain names. Domains must be registered before use.
  Fuzzy-match warning prevents spelling variants.
- **Domain discovery**: Pipeline scans all files first, proposes a domain
  list for batch approval, then locks the domain set for extraction.
- **Stdin for entities**: Complex nested structures (evidence arrays) piped
  via stdin. Flat operations use named arguments.
- **Post-write validation**: After any direct JSON write (summaries, etc.),
  validate with node -e "JSON.parse(...)".

## Operations

- `add-domain` — register a domain (with fuzzy-match guard)
- `add-fact` — append fact to domain fact file
- `add-entity` — create entity file (evidence via stdin)
- `add-edge` — append edge to relationships.json
- `add-contradiction` — append to active array, return assigned c_ID
- `add-question` — append to active array, return assigned oq_ID
- `validate` — validate any KG JSON file against schema
