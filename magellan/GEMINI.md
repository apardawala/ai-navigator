# Magellan — Project Context

**Status**: Active
**Last Updated**: 2026-04-29

Magellan is an enterprise knowledge discovery plugin. It extracts structured
knowledge from collected materials and builds a queryable knowledge graph.

## Commands

- `/magellan` — Run the discovery pipeline or show status
- `/magellan:add <path>` — Add a file or directory
- `/magellan:add --codebase <path>` — Analyze a codebase
- `/magellan:add --correction "..."` — Record a verbal correction
- `/magellan:add --resolve <id> "..."` — Resolve a contradiction or open question
- `/magellan:ask <question>` — Query the knowledge graph
- `/magellan:work "description"` — Structured SDLC workflow
- `/magellan:research <topic>` — External research with citations

## Four Principles

1. Every fact traces to a source document. Nothing is invented.
2. Contradictions and open questions are the primary output, not a side effect.
3. Nothing is silently skipped. Every file gets a recorded disposition.
4. The model does the heavy lifting. Humans steer and correct.

## Architecture

```
magellan/
  commands/         # Slash command definitions
  skills/           # Reusable instruction sets
    _principles.md  # Runtime operating principles
    ingestion/      # Fact extraction from documents and code
    graph-building/ # Entity and relationship construction
    cross-domain-linking/   # Inter-domain connections
    contradiction-detection/  # Conflict surfacing
    summarization/  # Domain narratives
    onboarding-guide/  # Output generation
    pipeline-review/   # Quality gates
    file-conventions/  # JSON schemas
  tools/
    magellan-extract.py  # Extraction layer (kreuzberg Python API)
    kg-write.js     # Write KG data with schema validation
    kg-query.js     # Query KG (walk, impact, neighbors)
    kg-ops.js       # Pipeline ops (state, index, verify, audit)
```

## Medallion Data Architecture

- **Bronze**: Raw source files. Can be local or URL references.
- **Silver**: Rich JSON extracts in `.magellan/silver/` (`.silver.json`).
  Documents get markdown content, metadata, sections, language detection.
  Code gets source with tree-sitter AST (structure, imports, symbols).
- **Gold**: Knowledge graph in `.magellan/domains/`.

## Key Dependencies

- **kreuzberg** (`pip install kreuzberg`): Required. Document and code
  extraction via Python API.
- **Tree-sitter parsers**: Optional. For code intelligence. Install via
  `python3 tools/magellan-extract.py --setup`.

## Session Start

When working on a project with an existing `.magellan/` directory, read
`.magellan/summary.md` first for a compressed KG overview.

## Cross-Model Verification

When a secondary LLM CLI is available (e.g. Gemini), use it at pipeline
checkpoints to verify facts, review summaries, and check cross-domain links.
See `skills/_principles.md` for the verification protocol.
