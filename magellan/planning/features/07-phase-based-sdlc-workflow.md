# F07: Phase-Based SDLC Workflow (Process Repository)

**Epic:** [Structured Planning & Execution](../epics/03-structured-planning-execution.md)
**Inspired by:** GSD (discuss -> plan -> execute -> verify -> audit lifecycle)
**Priority:** 8 (Capstone)
**Status:** Implemented

## Problem

Magellan stops at knowledge discovery and design generation. Once an engineer
has the onboarding guide, DDD specs, and API contracts, there's no structured
workflow to translate understanding into planned, executed, and verified work.

## Vision

Magellan becomes a portable process repository -- the methodology an engineer
carries from job to job. It's usable at every stage of work but doesn't
execute the whole process for you. The engineer steers; Magellan provides
structure and knowledge-graph context.

## Design Principles

- **Git state is the cold-start context**: No shadow state directories.
  Everything committed to `.magellan/` is the source of truth. Any new
  session (human or AI) can infer where things stand from git.
- **Usable at every stage, not owning every stage**: An engineer should be
  able to invoke any phase independently.
- **Parallelize naturally**: When tasks are independent, Claude should use
  parallel agents. This is an instruction, not a mechanism.
- **Verification includes tests**: When test suites exist, the verify phase
  runs them. When they don't, it falls back to evidence-based checking.

## Proposed Solution

Extend Magellan with a Phase 3: Execution lifecycle that draws on the
knowledge graph.

### Phases

1. **Analyze**: Scan the KG for entities, contradictions, open questions,
   and cross-domain dependencies relevant to the planned work. Surface
   what we know, what we don't know, and what's contested.

2. **Discuss**: Domain-aware gray-area identification, pre-populated with
   graph-derived open questions and contradictions rather than starting
   from scratch.

3. **Plan**: Atomic task plans sized to fit fresh context windows, with
   dependency analysis informed by entity relationships.

4. **Estimate**: Show the projected blast radius -- files affected, entities
   touched, cross-domain dependencies triggered, known risks from
   unresolved contradictions. Include a pre-mortem: "What could go wrong?"
   using KG contradictions as risk factors. User confirms before execution.

5. **Execute**: Task execution with atomic commits per task. When tasks are
   independent, use parallel agents with fresh contexts.

6. **Verify**: Evidence-based verification against acceptance criteria.
   Run unit/integration tests when available. Classify failures:
   TEST_ERROR, CODE_ERROR, ENV_ERROR, SPEC_ERROR. Spawn targeted
   recovery for each type.

7. **Audit**: Milestone-level integration checking.

### Intermediate Artifacts

Each phase produces a reviewable artifact that serves as both a checkpoint
and a handoff document:

| Phase | Artifact | Purpose |
|---|---|---|
| Analyze | `analysis.json` | Relevant KG entities, contradictions, gaps |
| Discuss | `context.md` | Gray areas resolved, decisions captured |
| Plan | `tasks.json` | Atomic task plans with dependencies |
| Estimate | `estimate.md` | Blast radius, risks, cost projection |
| Execute | `summary.md` per task | What was done, atomic commit refs |
| Verify | `verification.md` | Pass/fail per deliverable, error classifications |
| Audit | `audit.md` | Milestone-level integration assessment |

Each artifact is a gate: the user reviews it before the next phase begins.

### Magellan-Specific Advantages

- Planning can reference known contradictions as risks
- Open questions become explicit blockers
- Entity relationships inform dependency ordering
- Business rules from the graph become acceptance criteria
- Phase discussion pre-populates with graph-derived gray areas

## Open Questions

- Should this be a new `/magellan:build` command or extend `/magellan`?
- How tightly should execution be coupled to the knowledge graph?
- Should execution update the knowledge graph (e.g., mark questions resolved)?

## Acceptance Criteria

- [ ] Analyze phase surfaces relevant KG entities, contradictions, and gaps
- [ ] Discuss phase surfaces gray areas informed by knowledge graph
- [ ] Plan phase creates atomic task plans with KG-derived context
- [ ] Estimate phase shows blast radius and risks before execution
- [ ] User confirms after estimate before execution proceeds
- [ ] Execute phase produces atomic commits per task
- [ ] Verify phase validates work including test execution when available
- [ ] Audit phase checks milestone-level integration
- [ ] All artifacts committed to git (no shadow state)
