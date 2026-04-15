---
name: file-conventions
description: JSON schemas and directory layout for all Magellan KG files. Load this before writing any file to .magellan/. Not a workflow — use the pipeline command for processing.
---

# File Conventions

All Magellan outputs go in `.magellan/` within the workspace root. This skill defines
every file type, its exact JSON schema, path pattern, and validation rules. Follow these
schemas exactly when reading or writing Magellan files.

## Directory Layout

```
.magellan/
├── state.json
├── index.json
├── log.md                      ← append-only activity log (one line per event)
├── summary.md                  ← compressed KG overview for session start (auto-generated)
├── graph.html                  ← interactive KG explorer (auto-generated, vis.js)
├── domains.json                ← registered domain names (single source of truth)
├── cross_domain.json
├── processed_files.json
├── pipeline_feedback.json
├── onboarding_guide.md
├── contradictions_dashboard.md
├── contradictions_dashboard.html
├── language_guides/            ← reference guides for legacy languages
├── diagrams/                   ← C4 architecture diagrams (Mermaid + PlantUML)
│   ├── context.mmd / .puml
│   ├── containers.mmd / .puml
│   └── components_<domain>.mmd / .puml
├── research/                   ← External research reports (NOT in the KG)
│   └── <topic>.md              ← One report per research topic
├── work/                       ← SDLC work items (one directory per work item)
│   └── <slug>/
│       ├── status.md           ← Current phase, created/updated dates
│       ├── analysis.md         ← Phase 1: KG entities, contradictions, gaps
│       ├── context.md          ← Phase 2: Resolved questions, decisions
│       ├── tasks.md            ← Phase 3: Atomic task plans
│       ├── estimate.md         ← Phase 4: Blast radius, risks, pre-mortem
│       ├── execution.md        ← Phase 5: Per-task commit refs and notes
│       ├── verification.md     ← Phase 6: Pass/fail per acceptance criterion
│       └── audit.md            ← Phase 7: Integration check, KG updates
├── codebase/                   ← Codebase analysis documents
│   ├── STACK.md                ← Languages, frameworks, dependencies
│   ├── ARCHITECTURE.md         ← Patterns, boundaries, data flow
│   ├── CONVENTIONS.md          ← Naming, style, idioms
│   ├── INTEGRATIONS.md         ← External APIs, databases, 3rd parties
│   └── CONCERNS.md             ← Tech debt, complexity hotspots, risks
└── domains/
    └── <domain>/
        ├── facts/              ← one file per source document
        │   └── <source>.json
        ├── entities/           ← one file per entity
        │   └── <entity_name>.json
        ├── relationships.json
        ├── summary.json
        ├── contradictions.json  ← {active: [], resolved: []}
        ├── open_questions.json ← {active: [], resolved: []}
        ├── discovered_links.json ← cross-domain link candidates (used by onboarding guide)
        └── deliverables/       ← Phase 2 outputs
            ├── business_rules.md
            ├── ddd_spec.md
            ├── contracts.md
            ├── review.md
            ├── rules_<domain>.dmn
            ├── rules_<domain>.json
            ├── rules_<domain>.csv
            ├── rules_<domain>.feature
            ├── openapi.yaml
            └── asyncapi.yaml
```

## CLI Tools

Three tools at `~/.claude/tools/magellan/` handle deterministic operations. Do NOT
write KG JSON directly — use these tools. Markdown files (summaries, dashboards)
write directly.

**`kg-write.js`** — JSON write operations with schema validation:
`add-domain`, `add-fact`, `add-entity` (evidence via stdin), `add-edge`,
`add-contradiction`, `add-question`, `validate`

**`kg-query.js`** — Deterministic graph traversal:
`walk`, `impact`, `between`, `neighbors`, `stats`

**`kg-ops.js`** — Pipeline operations (verification, counting, state):
`update-state`, `update-processed`, `rebuild-index`, `hash-check`,
`verify-ledger`, `verify-quotes`, `verify-edges`, `verify-coverage`, `hub-scores`

