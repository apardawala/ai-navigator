---
name: onboarding-guide
description: Generate a beginner-friendly narrative document that explains everything discovered about the client's systems. Use after domain summarization to produce onboarding_guide.md. Called by the pipeline — don't invoke directly.
user-invocable: false
---

# Onboarding Guide Generation

You produce `onboarding_guide.md` — a document that a new architect reads on their
first day to understand the client's business and systems. It is written for someone
who knows nothing about the client.

This document auto-regenerates every time the pipeline runs. It is derived from the
domain summaries, open questions, and contradictions — not from the raw entity files.

## When to Generate

- After Stage 2c (domain summarization) in a full pipeline run
- On demand when an architect requests it
- After significant new material is ingested (determined by the orchestrator)

## Process

1. Discover all domains using Glob on `.magellan/domains/*/` (each subdirectory name
   is a domain).
2. Read each domain's summary using the Read tool on
   `.magellan/domains/<domain>/summary.json`.
3. Read open questions and contradictions for each domain using the Read tool on
   `.magellan/domains/<domain>/open_questions.json` and
   `.magellan/domains/<domain>/contradictions.json`. To get consolidated data across
   all domains, read each domain's files and aggregate.
4. Read `.magellan/index.json` using the Read tool for overall stats.
5. Read `.magellan/cross_domain.json` using the Read tool for inter-domain connections.
6. Read the project's Claude Code configuration for Section 7 (Contributing):
   - `CLAUDE.md` (project root) — working principles
   - `.claude/settings.json` — provider, plugins, MCP servers (if exists)
   - `.claude/rules/` — any project rules files (if exists)
   If none exist, note that no project-specific config was found.
7. Synthesize the guide following the structure below.
8. Write the guide in two formats:
   a. `.magellan/onboarding_guide.md` — Markdown for agents and LLM consumption.
   b. `.magellan/onboarding_guide.html` — Interactive single-page HTML for humans.
      The HTML version should include:
      - Scroll-based modules matching the markdown sections
      - The same content as the markdown, rendered with clean typography
      - Animated or interactive diagrams for system relationships and domain
        connections (use vis.js for an interactive knowledge graph view if
        cross_domain.json has data, otherwise use simple CSS/SVG diagrams)
      - Collapsible sections for domains, gotchas, and open questions
      - A coverage summary table with visual indicators (progress bars or
        color coding for thin/strong coverage)
      - Inline entity cross-references as clickable anchors
      - Self-contained — no external dependencies (inline all CSS/JS)
      Use the Write tool for both files.

## Guide Structure

Write the guide in Markdown with these sections:

### 1. The Business

What does this company do? Who are their customers? What industry are they in?
What are their core operations?

Derive this from the domain summaries and entity types. If the KG contains a
Statement of Work, SOW, or project description, reference it. Otherwise, infer
from the systems and business rules discovered.

Write 2-3 paragraphs. Use plain language, no jargon.

### 2. The Systems

What software runs the business? Give a high-level map of the technology landscape:
- What are the main systems (AS/400, web apps, APIs, databases)?
- How do they connect?
- What technology stack is each system built on?

Explain this as a narrative, not a list. "When a vehicle arrives at the auction,
here's what happens in the system..." Walk through a key business flow to make
the technology concrete.

Derive from domain summaries and cross-domain connections.

### 3. The Domains

For each domain in the KG, write a section with:
- What this domain is responsible for
- The most important entities (from hub summaries)
- Key business rules
- How this domain connects to other domains

