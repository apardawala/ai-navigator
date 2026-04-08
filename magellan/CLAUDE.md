# CLAUDE.md

Magellan is an enterprise knowledge discovery plugin. It extracts structured
knowledge from collected materials and builds a queryable knowledge graph.

## Commands

- `/magellan` — Run the discovery pipeline or show status
- `/magellan:add <path>` — Add a file or directory
- `/magellan:add --codebase <path>` — Analyze a codebase (structure + business facts)
- `/magellan:add --correction "..."` — Record a verbal correction
- `/magellan:add --resolve <id> "..."` — Resolve a contradiction or answer an open question
- `/magellan:ask <question>` — Query the knowledge graph
- `/magellan:work "description"` — Structured SDLC workflow (analyze → discuss → plan → estimate → execute → verify → audit)
- `/magellan:research <topic>` — Research external context (customer sentiment, competitors, alternatives)
- `/magellan:research --from-kg` — Auto-generate research topics from the knowledge graph

## Model Recommendations

- **`/magellan` full pipeline** — Use Opus. Contradiction detection and
  cross-domain linking require strong reasoning.
- **`/magellan:add` single file** — Sonnet is sufficient for fact extraction.
- **`/magellan:ask` simple lookups** — Sonnet handles factual and overview queries.
- **`/magellan:ask` cross-domain traversals** — Use Opus for multi-hop graph
  walks and complex structural queries.

## Four Principles

1. Every fact traces to a source document. Nothing is invented.
2. Contradictions and open questions are the primary output, not a side effect.
3. Nothing is silently skipped. Every file gets a recorded disposition.
4. The model does the heavy lifting. Humans steer and correct.

## Simplicity and Precision

Simplicity is the goal in all Magellan work — skills, schemas, pipeline steps,
and KG structure. Prefer the simplest design that achieves the requirement.
Don't over-classify entities, don't over-tag facts, don't create hierarchies
where a flat list works.

Express pipeline steps and acceptance criteria as verifiable goals, not
imperative instructions. "Every business rule has a corresponding fact with
a source quote" is better than "extract facts from the document."

## Architecture: Skills vs. MCP

Magellan has two complementary extension types:
- **Skills** (`skills/`) provide expertise — the "how." Reusable instruction
  sets that are lazy-loaded when relevant. Cost: ~100 tokens metadata at
  startup, full body only on invocation.
- **MCP server** (`mcp-server/`) provides capabilities — the "what." Tools
  for reading/writing KG data, running queries, generating dashboards. Cost:
  tool metadata loaded eagerly into every message.

Prefer encoding domain expertise as skills, not MCP tool descriptions.
Skills are cheaper (lazy-loaded) and richer (can reference additional files).

## Skill Authoring Standards

When writing or modifying Magellan skills:

- **SKILL.md under 500 lines.** It's the brain, not the encyclopedia. Use it
  for navigation and high-level procedures. Move bulky content to `references/`.
- **Flat subdirectories, one level deep.** `references/schema.md`, never
  `references/schemas/v2/output.md`. Agents can't navigate deep hierarchies.
- **Negative triggers in descriptions.** Say what the skill is NOT for:
  "Don't use for querying — use the querying skill instead."
- **Write for LLMs, not humans.** Step-by-step numbering, decision trees,
  third-person imperative ("Extract the text" not "I will extract").
  Concrete templates in `assets/` rather than lengthy descriptions.
- **Scripts for fragile operations.** Bundle tested scripts in `scripts/`
  with highly descriptive error messages on stdout so the agent can
  self-correct.
- **Just-in-time references.** Don't inline large schemas — point to them:
  "See `references/entity-schema.md` for the full schema."

(Source: mgechev/skills-best-practices)

## Skill Validation (after any skill change)

After creating or modifying a skill, run these four checks:

1. **Discovery**: Read the skill's frontmatter description. Generate 3
   prompts that SHOULD trigger it and 3 that SHOULD NOT. If any misfire,
   tighten the description. Ensure negative triggers are present.

2. **Logic**: Walk through every instruction in SKILL.md as if executing
   it autonomously. Flag any point where the instructions are ambiguous
   enough to force guessing — these are execution blockers.