Run any tool with `help` for usage: `node ~/.claude/tools/magellan/kg-write.js help`

## IDs

Only three ID types exist. All are deterministic:

- **entity_id**: `<domain>:<snake_case_name>` (e.g., `billing:invoice_generation`).
  Derived from domain + name. The kg-write tool computes this.
- **contradiction_id**: `c_` + 3-digit sequence (e.g., `c_001`). Assigned by
  the kg-write tool based on the count of existing entries.
- **question_id**: `oq_` + 3-digit sequence (e.g., `oq_001`). Same pattern.

Facts and edges have no IDs. Facts are identified by source document + statement.
Edges are identified by their from/to/type tuple.

## Domain Registry

**Path**: `.magellan/domains.json` — `{"domains": ["auction_operations", "billing"]}`

Single source of truth for valid domain names. All kg-write operations validate
`--domain` against this file. Register with `node ~/.claude/tools/magellan/kg-write.js add-domain`.
The tool warns on similar names (Levenshtein distance ≤ 3).

## File Path Safety

Entity IDs use underscores for filenames: `billing:invoice_generation` →
`.magellan/domains/billing/entities/invoice_generation.json`.

---

## Schemas

### Atomic Fact

**Path**: `.magellan/domains/<domain>/facts/<source_document_slug>.json`

The source document slug is the filename with extension replaced (e.g., `Q3_ops_runbook`
for `Q3_ops_runbook.pdf`).

```json
{
  "source_document": "path/to/source.pdf",
  "domain": "billing",
  "extracted_at": "2026-03-15T10:30:45Z",
  "fact_count": 2,
  "facts": [
    {
      "statement": "Invoices exceeding $10,000 are routed to MANUAL_REVIEW",
      "subject": "Invoice Generation",
      "subject_domain": "billing",
      "predicate": "has exception rule",
      "object": "Manual review bypass for high-value invoices",
      "source": {
        "document": "Q3_ops_runbook.pdf",
        "location": "page 12, section 'Exception Handling'",
        "quote": "Invoices exceeding $10,000 are routed to MANUAL_REVIEW."
      },
      "confidence": 0.75,
      "tags": ["business_rule", "exception_handling"]
    }
  ]
}
```

**Required fields per fact**: `statement` (min 10 chars), `subject`, `subject_domain`
(lowercase, letters/digits/underscores only), `predicate`, `object`,
`source.document`, `source.location`, `source.quote` (max 500 chars), `confidence`
(0.0–1.0).

**Optional**: `tags` (default empty array).

**Rules**:
- Every fact MUST have a source quote. No exceptions.
- `subject_domain` must be a registered domain: `^[a-z][a-z0-9_]*$`
- Use `~/.claude/tools/magellan/kg-write.js add-fact` to write — it handles `fact_count` and validation.
- Write facts incrementally (every 10–15 facts), not all at the end.

### Entity

**Path**: `.magellan/domains/<domain>/entities/<entity_name>.json`

```json
{
  "entity_id": "billing:invoice_generation",
  "name": "Invoice Generation",
  "type": "BusinessProcess",
  "domain": "billing",
  "summary": "Four-state invoice lifecycle (DRAFT → ISSUED → PAID) with a MANUAL_REVIEW bypass for invoices exceeding $10k...",
  "properties": {
    "states": ["DRAFT", "ISSUED", "PAID", "MANUAL_REVIEW"]
  },
  "evidence": [
    {
      "source": "Q3_ops_runbook.pdf",
      "location": "page 12",
      "quote": "Invoices exceeding $10,000 are routed to MANUAL_REVIEW...",
      "confidence": 0.75
    }
  ],
  "tags": ["business_rule"],
  "confidence": 0.85,
  "weight": 0.9,
  "version": {
    "current": "v1",
    "status": "active"
  },
  "related_entities": [
    {
      "entity_id": "billing:manual_review_bypass",
      "relationship": "ENFORCES",
      "direction": "outgoing"
    }
  ],
  "open_questions": ["oq_003"]
}
```