When mentioning a hub entity, include its entity ID as a cross-reference so
readers can look it up in the KG (e.g., "the Invoice Generation process
(`billing:invoice_generation`) handles...").

Start each domain section with a metrics line:

```markdown
#### Billing (23 entities, 5 hubs, 3 open questions, 1 contradiction)
```

Order domains by importance (most hub entities, most cross-domain connections first).

### 4. The Gotchas

Things that would take weeks to discover by reading source materials directly:
- Undocumented behaviors found in code that aren't in any manual
- Workarounds or hacks that are still in production
- Contested facts (from contradictions) — where sources disagree
- Systems or processes that behave differently than documented

These are the facts that an architect needs to know but wouldn't find in an
architecture diagram.

Link each gotcha to the specific contradiction or open question by ID so it's
traceable:

```markdown
- **Invoice threshold mismatch**: The MANUAL_REVIEW threshold is $10,000 in the
  ops runbook but $5,000 in the database config. Both are in production.
  (See contradiction `c_001`, directed to senior_developer)
```

### 5. Open Questions

What we still don't know, organized by domain and priority:
- Critical questions that block understanding of core processes
- High-priority questions needed for design decisions
- Medium/low questions for completeness

For each question, note who should be asked (the `directed_to` field).

### 6. Coverage Summary

A brief summary of what has been ingested and what hasn't:
- Total documents ingested
- Total entities, relationships, contradictions, open questions
- Domains covered and their entity counts
- Which source documents contributed to each domain's knowledge
- Any known gaps — domains with thin coverage (fewer than 5 entities),
  directories that haven't been ingested, file types that failed

Highlight domains with thin coverage so the team knows where to focus
next:

```markdown
| Domain | Entities | Sources | Coverage |
|--------|----------|---------|----------|
| billing | 23 | 8 documents | Strong |
| title | 18 | 6 documents | Strong |
| transportation | 4 | 2 documents | **Thin — needs more source materials** |
```

### 7. Contributing to the Knowledge Graph

This section helps new team members set up their environment and start
contributing to the project's central knowledge graph.

#### 7a. Setup

Provide step-by-step instructions to get a new contributor running:

1. **Install Claude Code** — Link to the official install guide
   (https://code.claude.com/docs/en/quickstart). Note the project's
   preferred provider if known (check the project's `.claude/settings.json`
   for `apiProvider`).
2. **Install Magellan** — Run `/plugin install ai-navigator` or follow the
   project's README if a custom install method is documented.
3. **Project configuration** — If the project has a `.claude/settings.json`,
   `CLAUDE.md`, or `.claude/rules/` files, mention them and summarize what
   they configure (don't reproduce them — just say "the project has custom
   rules for X, Y, Z").

Read the project's Claude Code configuration files if they exist. If they
don't exist, write generic setup instructions and note that no project-specific
config was found.

#### 7b. Key Commands

List the Magellan commands a new contributor needs, with one-line descriptions
and a concrete example for each:

- `/magellan` — Run the full pipeline or check status
- `/magellan:add <path>` — Add a document or directory to the KG
- `/magellan:add --codebase <path>` — Analyze a codebase
- `/magellan:add --correction "..."` — Record a verbal correction from a stakeholder
- `/magellan:add --resolve <id> "..."` — Resolve a contradiction or answer an open question
- `/magellan:ask <question>` — Query the knowledge graph

Tailor the examples to this project's actual domains. If the KG has a billing
domain, the example should be about billing, not a generic placeholder.

#### 7c. Conventions

Summarize the project's working principles that affect how contributors
interact with the KG. Derive from the project's `CLAUDE.md` and
`skills/_principles.md`:

- How facts should be sourced (every fact traces to a document)
- How contradictions are handled (they're features, not bugs)
- What gets flagged vs. silently skipped (nothing is silently skipped)
- Any project-specific conventions (naming, domain boundaries, etc.)

Keep this to 3-5 bullet points. Don't reproduce the full CLAUDE.md.

#### 7d. First Tasks

Auto-generate 2-3 safe, low-risk tasks for a new contributor. Frame these
as KG contributions, not just learning exercises. Each task should:

- **Add coverage**: resolve an open question, add a thin domain's documents,
  or clarify a contradiction
- **Be low-risk**: read/investigate only, not restructure
- **Build domain expertise**: focused on one area of the KG

Derive suggestions from:
- Open questions tagged for developers that could be resolved by reading
  one specific document or code module
- Domains with thin coverage that need more source material reviewed
- Simple contradictions that could be resolved by reading one more document

Example:

```markdown
#### First Tasks

1. **Review CBBLKBOOK module** — The billing domain has an open question about
   the invoice threshold (see `oq_003`). Reading the CBBLKBOOK COBOL source
   will clarify whether the $10k or $5k threshold is active. Run
   `/magellan:add --resolve oq_003 "Threshold is $5,000 per CBBLKBOOK line 42"`
   once you find the answer.

2. **Add transportation documents** — The transportation domain has only 4
   entities from 2 source documents. Grab the dispatch manual from the shared
   drive and run `/magellan:add dispatch_manual.pdf`. This will trigger
   extraction and improve coverage.

3. **Verify title transfer timing** — Contradiction `c_004` notes a conflict
   between immediate and batch title transfers. Read Title_Process_Manual.pdf
   section 4.1 and run `/magellan:add --resolve c_004 "Transfers are batched
   nightly per section 4.1"`.
```

### 8. Discovered Materials

If `discovered_links.json` files exist in domain directories, include a section
showing what the pipeline found and what still needs to be collected.

Read `discovered_links.json` for each domain and aggregate by terminal status:

```markdown
## Discovered Materials

During ingestion, the pipeline discovered 47 links across all documents.

| Status | Count | Action Needed |
|--------|------:|---------------|
| Ingested automatically | 12 | None — already in the KG |
| Skipped by rule | 18 | None — matched project skip rules |
| Auth required | 5 | Download manually and add via `/magellan:add` |
| Tool unavailable | 3 | Install required tools (see below) |
| Manual collection needed | 4 | Ask client team for these documents |
| Fetch failed | 1 | Retry or download manually |
| Dead links | 2 | No action — links are broken |
| Already ingested | 2 | None — already processed |

### Materials to Collect

These references were found in source documents but couldn't be fetched
automatically. Prioritized by how many source documents reference them:

1. **Dealer Master Manual, section 3.2** — referenced by 3 documents
   (Q3_ops_runbook.pdf, Architecture_Overview.pdf, billing_procedures.docx).
   Status: manual_collection. Ask the client team for a copy.

2. **company.sharepoint.com/sites/arch/designs.pdf** — referenced by 2 documents.
   Status: auth_required. Requires VPN + SSO. Download and add via `/magellan:add`.

### Configure These Tools

The following link types couldn't be resolved because the tool isn't configured:

- **GitHub**: 3 links found. Install and configure `gh` CLI.
```

If no `discovered_links.json` files exist, omit this section entirely.

## Writing Style

- Write for a reader who is new to this client's systems
- Use plain language — explain acronyms on first use
- Be specific — "the AS/400 runs a nightly batch job that reconciles settlements"
  not "there is a batch process"
- Be honest about uncertainty — if confidence is low, say so
- Put the most important information first in each section
- Keep it under 3000 words total — this is a briefing, not a book

## What You Do NOT Do

- Do not copy entity JSON into the guide. Translate everything to natural language.
- Do not list every entity. Focus on hubs and key facts.
- Do not hide contradictions or open questions. They are features, not bugs.
- Do not invent information beyond what the KG contains.
