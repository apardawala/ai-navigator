# CLAUDE.md

Refer to `@GEMINI.md` for project overview, commands, architecture, and
principles. This file contains Claude-specific instructions only.

**Always load `@GEMINI.md` first.**

## Model Recommendations

- **`/magellan` full pipeline** — Use Opus. Contradiction detection and
  cross-domain linking require strong reasoning.
- **`/magellan:add` single file** — Sonnet is sufficient for fact extraction.
- **`/magellan:ask` simple lookups** — Sonnet handles factual and overview queries.
- **`/magellan:ask` cross-domain traversals** — Use Opus for multi-hop graph
  walks and complex structural queries.

## Simplicity and Precision

Simplicity is the goal in all Magellan work — skills, schemas, pipeline steps,
and KG structure. Prefer the simplest design that achieves the requirement.
Don't over-classify entities, don't over-tag facts, don't create hierarchies
where a flat list works.

Express pipeline steps and acceptance criteria as verifiable goals, not
imperative instructions. "Every business rule has a corresponding fact with
a source quote" is better than "extract facts from the document."

## Architecture: Skills vs. MCP

- **Skills** (`skills/`) provide expertise — the "how." Lazy-loaded when
  relevant. Cost: ~100 tokens metadata at startup, full body on invocation.
- **MCP server** provides capabilities — the "what." Tools for reading/writing
  KG data, running queries, generating dashboards. Eagerly loaded.

Prefer encoding domain expertise as skills, not MCP tool descriptions.

## Skill Authoring Standards

When writing or modifying Magellan skills:

- **SKILL.md under 500 lines.** Use it for navigation and procedures. Move
  bulky content to `references/`.
- **Flat subdirectories, one level deep.** `references/schema.md`, never
  `references/schemas/v2/output.md`.
- **Negative triggers in descriptions.** Say what the skill is NOT for.
- **Write for LLMs, not humans.** Step-by-step numbering, decision trees,
  third-person imperative.
- **Scripts for fragile operations.** Bundle tested scripts in `scripts/`
  with descriptive error messages.
- **Just-in-time references.** Don't inline large schemas — point to them.

## Skill Validation (after any skill change)

1. **Discovery**: Read frontmatter. Generate 3 prompts that SHOULD trigger
   it and 3 that SHOULD NOT. Tighten if any misfire.
2. **Logic**: Walk through every instruction as if executing autonomously.
   Flag ambiguous points.
3. **Edge cases**: Identify 3-5 failure states. Verify handling.
4. **Architecture**: Confirm under 500 lines, flat subdirs, negative triggers.

## Pipeline Review: Fix-First

- **AUTO-FIX**: Obvious fixes (missing field, wrong count, format error) —
  fix immediately.
- **ASK**: Judgment calls — batch into one question.

## Context Management

Load only the relevant skill for each pipeline step — not all skills at once.

- Ingestion step → read `skills/ingestion/SKILL.md` only
- Graph building → read `skills/graph-building/SKILL.md` only
- Pipeline review → read `skills/pipeline-review/SKILL.md` only

Always read `skills/file-conventions/SKILL.md` alongside any write operation.

## Tool Conventions

### Content-Addressed IDs
- Fact: `f_<hash>` from subject + predicate + object
- Contradiction: `c_<hash>` from quote1 + quote2
- Question: `oq_<hash>` from domain + question text

Duplicate writes are silently skipped. Do not retry.

### `_cross_domain` Special Domain
Use `--domain _cross_domain` with `add-contradiction` for cross-domain issues.

### Repair Commands
`verify-ledger` and `verify-edges` errors include `suggested_repair` fields
with exact commands to run.

### Activity Log
Every action logged via `kg-ops.js log --action <type> --detail "..."`.

### Summary and Graph
Before committing: `kg-ops.js summary` and `kg-ops.js graph`.

## Runtime Principles

When Magellan runs on a target project, it follows `skills/_principles.md`.
**Dual-file rule:** Changes to behavioral instructions here must also be
reflected in `_principles.md` if they apply at runtime.

## Output Location

All outputs go in `<workspace>/.magellan/`. See file-conventions skill for
the complete directory layout and JSON schemas.
