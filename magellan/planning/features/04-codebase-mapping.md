# F04: Codebase Mapping

**Epic:** [Codebase Understanding](../epics/02-codebase-understanding.md)
**Inspired by:** GSD (4 parallel codebase-mapper agents producing 7 structured documents)
**Priority:** 7 (Core Capability)
**Status:** Implemented (simplified — no SCIP/tree-sitter/VLM/parallel agents)

## Problem

Magellan extracts knowledge from documents but doesn't analyze live codebases.
When onboarding to a project, engineers need to understand the actual code --
its tech stack, architecture, conventions, testing approach, and known concerns
-- not just what the documentation says.

## Proposed Solution

Add a `/magellan:add --codebase <path>` mode that spawns parallel analysis
agents to produce structured codebase understanding documents, which feed into
the knowledge graph as a new domain.

### Key Components

1. **Parallel mapper agents**: Analyze different dimensions simultaneously:
   - Tech stack & dependencies (STACK.md)
   - Architecture & patterns (ARCHITECTURE.md)
   - Code structure & navigation (STRUCTURE.md)
   - Conventions & style (CONVENTIONS.md)
   - Testing approach (TESTING.md)
   - Integrations & external dependencies (INTEGRATIONS.md)
   - Tech debt & concerns (CONCERNS.md)
2. **Dual-view graph representation**: Instead of just producing markdown
   documents, build a structured graph with two complementary views:
   - **Functional view**: What does this code do? Map features,
     capabilities, and behaviors to the code locations that implement
     them. "User authentication" → `src/auth/login.py`, `src/auth/oauth.py`
   - **Structural view**: How is it organized? Map files, classes,
     functions, and their dependencies. `login.py` → imports `oauth.py`
     → depends on `db/users.py`
   The functional view answers "where is feature X implemented?" The
   structural view answers "what breaks if I change file Y?" Together
   they enable both planning and impact analysis.
   (Source: Microsoft RPG-ZeroRepo — Repository Planning Graph)
3. **Knowledge graph integration**: Convert both views to entities and
   relationships in a `_codebase` domain.
4. **Cross-linking**: Link code entities to document-derived entities
   (e.g., function -> specification -> known bug).

## Reference Implementation

- GSD `/gsd:map-codebase` -- 4 parallel `gsd-codebase-mapper` agents, each
  writing directly to `.planning/codebase/`
- OMC `deepinit` -- hierarchical AGENTS.md generation
- Microsoft RPG-ZeroRepo -- RPG-Encoder extracts dual-view (functional +
  structural) graph from existing codebases

### Multi-Layer Relationship Graphs (from FastCode)

