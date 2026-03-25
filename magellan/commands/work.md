---
description: Manage KG-informed work through a structured lifecycle — analyze, discuss, plan, estimate, execute, verify, audit. Use after the discovery pipeline has built the knowledge graph. Don't use for knowledge discovery — use /magellan instead.
disable-model-invocation: true
argument-hint: ["description"] or --status
---

# Work

Structured SDLC workflow that draws on the knowledge graph at every phase.
Each phase produces a reviewable markdown artifact. The user reviews and
approves before the next phase runs.

## Usage

```
/magellan:work "description"    Resume matching work or start new
/magellan:work                  List in-flight work, pick one to resume
/magellan:work --status         Show status of all work items
```

## Pre-Flight Check

Verify `.magellan/index.json` exists and has at least one domain with entities.
If not, display: "No knowledge graph found. Run /magellan first to build the
KG, then use /magellan:work to plan work against it." and stop.

## Routing

1. **No arguments**: List all work items by reading `status.md` in each
   subdirectory of `.magellan/work/`. If no work items exist, display:
   "No work items found. Start one with: /magellan:work \"description\""
   Otherwise display name, current phase, and last updated date. Ask the
   user which to resume.

2. **With description**: Fuzzy-match the description against existing work
   directory names in `.magellan/work/`. If a match is found, resume that
   work item at its current phase. If no match, create a new work item.

3. **`--status`**: Read all `status.md` files and display a summary table.
   No prompting, no resuming — just show status.

## Creating a New Work Item

1. Derive a slug from the description (lowercase, hyphens, no special chars).
2. Create the work directory:
   ```
   mkdir -p .magellan/work/<slug>
   ```
3. Write `.magellan/work/<slug>/status.md`:
   ```markdown
   # <Description>

   Created: <ISO date>
   Current phase: analyze
   Last updated: <ISO date>
   ```
4. Proceed to the Analyze phase.

## Resuming a Work Item

1. Read `.magellan/work/<slug>/status.md` to find the current phase.
2. Read `session_notes` from `.magellan/state.json` for any working context.
3. Display a brief summary:
   ```
   Resuming: <description>
   Current phase: <phase>
   Last updated: <date>
   ```
4. Read the most recent artifact to restore context, then continue from
   the current phase.

---

## Phase 1: Analyze

Surface what the KG knows about this work — relevant entities, active
contradictions, open questions, and cross-domain dependencies.

1. **Identify relevant scope.** Based on the work description, determine
   which domains, entities, and relationships are relevant. Use the
   querying skill's strategy: read domain summaries, identify matching
   entities, trace relationships.

2. **Surface blockers.** Read `contradictions.json` and `open_questions.json`
   for relevant domains. List any active contradictions or open questions
   that affect this work.

3. **Map dependencies.** For relevant entities, read `relationships.json`
   and `cross_domain.json` to identify what this work depends on and what
   depends on it.

4. **Write artifact** to `.magellan/work/<slug>/analysis.md`:
   ```markdown
   # Analysis: <Description>

   ## Relevant Entities
   - billing:payment_gateway — Payment processing service (weight: 0.9)
   - billing:stripe_integration — Current Stripe SDK v3 (weight: 0.85)

   ## Active Contradictions
   - c_012: Timeout discrepancy between docs and code (severity: high)

   ## Open Questions
   - oq_008: Is PCI compliance handled at the gateway or app level?

   ## Dependencies
   - Upstream: billing:invoice_generation → billing:payment_gateway
   - Downstream: billing:payment_gateway → title:settlement_service
   - Cross-domain: billing:payment_gateway SAME_AS infrastructure:stripe_service

   ## Risks
   - Unresolved contradiction c_012 may affect timeout configuration
   - Cross-domain dependency on title:settlement_service
   ```

5. **Update status.md**: Set current phase to `discuss`.
6. **Present to user**: Display the analysis and wait for review.

---

## Phase 2: Discuss

KG-driven readiness check. Present open questions and contradictions that
affect this work and drive the user to resolve or accept each one.

This is the deep interview — but grounded in KG data, not manufactured
ambiguity dimensions.

1. **Read the analysis artifact** from Phase 1.

2. **For each active contradiction** relevant to this work:
   - Present the contradiction with both sources and quotes
   - Ask: "Resolve this, or accept the risk and proceed?"
   - If resolved: run the resolution flow from `/magellan:add --resolve`
     (which feeds back into the KG entities per F32)
   - If accepted: note it as an accepted risk

