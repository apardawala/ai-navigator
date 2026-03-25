---
description: Add materials or corrections to the Magellan knowledge graph. Don't use for querying — use /magellan:ask instead.
argument-hint: <path> or --codebase <path> or --correction "..." or --resolve <id> "..."
---

# Add Materials

Add a file, directory, correction, or resolution to the knowledge graph.

## Usage

```
/magellan:add <path>                        Add a file or directory
/magellan:add --codebase <path>             Analyze a codebase (structure + facts)
/magellan:add --correction "..."            Record a verbal correction
/magellan:add --resolve <id> "..."          Resolve a contradiction or answer a question
```

## Pre-Flight Check

Verify `.magellan/` exists. If not, initialize the workspace:
1. `mkdir -p .magellan/domains .magellan/diagrams .magellan/language_guides`
2. Write `.magellan/state.json` with `{"initialized_at": "<ISO timestamp>"}`.
3. Copy starter language guides from skills directory if available.

## Adding Files

When a file path is provided:

1. Read the file with the Read tool.
2. If it's a code file, check `.magellan/language_guides/` for a matching language
   guide. Read the guide for context before extracting facts.
3. Verify the target domain is registered in `.magellan/domains.json`. If not,
   register it: `node ~/.claude/tools/magellan/kg-write.js add-domain --workspace <path> --domain <name>`.
4. Apply the ingestion skill to extract atomic facts.
5. Write each fact using `~/.claude/tools/magellan/kg-write.js add-fact` with the appropriate
   arguments. The tool handles JSON serialization and schema validation.
6. Update `.magellan/processed_files.json` with the file's disposition.
7. Report: facts extracted, domain, any issues.

When a directory path is provided:

1. List all files using Glob.
2. Read `.magellan/processed_files.json` to find already-processed files.
3. Skip unchanged files. Display: "Processing N new files (M skipped)."
4. Process each file using the single-file workflow above.
5. Update processed_files.json after each file.
6. Report: total processed, facts per file, skipped count.

## Adding a Codebase

When `--codebase <path>` is provided:

1. Create `.magellan/codebase/` directory if it doesn't exist:
   ```
   mkdir -p .magellan/codebase
   ```
2. Apply the **codebase-analysis skill** which runs 5 phases:
   - **Phase 1: Tech Stack Discovery** — scan manifests, identify languages,
     frameworks, dependencies. Produces `STACK.md`.
   - **Phase 2: Architecture Analysis** — identify patterns, boundaries,
     data flow. Produces `ARCHITECTURE.md`.
   - **Phase 3: Code File Analysis** — for each code file, extract structural
     facts (dependencies, interfaces, integration points, semantic role)
     alongside business facts (via ingestion skill).
   - **Phase 4: Cross-Cutting Analysis** — conventions, integrations summary,
     concerns. Produces `CONVENTIONS.md`, `INTEGRATIONS.md`, `CONCERNS.md`.
   - **Phase 5: Representation Inventory** — field name mappings, unit
     conventions, schema divergences.
3. Update `.magellan/processed_files.json` for each file processed.
4. Code entities go into the `_codebase` domain (or relevant business domain
   if the code clearly maps to one).
5. Report:
   ```
   Codebase Analysis Complete
   ==========================
   Files analyzed:    142
   Tech stack:        TypeScript, Python, Docker
   Components:        12
   Integrations:      5 (Stripe, Auth0, PostgreSQL, Redis, S3)
   Concerns:          3 (see .magellan/codebase/CONCERNS.md)

   Analysis documents:
     .magellan/codebase/STACK.md
     .magellan/codebase/ARCHITECTURE.md
     .magellan/codebase/CONVENTIONS.md
     .magellan/codebase/INTEGRATIONS.md
     .magellan/codebase/CONCERNS.md

   Run /magellan to build the full knowledge graph including code entities.
   ```

Note: `--codebase` extracts both structural understanding (via codebase-analysis
skill) AND business facts (via ingestion skill) from each code file. The two
extraction lenses run on the same file — structural analysis identifies HOW
the code is organized, ingestion identifies WHAT business rules it implements.

## Adding Corrections

When `--correction` is provided with a quoted string:

1. Create a correction fact:
   - Parse the text to identify the subject and claim
   - Set `source.document` to `_corrections/<timestamp>.json`
   - Set `source.location` to "verbal correction"
   - Set `source.quote` to the exact text provided
   - Set `confidence` to 0.95
   - Set tags to `["correction"]`

2. Write to `.magellan/domains/<domain>/facts/_corrections/<timestamp>.json`.

3. Report what was recorded. The graph builder will detect contradictions
   on the next pipeline run.

## Resolving Contradictions and Answering Questions

When `--resolve <id>` is provided with a resolution note:

The `<id>` can be a contradiction ID (e.g., `c_001`) or a question ID (e.g., `oq_001`).

**For contradictions (c_xxx):**

1. Search for the contradiction across all domains:
   - Use Glob to find `domains/*/contradictions.json`.
   - Read each file and find the entry matching the ID in the `active` array.
2. Move the contradiction from `active` to `resolved`:
   - Remove it from the `active` array.
   - Add `resolution_note` (the quoted text), `resolved_at` (current ISO timestamp),
     and set `status` to `"resolved"`.
   - Append it to the `resolved` array in the same file.
3. Write the updated file back.
4. **Feed resolution back into the KG.** For each entity in `related_entities`:
   a. Read the entity file.
   b. Add a new evidence entry with the resolution:
      - `source`: `"contradiction_resolution"`
      - `location`: the contradiction ID (e.g., `"c_001"`)
      - `quote`: the resolution note text
      - `confidence`: 0.95 (correction-level weight)
   c. Update the entity `summary` to reflect the resolved fact. The summary
      should state the resolved value, not the conflicting values.
   d. Remove the `contested: true` flag if no other active contradictions
      reference the entity.
   e. Write the entity file back.
5. Display:
   ```
   Resolved: c_001 (billing)
   Resolution: "Confirmed with John Smith: threshold changed to $15k in Q4"
   Entities updated: billing:manual_review_bypass (evidence added, summary updated)
   ```

**For open questions (oq_xxx):**

1. Search across all domains:
   - Use Glob to find `domains/*/open_questions.json`.
   - Read each file and find the matching entry in the `active` array.
2. Move from `active` to `resolved`:
   - Remove from `active`.
   - Add `answer_source` (the quoted text), `answered_at` (current ISO timestamp),
     and set `status` to `"answered"`.
   - Append to the `resolved` array.
3. Write the updated file back.
4. **Feed answer back into the KG.** If the question has `related_entities`:
   a. Read each entity file.
   b. Add a new evidence entry with the answer:
      - `source`: `"question_answered"`
      - `location`: the question ID (e.g., `"oq_003"`)
      - `quote`: the answer text
      - `confidence`: 0.95 (correction-level weight)
   c. Update the entity `summary` if the answer changes key facts.
   d. Remove the question ID from the entity's `open_questions` array.
   e. Write the entity file back.
5. Display:
   ```
   Answered: oq_003 (billing)
   Answer: "The $10k threshold is still active per Jane Doe (Finance)"
   Entities updated: billing:manual_review_bypass (evidence added)
   ```

**If the ID is not found** in any domain, display:
```
Not found: <id>. Use /magellan:ask to list active contradictions and questions.
```

## Notes

- Every fact traces to a source document. Corrections create a record document.
- Follow the fact schema in file-conventions exactly.
- For large files, extract facts in batches of 10-15 to stay within output limits.
- Resolving a contradiction creates an audit trail — the dashboard shows both
  active and resolved items.