3. **Edge cases**: Identify 3-5 failure states (empty input, malformed
   input, very large input, missing referenced files). Verify the skill
   handles or explicitly rejects each.

4. **Architecture**: Confirm SKILL.md is under 500 lines, subdirectories
   are flat (one level), bulky content lives in references/, and the
   description includes negative triggers.

## Pipeline Review: Fix-First

When the pipeline-review skill finds issues, classify each as:
- **AUTO-FIX**: Obvious fixes (missing field, wrong count, format error) —
  fix immediately without asking.
- **ASK**: Judgment calls (should this be a separate entity? is this really
  a contradiction?) — batch into one question.

## Key Skills

- `skills/file-conventions/` — JSON schemas for all KG file types. Read this
  before writing any file to `.magellan/`.
- `skills/ingestion/` — Fact extraction rules and language guides for legacy code.
- `skills/codebase-analysis/` — Structural analysis for live codebases (tech stack,
  architecture, conventions, integrations, concerns).
- `skills/pipeline-review/` — Quality gate criteria. Run after every pipeline step.

## Context Management

When working on Magellan pipeline steps, load only the relevant skill for that
step — not all skills at once. The "curse of instructions" degrades quality when
too many requirements compete for attention.

- Ingestion step → read `skills/ingestion/SKILL.md` only
- Graph building → read `skills/graph-building/SKILL.md` only
- Pipeline review → read `skills/pipeline-review/SKILL.md` only

Always read `skills/file-conventions/SKILL.md` alongside any write operation.

When authoring skills and commands, structure prompts for cache efficiency:
static content (instructions, schemas, principles) at the start; variable
content (user query, entity names, file paths) at the end. Prompt Caching
only matches shared prefixes — a different first token invalidates the cache.

## Runtime Principles

When Magellan runs on a target project (not when developing Magellan itself),
it follows the operating principles in `skills/_principles.md`. These govern
output quality, contradiction handling, and decision-making during pipeline runs.
The main command loads this file at the start of every run.

**Dual-file rule:** When adding or changing any principle, rule, or behavioral
instruction in this CLAUDE.md, always check whether it also applies at runtime.
If it does, copy or adapt it into `skills/_principles.md` as well. The two files
serve different audiences (developers vs. runtime agents) but must stay in sync
on shared rules.

## Output Location

All outputs go in `<workspace>/.magellan/`. See the file-conventions skill for
the complete directory layout and JSON schemas.

## Tool Conventions

### Content-Addressed IDs
Facts, contradictions, and questions all use content-addressed IDs (SHA-256 prefix).
The tools generate these automatically — do not invent IDs manually.
- Fact: `f_<hash>` derived from subject + predicate + object
- Contradiction: `c_<hash>` derived from quote1 + quote2
- Question: `oq_<hash>` derived from domain + question text

Duplicate writes are silently skipped with a "Skipped: already exists" message.
This is correct behaviour — do not retry.

### `_cross_domain` Special Domain
Use `--domain _cross_domain` with `add-contradiction` to write cross-domain
contradictions to `.magellan/cross_domain_contradictions.json`. This mirrors
the `_cross_domain` convention already used by `add-edge`.

### Repair Commands
When `verify-ledger` or `verify-edges` report issues, each error includes a
`suggested_repair` field with the exact command to run. Available repair tools:
- `kg-ops.js remove-processed --workspace <path> --file <file>` — remove stale ledger entry
- `kg-write.js remove-edge --workspace <path> --domain <d> --from <id> --to <id> --type <t>` — remove dangling edge

### Cross-Domain Contradiction Detection
Run `kg-ops.js detect-cross-contradictions --workspace <path>` after any pipeline
run that adds SAME_AS edges. Reviews property mismatches and type conflicts between
linked entities, and surfaces same-named entities with no SAME_AS edge yet.

### Forced Re-ingestion
If a file was edited and reverted (same hash, but facts may have drifted), use
`kg-ops.js hash-check --workspace <path> --force` to re-queue it under `forced`
instead of `unchanged`.