3. **For each open question** relevant to this work:
   - Present the question with context
   - Ask: "Answer this, or defer?"
   - If answered: run the answer flow from `/magellan:add --resolve`
   - If deferred: note it as a deferred question

4. **Surface gray areas** not captured in the KG:
   - "Based on this work and the KG context, are there assumptions we
     haven't discussed?"
   - Capture any new decisions as context

5. **Write artifact** to `.magellan/work/<slug>/context.md`:
   ```markdown
   # Context: <Description>

   ## Resolved for This Work
   - c_012: Resolved — timeout is 30s per production code (fed back to KG)

   ## Accepted Risks
   - oq_008: Deferred — will validate PCI scope during implementation

   ## Decisions
   - Will use Stripe SDK v4 (migration from v3)
   - Settlement service notification will be async (event-driven)
   ```

6. **Update status.md**: Set current phase to `plan`.
7. **Present to user**: Display context summary and wait for review.

---

## Phase 3: Plan

Create atomic task plans informed by KG entity relationships and
the decisions made in the Discuss phase.

1. **Read analysis and context artifacts.**

2. **Decompose the work** into atomic tasks. Each task should be:
   - Small enough to complete in one session
   - Independently testable
   - Clearly scoped (specific files, specific entities)

3. **Order by dependencies.** Use the KG's entity relationships to
   determine task ordering. Tasks that touch upstream entities come first.
   Independent tasks can be marked as parallelizable.

4. **Derive acceptance criteria** from the KG:
   - Business rules from entity facts become test assertions
   - Integration contracts from entity relationships become interface checks
   - Resolved contradictions become regression tests

5. **Write artifact** to `.magellan/work/<slug>/tasks.md`:
   ```markdown
   # Tasks: <Description>

   ## Task 1: Update Stripe SDK v3 → v4
   Files: src/billing/stripe.ts, src/billing/types.ts
   Entities: billing:stripe_integration
   Depends on: nothing
   Acceptance criteria:
   - SDK upgraded to v4
   - All existing payment tests pass
   - Timeout set to 30s (per resolved c_012)

   ## Task 2: Add async settlement notification
   Files: src/billing/settlement.ts, src/events/
   Entities: billing:payment_gateway, title:settlement_service
   Depends on: Task 1
   Acceptance criteria:
   - Settlement event published on payment completion
   - Title service receives notification (integration test)

   ## Task 3: Update PCI compliance documentation
   Files: docs/security/pci.md
   Entities: billing:payment_gateway
   Depends on: Task 1
   Parallelizable with: Task 2
   Acceptance criteria:
   - PCI scope documented for new SDK
   ```

6. **Update status.md**: Set current phase to `estimate`.
7. **Present to user**: Display task plan and wait for review.

---

## Phase 4: Estimate

Show the blast radius and risks before committing to execution.

1. **Read the tasks artifact.**