**Required fields**: `entity_id`, `name`, `type`, `domain`, `summary` (min 50 chars),
`evidence` (at least one entry with non-empty quote), `confidence`, `weight`.

**`related_entities`** is a denormalized view of the entity's relationships — a
convenience so a reader with just this one file has enough context. The canonical
relationship data lives in `relationships.json` and `cross_domain.json`.

**Entity types**: `BusinessProcess`, `BusinessRule`, `Component`, `Service`, `Database`,
`DataEntity`, `Integration`, `Infrastructure`, `Person`, `Team`, `Operational`,
`Constraint`.

**Version status**: `active`, `superseded`, `deprecated`. Never delete entities — mark
as superseded.

**Rules**:
- Each entity is self-contained. A reader with just this one file has everything needed.
- Write entities one at a time, immediately after building. Do not accumulate.
- The `summary` field is the most important — models read it first.

### Relationships (Intra-Domain)

**Path**: `.magellan/domains/<domain>/relationships.json`

```json
{
  "domain": "billing",
  "edges": [
    {
      "from": "billing:invoice_generation",
      "to": "billing:manual_review_bypass",
      "type": "ENFORCES",
      "properties": {
        "description": "Invoice generation enforces the manual review bypass rule"
      },
      "evidence": {
        "source": "CBBLKBOOK.cblle",
        "location": "lines 142-198"
      },
      "confidence": 0.95,
      "weight": 0.9
    }
  ]
}
```

**Required per edge**: `from`, `to`, `type`, `properties.description`,
`evidence.source`, `evidence.location`, `confidence`, `weight`.

**Rules**: Write once per domain after all facts in that domain are processed.

### Cross-Domain Relationships

**Path**: `.magellan/cross_domain.json`

```json
{
  "domain": "_cross_domain",
  "edges": [
    {
      "from": "billing:vehicle",
      "to": "title:vehicle_title",
      "type": "SAME_AS",
      "confidence": 0.92,
      "properties": {
        "description": "Same vehicle concept across billing and title domains"
      },
      "evidence": {
        "source": "billing/CBBLKBOOK.cblle",
        "location": "line 45"
      }
    }
  ]
}
```

**SAME_AS rules**: Confidence ≥ 0.70 required. Never merge entities — link them.
SAME_AS only between different domains (intra-domain handled by the entity itself).

### Contradiction

**Path**: `.magellan/domains/<domain>/contradictions.json`

Single file with `active` and `resolved` arrays:

```json
{
  "active": [
    {
      "contradiction_id": "c_001",
      "description": "Threshold mismatch: one source says $10k, another says $15k",
      "domain": "billing",
      "severity": "high",
      "status": "open",
      "related_entities": ["billing:invoice_generation"],
      "sources": [
        { "source": "Q3_ops_runbook.pdf", "quote": "...exceeding $10,000..." },
        { "source": "Policy_v2.docx", "quote": "...exceeding $15,000..." }
      ],
      "detected_at": "2026-03-15T10:45:00Z"
    }
  ],
  "resolved": []
}
```

**Required**: `contradiction_id`, `description`, `domain`, `severity`, `status`,
`sources` (at least two), `detected_at`.

**Resolved entries** add: `resolution_note`, `resolved_at` (ISO 8601),
optionally `canonical_definition`.

**To add**: Read the existing file, append to the `active` array, write back.
If the file doesn't exist, create it with `{"active": [], "resolved": []}`.

**To resolve**: Move from `active` to `resolved`. See `/magellan:add --resolve`.

### Open Question

**Path**: `.magellan/domains/<domain>/open_questions.json`

Single file with `active` and `resolved` arrays (same pattern as contradictions):