4. **Dedicated relationship graphs**: Beyond Magellan's single typed-edge
   relationship model, maintain separate purpose-built graphs for faster
   traversal of specific query types:
   - **Call Graph** — who calls whom (for impact analysis: "what breaks if
     I change this function?")
   - **Dependency Graph** — which modules depend on which (for build/deploy
     ordering and migration planning)
   - **Inheritance Graph** — class hierarchies (for understanding
     polymorphism, overrides, and interface contracts)
   These are queryable independently — a call chain question searches only
   the Call Graph, not the full relationship set. (Source: HKUDS/FastCode)

### Code Parsing Strategy

5. **Dual parsing approach**: Use the right parser for the language:
   - **Modern languages** (Python, Java, TypeScript, Go, C/C++, Rust, C#,
     Ruby, Dart, .NET): Use **SCIP indexers** (scip-typescript, scip-java,
     scip-python, rust-analyzer, scip-clang, scip-dotnet, scip-ruby,
     scip-dart) to produce structural indexes with symbol definitions,
     references, and file dependencies. Store in SQLite for millisecond
     queries. Supplement with **tree-sitter** for on-demand function
     signatures, cyclomatic complexity, and code smells. This is more
     robust than generic AST parsing because SCIP indexers understand
     type resolution, module systems, and cross-file references.
     Use `--json` output, NOT TOON format (the Grep Tax applies).
     Key analysis capabilities from the index:
     - `deps`/`rdeps` → builds the Dependency Graph
     - `refs` → builds the Call Graph
     - `cycles` → surfaces circular dependencies as contradictions
     - `coupling` → identifies integration risk hotspots
     - `complexity` → identifies code complexity hotspots
     Available as MCP server for direct agent integration.
     (Source: butttons/dora — SCIP-to-SQLite indexer with MCP support)
   - **Legacy languages** (RPG ILE, COBOL, PL/I, CICS, NATURAL/ADABAS,
     IDMS, JCL, DDS, CL, Easytrieve, REXX, Assembler/370): Use Magellan's
     existing language guides in `skills/ingestion/language_guides/`. These
     guides ARE the structural understanding for languages without AST
     tooling.
   In both cases, read full file content — no skimming. Magellan's
   Principle #3 applies: nothing is silently skipped.
   - **Experimental: Visual ingestion for positional legacy code**: For
     languages where visual layout carries semantic meaning (RPG ILE with
     fixed columns, COBOL area A/B, DDS positional fields, JCL column
     formatting), consider rendering source as syntax-highlighted images
     at 1-2x compression and passing to a VLM alongside the text. Research
     (CodeOCR, 2026) shows VLMs achieve 8x token compression with equal
     or better code understanding — and visual layout cues (indentation,
     column alignment, color) help the model parse structure that flat text
     obscures. This is additive to text-based ingestion with language
     guides, not a replacement. Use both: text for exhaustive fact
     extraction, image for structural understanding validation.
     (Source: "CodeOCR: On the Effectiveness of VLMs in Code Understanding",
     Shi et al. 2026, arXiv:2602.01785)

### Ingestion Patterns (from Agentic RAG research)

6. **Semantic chunking for code**: Respect function, class, and module
   boundaries instead of token-based splitting. Use AST parsing (modern
   languages) or language guides (legacy) to detect logical units.
   (Source: "Building Production-Grade Agentic RAG" Part 1)
7. **Agentic enrichment at ingestion**: For each code unit, concurrently
   extract:
   - Summary (what does this code do, in one sentence)
   - Semantic role (configuration, business logic, data access, integration,
     infrastructure, test)
   - Entities (functions, classes, APIs, database tables referenced)
   - Cross-references (imports, calls, inherits from)
   This metadata enables filtered retrieval — "show me all data access code
   that references the dealer table." (Source: Part 1)
8. **Contradiction detection between code and docs**: When codebase entities
   are linked to document entities via cross-domain relationships, automatically
   detect mismatches (e.g., doc says "30-day timeout" but code shows 60 days).
   Surface these as contradictions in the KG. (Source: Part 1, semantic
   collapse problem)

### Representation Inventory (from "Spec-driven development" article)

9. **Capture representation choices, not just architecture**: A mature
   codebase's complexity lives in its accumulated representation decisions —
   field names, wire formats, vendor schema mappings, unit conventions
   (basis points vs. decimals), data structures. These are arbitrary but
   binding. Codebase mapping must inventory these:
   - Field name mappings (what does `dlr_stat` actually mean?)
   - Unit conventions (currency in cents or dollars? dates as epoch or ISO?)
   - Schema divergences (internal model vs. vendor API vs. database columns)
   - Historical naming (columns named by someone who understood the domain
     differently three years ago)
   These representation facts feed into governed definitions (F32) and help
   distinguish domain contradictions from representation collisions.
   (Source: "Spec-driven development doesn't work if you're too confused
   to write the spec" — representation management)

## Open Questions

- How to handle very large codebases (monorepos with millions of lines)?
- Should codebase mapping be incremental (detect changes since last run)?
- Which programming languages should get specialized analysis?
- How to reconcile codebase findings with document claims (auto-detect contradictions)?

## Acceptance Criteria

- [ ] `/magellan:add --codebase` produces structured analysis documents
- [ ] Findings are converted to knowledge graph entities
- [ ] Cross-linking between code entities and document entities works
- [ ] Analysis completes within reasonable time for medium codebases (<100k LOC)
