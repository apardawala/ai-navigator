---
description: Magellan knowledge management system — show status or run the full discovery pipeline. Don't use for individual file adds — use /magellan:add instead.
argument-hint: [path] or --status or --dry-run or --full
---

# Magellan

The main entry point for Magellan. Shows workspace status or runs the full
pipeline (Phase 1 Discovery + Phase 2 Design).

## Usage

```
/magellan                  Run incremental pipeline (or full if first run)
/magellan <path>           Run pipeline on a specific workspace
/magellan --status         Show workspace status only (no processing)
/magellan --full           Force full pipeline re-run (ignore change detection)
/magellan --from-step N    Re-run pipeline starting from Step N (skip earlier steps)
/magellan --dry-run        Show what would be processed without running the pipeline
```

## Critical Rules

1. ALL file writes to `.magellan/` MUST follow the schemas defined in the
   file-conventions skill. Read the skill before writing any JSON file.
2. Facts MUST follow the atomic fact schema (required fields: statement, subject,
   subject_domain, predicate, object, source with quote, confidence).
3. Entities are one file per entity in `domains/<domain>/entities/`.
4. Do NOT create a monolithic `knowledge_graph.json`. The KG is stored as individual
   entity files.
5. Facts MUST be organized by domain: `domains/<domain>/facts/<source_document>.json`.
6. When appending to contradictions or open questions, always read the existing file
   first, add to the array, then write back.

## Execution Rules

1. **Step 0 runs in the background.** Preprocessing (init, discover, extract)
   is deterministic I/O work. Run it in the background and notify the user
   when it completes. Steps 1+ run in the foreground.

2. **No step skipping.** Every numbered step is MANDATORY. Do not combine steps.
   If a step fails, record the failure and continue — never skip silently.

3. **Quality gate after every foreground step.** Apply the pipeline-review skill
   after each step. Fix blockers before proceeding. Accumulate findings in
   `.magellan/pipeline_feedback.json`. Include `started_at` and `completed_at`
   timestamps in each feedback entry for per-step timing. Update `session_notes`
   in `state.json` with 2-3 sentences of working context.

4. **No subagent delegation for analysis steps.** Steps 1+ execute in the main
   conversation context. Step 0 is the only step that runs independently.

5. **Context hygiene.** Use Glob to count files rather than reading them all.
   Use Read with offset/limit for large files. Read only the fields you need.

6. **Log every significant action.** After completing each pipeline step and
   quality gate, log it using `node ~/.claude/tools/magellan/kg-ops.js log`:
   - Pipeline step completion: `--action pipeline --detail "step N complete — <summary>"`
   - Quality gate results: `--action quality-gate --detail "step N — M blockers, K warnings"`
   - Domain additions: `--action add-domain --detail "<domain> — 0 entities"`
   - File ingestion totals: `--action ingest --detail "<file> → N facts, M contradictions"`
   The tool detects the git user automatically. See file-conventions for the
   full list of log actions.

7. **Audit trail for every processing action.** In addition to the activity log,
   record structured audit entries using `kg-ops.js` audit commands:
   - `audit-log` for every significant action (file discovered, extracted,
     ingested, fact extracted, entity created, etc.) with input/output refs
     and rationale. This produces `.magellan/audit/session_log.jsonl`.
   - `audit-manifest` for every file at each processing stage (discovered,
     extracted, ingested, entity_linked, excluded) with tool versions and
     timestamps. This produces `.magellan/audit/processing_manifest.json`.
   - `audit-methodology` at the end of each pipeline run to generate
     `.magellan/audit/methodology.md` — a complete process description for
     independent audit and FOIA compliance.
   The audit trail is mandatory. Government clients require full traceability
   from any output back to source documents.

## First Step — Inject Principles into Agent Context

Before any processing:

1. Read `skills/_principles.md` to load the principles into context.
2. Detect the active agent and target the correct context file:
   - **Claude Code** → `CLAUDE.md`
   - **Gemini CLI** → `GEMINI.md`
   - **Other / unknown** → `CLAUDE.md` (default)
3. Check if the target context file exists in the workspace root.
   - **If it doesn't exist:** Write the contents of `_principles.md` into a
     new file under a `# Magellan` section. Display:
     "Created [file] with Magellan principles. Please restart the session
     so principles are loaded into the system prompt." Stop the pipeline.
   - **If it exists but has no `# Magellan` section:** Append the
     contents of `_principles.md` under a `# Magellan` section at the end.
     Display: "Added Magellan principles to [file]. Please restart
     the session so principles are loaded." Stop the pipeline.
   - **If it exists with a `# Magellan` section:** Principles are
     already injected. Continue to the next step.