```json
{
  "active": [
    {
      "question_id": "oq_001",
      "question": "Is the $10k threshold still active in the current system?",
      "domain": "billing",
      "priority": "high",
      "status": "open",
      "related_entities": ["billing:invoice_generation"],
      "raised_by": "Ingestion Pass 2",
      "context": "Found conflicting documentation about threshold",
      "directed_to": "senior_developer",
      "raised_at": "2026-03-15T10:45:00Z"
    }
  ],
  "resolved": []
}
```

**Required**: `question_id`, `question`, `domain`, `priority`, `status`,
`raised_at`.

**Resolved entries** add: `answer_source` (the answer text), `answered_at`
(ISO 8601).

**To add**: Read the existing file, append to the `active` array, write back.
If the file doesn't exist, create it with `{"active": [], "resolved": []}`.

**To resolve**: Move from `active` to `resolved`. See `/magellan:add --resolve`.

### Domain Summary

**Path**: `.magellan/domains/<domain>/summary.json`

```json
{
  "domain": "billing",
  "entity_count": 42,
  "narrative": "The billing domain manages the complete lifecycle of invoice generation...",
  "hub_entities": [
    {
      "entity_id": "billing:invoice_generation",
      "hub_score": 3.85,
      "relationships": 5,
      "summary": "Generates invoices..."
    }
  ],
  "hub_count": 2,
  "contradiction_count": 1,
  "question_count": 2
}
```

**Required**: `domain`, `entity_count`, `narrative` (min 200 chars), `hub_entities`,
`hub_count`.

**Hub detection**: `hub_score = relationship_count × entity_weight`. Exclude entities
with weight < 0.5. Select top 10–15 hubs per domain.

### State

**Path**: `.magellan/state.json`

```json
{
  "initialized_at": "2026-03-15T09:00:00Z",
  "last_ingest": "2026-03-15T10:30:00Z",
  "last_summary_entity_counts": {
    "billing": 42,
    "title": 28
  },
  "pipeline_step": 6,
  "session_notes": "Dealer domain has complex naming — dlr_stat = dealer status, not statistics. Billing domain fully extracted. 3 cross-domain SAME_AS links found between billing and title."
}
```

Tracks pipeline progress. `last_summary_entity_counts` triggers re-summarization
when entity count changes > 10%.

**`session_notes`**: Brief working context (2-3 sentences) written after every
quality gate. Captures observations, patterns, naming quirks, and anything a
fresh session would need to continue without re-reading processed files. Read
this on resume to restore working context.

### Index

**Path**: `.magellan/index.json`

```json
{
  "domains": {
    "billing": {
      "entity_count": 42,
      "edge_count": 15,
      "contradiction_count": 2,
      "question_count": 3
    }
  },
  "total_entities": 70,
  "total_edges": 25
}
```

Updated at pipeline end. Provides quick stats without reading all domain files.

### Processed Files Ledger

**Path**: `.magellan/processed_files.json`

```json
{
  "files": {
    "src/billing/CBBLKBOOK.cblle": {
      "disposition": "ingested",
      "domain": "billing",
      "fact_count": 12,
      "content_hash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "processed_at": "2026-03-15T10:30:00Z"
    },
    "docs/corrupted.bin": {
      "disposition": "unreadable",
      "domain": null,
      "fact_count": 0,
      "content_hash": "sha256:a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a",
      "error": "Binary file, could not read content",
      "processed_at": "2026-03-15T10:31:00Z"
    }
  }
}
```

**Dispositions**: `ingested`, `no_facts`, `unreadable`, `extraction_error`,
`skipped_unchanged`, `skipped_by_rule`.

**`content_hash`**: SHA-256 hash of the file content, prefixed with `sha256:`.
Computed via `shasum -a 256 <file>`. Stored for every file regardless of
disposition. Used for incremental change detection — a matching hash means the
content is identical to the previous run.

Every file MUST reach a terminal disposition. Nothing is silently dropped.

### Pipeline Feedback

**Path**: `.magellan/pipeline_feedback.json`

