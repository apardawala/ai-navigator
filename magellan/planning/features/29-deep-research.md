# F29: Deep Research with Source Attribution

**Epic:** [Knowledge & Learning](../epics/06-knowledge-learning.md)
**Inspired by:** ECC deep-research skill (multi-source web research with citations)
**Priority:** 6 (Knowledge & Learning)
**Status:** Implemented

## Problem

Magellan ingests documents that users explicitly provide. But during
onboarding and planning, engineers often need to research external context --
API documentation, framework best practices, vendor specs, industry standards
-- that isn't in the collected materials. Currently this requires leaving
Magellan to do manual research.

## Proposed Solution

Add a `/magellan:research <topic>` command that performs multi-source web
research and produces a cited report that can optionally feed into the
knowledge graph.

### Key Components

1. **Multi-source search**: Query multiple sources in parallel (web search,
   documentation sites, npm/PyPI registries, GitHub).
2. **Sub-question decomposition**: Break the research topic into 3-5
   sub-questions for targeted search.
3. **Source attribution**: Every finding cites its source URL with access
   date. No unsourced claims.
4. **Report generation**: Synthesize findings into a structured report
   with sections, citations, and confidence levels.
5. **KG integration**: Optionally ingest research findings into the
   knowledge graph as a new source domain, maintaining source tracing.

## Reference Implementation

- ECC `skills/deep-research/` -- firecrawl and exa MCPs, 3-5 sub-questions,
  15-30 unique sources, cited reports
- ECC `skills/search-first/` -- research-before-coding decision matrix

## Magellan-Specific Advantage

Research findings can feed directly into the knowledge graph with full source
tracing -- maintaining Magellan's principle that "every fact traces to a source
document." External web sources become first-class sources alongside internal
documents.

### Retrieval Patterns (from Agentic RAG research)

6. **Query decomposition for research**: Break research topics into sub-queries
   with intent classification (definition, comparison, implementation, pitfall).
   Route each sub-query to the most appropriate source type. (Source: "Building
   Production-Grade Agentic RAG" Part 2)
7. **HyDE for vocabulary bridging**: When researching across domains where
   terminology differs (e.g., user says "dealer portal" but vendor docs say
   "partner management console"), generate a hypothetical answer first, then
   use its embedding to search. Bridges vocabulary mismatch. (Source: Part 2)
8. **Hybrid scoring for research results**: Combine semantic similarity
   (meaning match) with sparse keyword matching (exact term match) when
   ranking research findings. Weight: 60% semantic, 40% keyword.
   (Source: Part 2)

## Open Questions

- Which search backends to support (WebFetch, MCP tools, CLI tools)?
- How to handle source reliability (official docs vs. blog posts)?
- Should research results be ephemeral or permanently added to the KG?
- How to handle research topics that span multiple domains?

## Acceptance Criteria

- [ ] Multi-source parallel research on a given topic
- [ ] Every finding has source attribution
- [ ] Structured report generated with confidence levels
- [ ] Optional ingestion into knowledge graph with source tracing