2. **Calculate blast radius:**
   - Files affected (from task file lists)
   - KG entities touched
   - Cross-domain dependencies triggered
   - Downstream entities that depend on changed entities (impact analysis
     using the querying skill's Impact traversal)

3. **Pre-mortem:** "It's 2 weeks from now and this work failed. What went
   wrong?" Use KG data to project risks:
   - Unresolved open questions as potential blockers
   - Accepted risks that could materialize
   - Cross-domain dependencies as coordination failure points
   - High-complexity tasks as potential delays

4. **Write artifact** to `.magellan/work/<slug>/estimate.md`:
   ```markdown
   # Estimate: <Description>

   ## Blast Radius
   - 5 files changed
   - 3 KG entities affected
   - 1 cross-domain dependency (billing → title)

   ## Pre-Mortem
   - RISK: PCI compliance question (oq_008) deferred — could block deploy
   - RISK: Settlement service integration untested in staging
   - RISK: Stripe SDK v4 may have breaking changes in webhook handling

   ## Recommendation
   Proceed with Task 1 first to validate SDK migration before committing
   to Tasks 2-3. Address oq_008 during Task 1 if possible.
   ```

5. **Update status.md**: Set current phase to `execute`.
6. **Present to user**: Display estimate and ask for confirmation.
   "Proceed with execution? [y/N]"
   Do NOT proceed without explicit confirmation.

---

## Phase 5: Execute

The engineer does the work. Magellan provides structure and tracking.

1. **For each task in order:**
   a. Display the task description, files, and acceptance criteria.
   b. The engineer (with Claude's help) implements the task.
   c. When tasks are independent, Claude should use parallel agents
      naturally — this is an instruction, not a mechanism.
   d. After completion, make an atomic commit with a message referencing
      the task number and work item.
   e. Record what was done in a brief summary.

2. **Write artifact** — append to `.magellan/work/<slug>/execution.md`
   after each task:
   ```markdown
   # Execution: <Description>

   ## Task 1: Update Stripe SDK v3 → v4 [DONE]
   Commit: abc1234
   Changes: src/billing/stripe.ts, src/billing/types.ts
   Notes: SDK v4 required updating webhook signature verification

   ## Task 2: Add async settlement notification [DONE]
   Commit: def5678
   Changes: src/billing/settlement.ts, src/events/settlement.ts
   Notes: Used EventEmitter pattern, added integration test
   ```

3. **Update status.md**: Set current phase to `verify`.

---

## Phase 6: Verify

Evidence-based verification against acceptance criteria.

1. **Read the tasks and execution artifacts.**

2. **For each task, verify acceptance criteria:**
   a. If test suites exist, run them via Bash. Report pass/fail.
   b. If no tests exist, verify by reading the changed files and checking
      that the criteria are met.
   c. For each criterion, record PASS or FAIL with evidence.

3. **Classify any failures:**
   - `TEST_ERROR` — test itself is wrong (update the test)
   - `CODE_ERROR` — implementation doesn't meet criteria (fix the code)
   - `ENV_ERROR` — environment issue (missing config, wrong version)
   - `SPEC_ERROR` — acceptance criteria were wrong (update the plan)

4. **Write artifact** to `.magellan/work/<slug>/verification.md`:
   ```markdown
   # Verification: <Description>

   ## Task 1: Update Stripe SDK v3 → v4
   - [PASS] SDK upgraded to v4 — package.json shows stripe@4.1.0
   - [PASS] Payment tests pass — 12/12 passing
   - [PASS] Timeout set to 30s — verified in stripe.ts:47

   ## Task 2: Add async settlement notification
   - [PASS] Settlement event published — integration test passes
   - [FAIL] Title service notification — ENV_ERROR: staging URL not configured

   ## Summary
   5/6 criteria passed. 1 ENV_ERROR requires staging configuration.
   ```

5. **If failures exist**: Present them and ask the user how to proceed.
   Fix and re-verify, or accept and move to audit.
6. **Update status.md**: Set current phase to `audit`.

---

## Phase 7: Audit

Milestone-level integration check.

1. **Read all artifacts** for this work item.

2. **Verify integration:**
   - Do the changes work together as a whole?
   - Are cross-domain dependencies satisfied?
   - Does the KG need updating based on what was learned?

3. **Feed learnings back to the KG:**
   - If implementation revealed new facts, suggest `/magellan:add --correction`
   - If open questions were answered during execution, resolve them
   - If new contradictions were discovered, record them

4. **Write artifact** to `.magellan/work/<slug>/audit.md`:
   ```markdown
   # Audit: <Description>

   ## Integration Check
   - Stripe SDK v4 migration complete and tested
   - Settlement notification working (after staging config fix)
   - Cross-domain billing → title integration verified

   ## KG Updates
   - Resolved oq_008: PCI compliance is at the gateway level (Stripe handles it)
   - New fact: Stripe SDK v4 uses webhook signature v2 (different from v3)

   ## Status: COMPLETE
   ```

5. **Update status.md**: Set current phase to `complete`.
6. **Display completion summary.**

---

## Rules

- **Every phase produces a markdown artifact.** No phase runs without
  leaving a written record in `.magellan/work/<slug>/`.
- **User reviews every artifact.** Do not auto-advance to the next phase.
  Wait for the user to review and approve.
- **Phases are sequential but skippable.** The user can say "skip to plan"
  to bypass Discuss. The status tracks the actual current phase.
- **Git state is the source of truth.** All artifacts are committed to git.
  Any new session can read the work directory and know exactly where things
  stand.
- **The KG is read-only during execution.** Phases 1-4 read from the KG.
  Phase 5 changes code, not the KG. Phase 7 feeds learnings back.
- **Execution updates the KG only in the Audit phase.** This prevents
  the KG from drifting during implementation.
