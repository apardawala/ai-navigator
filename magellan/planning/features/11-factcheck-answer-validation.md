# F11: Factcheck + Answer Validation

**Epic:** [Quality & Code Hygiene](../epics/04-quality-code-hygiene.md)
**Inspired by:** OMC (factcheck hook), RAGAS scoring framework
**Priority:** 4 (Core KG Enhancement)
**Status:** Implemented (Part A — answer validation. Part B deferred to F07)

## Problem

Magellan has exhaustive quote verification during ingestion (every extracted
fact is checked against source text). But beyond the pipeline:
- `/magellan:ask` answers aren't validated for grounding or relevance
- Execution-phase LLM outputs aren't checked against the knowledge graph
- Low-confidence answers look the same as high-confidence ones
- There's no way to distinguish retrieval failures from synthesis failures

## Proposed Solution

A unified validation layer that factchecks all Magellan outputs against the
knowledge graph, with confidence scoring for `/magellan:ask` answers.

### Part A: Answer Validation (`/magellan:ask`)

1. **Faithfulness check (35% weight)**: Is every claim in the answer
   traceable to a specific fact in the KG? Flag any claim that doesn't
   trace to a source — this directly enforces Principle #1.

2. **Answer relevance (35% weight)**: Does the answer address the user's
   actual question? Detect drift where the retrieval pulled related-but-wrong
   entities.

3. **Context precision (30% weight)**: Were the right entities/facts
   retrieved? Measure whether the retrieval step pulled the most relevant
   entities or got distracted by surface-level keyword matches.

4. **Quality gate**: Composite score (0.0-1.0).
   - Score >= 0.7: Present the answer with confidence level.
   - Score 0.4-0.7: Present with explicit caveats and list what's uncertain.
   - Score < 0.4: Respond with "insufficient evidence" and list KG gaps.

5. **Query enhancement**: Break complex questions into sub-queries with
   intent classification, route to appropriate KG data sources, execute
   in parallel.

### Part B: Execution Factchecking

6. **Claim extraction**: Identify factual claims in LLM outputs during
   execution phases (code comments, plan descriptions, architectural
   decisions).

7. **KG lookup**: Check claims against relevant entities, facts, and
   business rules.

8. **Contradiction flagging**: Surface mismatches with severity levels
   and source references.

9. **Cross-cutting concern detection**: Verify that security constraints,
   compliance requirements, and authorization rules from the KG are
   preserved in generated outputs.

10. **Selective triggering**: Focus on business logic, architectural claims,
    and integration assumptions — not every tool use.

### Diagnostics

11. **Waste ratio**: Measure how much loaded content actually contributed
    to an answer. Waste ratio 70%+ signals retrieval is too broad.

12. **Retrieval trajectory logging**: For every answer, log which domains
    were scanned, which entities loaded, which facts used, and which
    content was not used. Makes retrieval observable and debuggable.

13. **Failure classification**: Distinguish retrieval miss, retrieval
    mismatch, synthesis error, and temporal conflict — not just
    "hallucination."

## Magellan-Specific Advantage

Unlike generic RAG validation which checks against unstructured text chunks,
Magellan validates against structured KG entities with source-traced facts.
Faithfulness checking becomes deterministic: does this claim map to a fact
with a source quote? Yes/no.

## Open Questions

- Should validation run on every `/magellan:ask` or only complex queries?
- How to balance validation thoroughness with response latency?
- Should validation scores be visible to the user?
- What triggers execution factchecking (every tool use, only code writes)?

## Acceptance Criteria

- [ ] `/magellan:ask` answers scored on faithfulness, relevance, precision
- [ ] Answers below threshold show caveats or "insufficient evidence"
- [ ] Execution-phase LLM claims checked against KG
- [ ] Contradictions flagged with severity and source references
- [ ] Retrieval trajectory logged for debugging