Each entry: `{step, step_name, started_at, completed_at, findings: [{severity, message}], blocker_count, warning_count, suggestion_count}`. Quality gate appends after each step. The `started_at`/`completed_at` timestamps provide per-step timing for operational visibility.

### Activity Log

**Path**: `.magellan/log.md`

Append-only, one entry per line. Written by `node kg-ops.js log`. Format:

```
- <ISO timestamp> | <action> | <git user> | <detail>
```

Actions: `pipeline`, `ingest`, `query`, `resolve`, `correction`, `add-entity`,
`modify-entity`, `add-edge`, `remove-edge`, `add-contradiction`, `add-question`,
`add-domain`, `quality-gate`, `compress`, `codebase`, `research`.

Examples:

```markdown
- 2026-04-15T14:30:00Z | ingest | abbas | billing/invoice_procedures.pdf → 23 facts, 2 contradictions
- 2026-04-15T14:32:00Z | resolve | abbas | c_a3f2 (billing) — threshold confirmed as $5,000
- 2026-04-15T14:35:00Z | pipeline | abbas | step 3 complete — 45 entities, 67 relationships
- 2026-04-15T15:10:00Z | query | sarah | "how does billing connect to transportation?" → 4 entities cited
```

The file is created automatically on first log entry. Designed for git-friendly
parallel append — single-line entries minimize merge conflicts. Parseable with
grep: `grep "| ingest |" log.md`, `grep "| 2026-04-15" log.md`.

### Summary (Wake-Up)

**Path**: `.magellan/summary.md`

Auto-generated by `node kg-ops.js summary`. Provides a compressed KG overview
(~600-900 tokens) for AI agents to read at session start. Contains:

- Pipeline state (current step, session notes)
- Domain list with entity/edge/contradiction/question counts
- Thin coverage areas (domains with fewer than 5 entities)
- Top 5 contradictions by severity
- Top 5 open questions by priority
- Last 5 activity log entries

**Regeneration**: Run before committing changes to the project. The file is
a point-in-time snapshot — it reflects the KG state at the time of generation.
Referenced from the project's CLAUDE.md (or equivalent agent config file) so
the AI agent reads it automatically at session start.

**Do not edit manually.** Regenerate with `node kg-ops.js summary --workspace <path>`.

### Graph Explorer

**Path**: `.magellan/graph.html`

Auto-generated by `node kg-ops.js graph`. Self-contained interactive HTML file
using vis.js. Opens in any browser. Shows all entities as nodes (colored by
domain) and relationships as edges. Cross-domain edges shown as dashed red lines.

Features: search by entity name/ID, click node for details (ID, type, domain,
summary), physics-based layout, domain legend, entity/edge/domain counts.

**Do not edit manually.** Regenerate with `node kg-ops.js graph --workspace <path>`.

## Entity Weight Formula

`effective_weight = base_weight + corroboration + recency + references` (clamped 0-1).

Base weights: correction 0.95, production_source_code 0.90, database_schema 0.85,
official_policy 0.85, formal_design_document 0.80, api_specification 0.80,
qa_operational_manual 0.75, interview_transcript 0.70, meeting_transcript 0.50,
email_chain 0.40, informal_notes 0.30.

Modifiers: +0.05 per additional source (cap +0.15), −0.05/−0.10 for age (1-3yr/3yr+),
+0.05 if referenced by 5+ entities. Weight is metadata — it never filters out entities.

## Key Rules

1. **Append-only**: Never delete entities. Mark superseded with `version.status: "superseded"`.
2. **One file per entity**: Prevents merge conflicts and git bloat.
3. **Self-contained entities**: Each entity file has everything needed to understand it.
4. **Source tracing**: Every fact, entity, and edge traces to a source document with a quote.
5. **Nothing silently skipped**: Every file reaches a disposition in the processed files ledger.
6. **Use kg-write for mutations**: JSON writes go through `~/.claude/tools/magellan/kg-write.js` which handles read-before-write, domain validation, and schema checks.