This ensures Magellan principles are always in the system prompt,
regardless of which AI agent is running the pipeline.

## Second Step — Check for Verification Partner

After principles injection, check if a secondary LLM CLI is available for
cross-model verification:

```bash
which gemini
```

- **If available**: Display "Gemini CLI detected — will use for fact
  verification at pipeline checkpoints." Set an internal flag to enable
  verification gates after fact extraction (Step 2b), domain summarization
  (Step 6), and cross-domain linking (Step 4).
- **If not available**: Display "No verification partner detected —
  proceeding without cross-model checks." Continue normally. The pipeline
  never blocks on this.

When verification is enabled, after processing each file in Step 2b, pipe
the extracted facts to the verification partner:

```bash
gemini -p "Here are N facts extracted from [document]. Are these accurate?
What business rules or procedures did I miss? Be specific."
```

Fix any issues the partner flags before moving to the next file. Log
verification results in the audit trail.

## Behavior

When run, determine the target workspace:
- If a path argument is provided, use that path.
- If no argument is provided, use the current working directory.

Then determine the run mode:

- **`--status`** → show status only (Status Mode).
- **`--full`** → force full pipeline re-run.
- **`--from-step N`** → skip to Step N using existing data from earlier steps.
- `.magellan/` does not exist → full pipeline.
- `.magellan/` exists with `last_run` in state.json → incremental mode.
- `.magellan/` exists without `last_run` → show status.
- **`--dry-run`** → discover files and show what would be processed, then stop.

## Dry-Run Mode

Run file discovery and content hash check (Step 1) but stop before extraction.
Display:

```
Dry Run — Pipeline Preview
===========================
Files to process:    12 (8 new, 4 changed)
Files to skip:       38 (content unchanged)
Estimated domains:   3 (billing, title, transportation)
Pipeline steps:      19 (Step 0: background, Phase 1: 1-9, Phase 2: 10-18, Research: 19)

New files:
  docs/Q4_ops_update.pdf
  docs/settlement_process.md
  ...

Changed files:
  docs/dealer_manual.pdf (hash mismatch)
  ...

Run /magellan to proceed with the full pipeline.
```

## Status Mode

1. Read `.magellan/state.json` and `.magellan/index.json`.
2. Use Glob to find `domains/*/open_questions.json` and `domains/*/contradictions.json`.
   Read each and count entries.
3. Read `.magellan/processed_files.json` for file tracking data.
4. If `state.json` has `last_run.git_ref`, run `git diff --name-only <ref> HEAD`
   via Bash to detect changes.
5. Display status dashboard:

```
Magellan Knowledge Graph Status
================================
Files tracked:    200 (197 ingested, 3 no_facts)
Domains:          5 (billing, title, transportation, dealer_management, infrastructure)
Total entities:   312
Total edges:      489

Open questions:   12
Contradictions:   4

Top priority items:
  [critical] c_003: Settlement threshold mismatch between code and config
  [high]     oq_003: Is the $10,000 MANUAL_REVIEW threshold still active?

Suggested next action:
  3 open contradictions in dealer domain — resolve before Phase 2
  /magellan:add --resolve c_003 "The $10k threshold is correct per production code"
```

6. **Suggest next action** based on current state:
   - Pipeline incomplete → "Resume pipeline from Step N: `/magellan --from-step N`"
   - Open critical contradictions → "Resolve contradictions before Phase 2"
   - Open high-priority questions → "Answer open questions: `/magellan:add --resolve`"
   - Changed files detected → "N files changed since last run: `/magellan`"
   - Everything clean → "Knowledge graph is current. Query with `/magellan:ask`"

If no `.magellan/` directory is found:

```
No Magellan workspace found.
  /magellan /path/to/workspace    Run the full discovery pipeline
  /magellan:add <file>            Add a single document
```

---

## Pipeline

### Step 0: Preprocessing (Background)

This step runs in the background. It initializes the workspace, discovers
files, and extracts them to silver. No LLM judgment needed — purely
deterministic I/O. When the pipeline starts, check if Step 0 is already
complete by reading `.magellan/state.json`:

- If `pipeline_step >= 0` and silver files exist → Step 0 is done, proceed.
- If `.magellan/` doesn't exist or silver is missing/incomplete → run Step 0
  in the background and notify the user when it completes.

**What Step 0 does:**

1. **Initialize** (if `.magellan/` doesn't exist):
   - Create directory structure: `mkdir -p .magellan/domains .magellan/diagrams .magellan/language_guides .magellan/silver .magellan/audit`
   - Write `.magellan/state.json`: `{"initialized_at": "<ISO timestamp>"}`
   - Copy starter language guides from `skills/ingestion/language_guides/`
   - Initialize `.magellan/pipeline_feedback.json`, `.magellan/domains.json`
   - Install statusline and tools if missing
   - Verify kreuzberg: `python3 -c "import kreuzberg"`. If it fails, stop
     with: "kreuzberg is required. Install with: pip install kreuzberg"

2. **Discover files**:
   - Full mode: list all files excluding `.magellan/` and `.git/`
   - Incremental mode: use `git diff` + `git ls-files` for new/modified
   - Content hash check via `kg-ops.js hash-check`. Process only new/changed.

3. **Extract to silver**:
   ```bash
   python3 ~/.claude/tools/magellan/magellan-extract.py --dir <workspace> --output .magellan/silver/
   ```
   Produces `.silver.json` files containing:
   - **Documents**: markdown content, metadata, sections, language, quality score
   - **Code**: source with tree-sitter AST (structure, imports, symbols)
   - **Text/Markdown**: content with metadata

4. **Record dispositions** in `.magellan/processed_files.json`

5. **Update state**: `pipeline_step: 0`

**Display when complete:**
```
Step 0: Preprocessing Complete
================================
Files discovered:  52
  extracted:       47
  failed:           5 (see errors above)
  ---
  Accounted:       52/52

Silver files ready at .magellan/silver/
Proceed with /magellan to start analysis.
```

### Step 1: Domain Discovery and Fact Extraction

**This step and all subsequent steps run in the foreground.**

**Resume check**: If `state.json` has `pipeline_step >= 1`, read
`session_notes` to restore working context and offer to resume.

**Environment detection**: Check for AS/400 indicators (QRPGSRC, .rpgle,
.cblle, etc.). If found, load the AS/400 environment guide.

**Check for verification partner**:
```bash
which gemini
```
If available, enable Gemini verification at checkpoints.

**Domain Discovery** (first run only): Read silver file metadata (titles,
content types) to propose domains. Present to the user for approval.
Register via `kg-write.js add-domain`.

**Fact Extraction** — for each `.silver.json` file:

1. Read the silver JSON for `file_type`, `content`, `sections`, `metadata`,
   and `code_intelligence`.
2. **Documents**: Use sections and metadata to guide targeted reading.
   For large documents (>1500 lines), prioritize `procedure`/`policy`
   sections. Use `offset`/`limit` for specific sections.
3. **Code**: Read `code_intelligence` for structure before full source.
4. **Language filter**: Skip non-English docs with `skipped_language`.
5. Extract facts by applying the ingestion skill.
6. Write each fact using `kg-write.js add-fact`. The `--source-doc` should
   arguments (--workspace, --domain, --statement, --subject, etc.). The tool
   handles JSON serialization, schema validation, and fact_count updates.
   The `--source-doc` should reference the original bronze path, not the silver path.
5. **Update disposition** in `.magellan/processed_files.json` from `extracted` to
   `ingested` (if facts were produced) or `no_facts`. The tool enforces that
   `ingested` requires facts to exist.
6. Display: "Ingested [N/total]: filename (M facts → domain)"

**Track affected domains** as you process files.

**Contradiction diff for changed files**: When re-ingesting a file that was
previously processed (hash mismatch, not new), compare the new facts against
the existing facts from the previous version. If a fact's statement changed
(same subject but different claim), flag it as a potential contradiction using
`~/.claude/tools/magellan/kg-write.js add-contradiction`. This catches silent changes in source
documents that would otherwise go unnoticed.

If a file produces no facts, record the disposition as `no_facts` or `cataloged`
and continue. **Nothing is silently skipped.**

After all files, display:

```
Silver → Gold Fact Extraction
===============================
Total files:   47
  ingested:    40
  cataloged:    4
  no_facts:     3
  ---
  Accounted:   47/47
```

**Verify — File Ledger Reconciliation:**
Run `node ~/.claude/tools/magellan/kg-ops.js verify-ledger --workspace <path>`. If `pass` is false,
the missing files are listed — this is a **blocker**. Process them before continuing.

**Verify — Quote Verification:**
Run `node ~/.claude/tools/magellan/kg-ops.js verify-quotes --workspace <path>`. If any quotes fail,
fix or remove the hallucinated facts before continuing. Quote verification checks
against silver files, not bronze.

**Quality Gate.** Run `node ~/.claude/tools/magellan/kg-ops.js quality-gate --step 3`.
Run `node ~/.claude/tools/magellan/kg-ops.js update-state --workspace <path> --step 3 --notes "..."`.

### Step 2: Build Graph

Build entities and intra-domain relationships from atomic facts.

For each fact file in affected domains:
1. Read the facts.
2. Apply the graph-building skill: process 5-10 facts at a time. Write each
   entity using `~/.claude/tools/magellan/kg-write.js add-entity` (flat fields as args, evidence
   via stdin). The tool validates the schema and generates the entity_id.
3. Apply contradiction-detection: compare new facts against existing entities.
   Use `~/.claude/tools/magellan/kg-write.js add-contradiction` and `add-question` to append
   findings. The tool assigns deterministic IDs (c_001, oq_001).
4. Write relationships using `~/.claude/tools/magellan/kg-write.js add-edge` for each edge.
5. Display: "Built: domain (N entities, M relationships)"

**Verify — Edge Integrity:**
Run `node ~/.claude/tools/magellan/kg-ops.js verify-edges --workspace <path>`. If any dangling
references are found, flag as warning.

**Quality Gate.** Update state.json.

### Step 3: Cross-Domain Linking

Separate, mandatory pass. Do NOT fold into Step 2.

1. Use Glob to list all domains.
2. For each domain, list entities and read names + summaries.
3. Compare across domains for SAME_AS candidates.
4. Write `.magellan/cross_domain.json`.
5. Detect cross-domain contradictions.
6. Display: "Cross-domain: N SAME_AS, M relationships"

Skip if fewer than 2 domains.

**Verify — Relationship Integrity:**
Run `node ~/.claude/tools/magellan/kg-ops.js verify-edges --workspace <path>`. Checks both
intra-domain and cross-domain edges. Flag dangling references as warning.

**Quality Gate.** Update state.json.

### Step 4: Entity Deduplication

Scan each domain for near-duplicate entities (>80% name similarity or
near-identical summaries). Merge duplicates: keep the entity with more evidence,
mark the other as superseded.

**Verify — Evidence Preservation:**
For each merge performed, read the kept entity and verify its `evidence` array
contains entries from both original entities. Count evidence entries before and
after — the kept entity must have ≥ the sum of both originals. If evidence was
lost during merge, flag as blocker and restore from the superseded entity file
(which still exists, marked as superseded).

**Quality Gate.** Update state.json.

### Step 5: Domain Summarization

For each domain:
1. Run `node ~/.claude/tools/magellan/kg-ops.js hub-scores --workspace <path> --domain <name>` to
   get hub entities ranked by score.
2. Read the top 10-15 hub entity files for context.
3. Synthesize a 3-8 paragraph narrative.
4. Write `.magellan/domains/<domain>/summary.json`.

**Quality Gate.** Update state.json.

### Step 6: Onboarding Guide

Apply the onboarding-guide skill to generate `.magellan/onboarding_guide.md`.

**Quality Gate.** Update state.json.

### Step 7: Contradictions Dashboard

Apply the dashboard-generation skill to generate the markdown and HTML dashboard.

**Quality Gate.** Update state.json.

### Step 8: Diagrams and Graph Explorer

1. Apply the diagram-generation skill. Generate Mermaid and PlantUML for
   context, containers, and per-domain components.
2. Generate interactive graph: `kg-ops.js graph --workspace <path>`
   → `.magellan/graph.html`

**Quality Gate.** Update state.json.

### Step 9: Finalize Phase 1

1. Run `kg-ops.js update-state --workspace <path> --step 9 --set-last-run --file-count N`.
2. Run `kg-ops.js rebuild-index --workspace <path>`.
3. Display status dashboard.

**Phase 1 Verification:**

Verify Phase 1 outputs exist and contain meaningful content:
- At least 1 domain with entities
- Entities have summaries (50+ chars), evidence with quotes, weight > 0
- Relationships exist for domains with 3+ entities
- Domain summaries have narratives (200+ chars) with hubs
- Onboarding guide, dashboard, and diagrams exist

Failure conditions STOP the pipeline. Warning conditions are logged.

---

## Phase 2: Design Generation

Runs automatically after Phase 1 verification.

### Step 10: Business Rules Per Domain

Classify rules as HARD / SOFT / QUESTIONABLE. Cite source entities.

### Step 11: DDD Specs Per Domain

Bounded context: entities, aggregates, events, commands, integration points.

### Step 12: Implementation Contracts Per Domain

API contracts, event schemas, data models, integration contracts.

### Step 13: Per-Domain Review Documents

Decisions, proposed system, differences, risks, open items.

**Quality Gate** for Steps 10-13.

### Step 14: Business Rules Export (MANDATORY)

DMN XML, JSON, CSV, Gherkin — four formats per domain.

**Quality Gate.**

### Step 15: OpenAPI + AsyncAPI Specs (MANDATORY)

Per-domain specs + cross-domain integration specs in `_integration/`.

**Quality Gate.**

### Step 16: Phase 2 Verification

Verify all deliverables exist with meaningful content.

### Step 17: Regenerate Deliverables

Regenerate dashboard, diagrams, and graph to capture Phase 2 additions.

### Step 18: Final Summary Report

Display the summary, then run the coverage matrix.

```
Pipeline Complete (Phase 1 + Phase 2)
======================================
Phase 1: Discovery
  Files processed:    47
  Facts extracted:    312
  Entities:           89
  Relationships:      134
  Contradictions:     4
  Open questions:     12

Phase 2: Design
  Business rules:     142 (52 HARD, 63 SOFT, 27 QUESTIONABLE)
  DDD specs:          5 domains
  Rules exports:      DMN, JSON, CSV, Gherkin
  API specs:          OpenAPI + AsyncAPI
```

**Verify — Coverage Matrix:**
Run `node ~/.claude/tools/magellan/kg-ops.js verify-coverage --workspace <path>`. The tool traces
each source document through facts to entities and returns a coverage table.

Display a coverage table:

```
Source Coverage
===============
  Source Document              Facts  Entities  Domain
  Q3_ops_runbook.pdf           12     8         billing
  CBBLKBOOK.cblle              15     6         billing
  dealer_manual.pdf             3     2         dealer_management
  README.md                     0     0         — (no_facts)
  config.bin                    —     —         — (unreadable)
  ---
  47/52 files contributed to the knowledge graph.
  5 files produced no knowledge (3 no_facts, 2 unreadable).
```

Flag any file with disposition `ingested` but 0 entities referencing it — those
facts were extracted but never built into the graph.

```
Next steps:
  /magellan:research --from-kg   Research external context for modernization
  /magellan:ask <question>       Query the knowledge graph
  /magellan:add <file>           Add more materials
  /magellan                      Check status
```

### Step 19: External Research (Optional)

Offer to run KG-driven external research for Intent Based Modernization.

1. Display: "Run external research based on KG entities? This researches
   customer sentiment, competitor analysis, and integration alternatives
   for entities discovered in the pipeline. [y/N]"
2. If the user accepts, run `/magellan:research --from-kg` (see the
   research command for the full workflow).
3. Research reports are saved to `.magellan/research/` for human review.
   They are NOT auto-ingested into the KG.
4. Display: "Research complete. N reports generated in .magellan/research/.
   Review and selectively ingest with /magellan:add."

---

## Error Handling

Every file must reach a recorded disposition:

| Status | Meaning |
|--------|---------|
| `ingested` | Facts extracted successfully |
| `no_facts` | File read but no extractable facts |
| `unreadable` | File could not be read |
| `extraction_error` | Error during fact extraction |
| `skipped_unchanged` | Content hash matches previous run — no reprocessing needed |
| `skipped_by_rule` | Excluded by project rule |

Rules:
- Never let a file failure stop the pipeline.
- Every failure is logged with the error and filename.
- The final summary includes counts for every disposition.

## Context Window Management

The pipeline is **resumable**:

- `state.json` tracks the last completed pipeline step.
- `processed_files.json` tracks every file's disposition.
- On resume, processed files are skipped automatically.

When context runs low, save progress and tell the user to run `/magellan` again.
