# F01: Compaction-Resilient Memory

**Epic:** [Context & Session Resilience](../epics/01-context-session-resilience.md)
**Inspired by:** OMC (project-memory hooks, notepad system, pre-compact hooks)
**Priority:** 2 (Foundation)
**Status:** Implemented (simplified)

## Problem

When Claude auto-compacts the context window during long Magellan pipeline runs,
critical working state is lost -- current pipeline position, in-progress
extraction context, decisions made during the session, and accumulated insights.
The model may repeat work or lose track of where it was.

## Proposed Solution

Add hooks that fire before context compaction to persist critical state to disk.
On session resume or post-compaction, automatically reload this state.

### Key Components

1. **Pre-compact hook**: Saves current pipeline state, working notes, and
   in-progress context to `.magellan/session/` before compaction occurs.
2. **Topic-scoped memory slots**: Instead of a single flat memory file,
   structure session state by topic so each can be independently saved,
   loaded, and prioritized:
   - `pipeline_position` — current step, current domain, what's completed
   - `user_decisions` — contradictions resolved, questions answered this session
   - `working_context` — current entity being processed, current domain focus
   - `blockers` — what's stuck, what needs human input
   Lower-priority topics can be dropped if memory budget is tight.
   (Source: Google Survivor Network codelab — Vertex AI Memory Bank
   with custom topics)

   Each slot should also be classified on two dimensions:
   - **Persistence**: Session-only (short-term) vs. cross-session (long-term).
     `pipeline_position` is session-only. `user_decisions` should persist
     long-term since resolved contradictions are permanent.
   - **Scope**: User-level vs. system-level. User preferences are per-user.
     Governed definitions and correction history are system-level — all
     users/agents benefit from them.
   (Source: "Context Engineering as Your Competitive Edge" — persistence ×
   scope matrix for agent memory design)
3. **Priority tiers**: Not all state is equal. Pipeline position is critical.
   Per-entity extraction notes are nice-to-have. Topic-scoped slots enable
   selective loading — reload `pipeline_position` and `blockers` first,
   load `working_context` only if budget allows.

### Signal-Based Capture (from Supermemory)

4. **Selective capture during conversation, not just at session end.**
   Don't save everything — capture high-signal moments as they happen:
   - **Signal keywords**: When the conversation contains keywords like
     "resolved", "decided", "the answer is", "correction", "workaround",
     automatically capture that turn plus surrounding context.
   - **Signal events**: When a contradiction is resolved, an open question
     is answered, or a governed definition is created, capture immediately.
   - **Configurable context window**: Capture N turns before/after the
     signal to preserve the reasoning, not just the conclusion.
   This is more efficient than dumping the full session at Stop — it
   captures decisions *as they happen* rather than reconstructing them
   from a session transcript after the fact.
   (Source: supermemoryai/claude-supermemory — signal extraction with
   configurable keywords and context windows)

## Reference Implementation

- OMC `scripts/project-memory-precompact.mjs` -- fires on Notification event
  (compact type), saves to `.omc/project-memory.json`
- OMC `scripts/project-memory-session.mjs` -- loads on session start
- OMC notepad system with priority/working/manual tiers

### Stop Hook for Incomplete Work Detection

4. **Completion enforcement hook**: A Stop hook that evaluates whether the
   model is rationalizing incomplete work ("I've set up the foundation...",
   "You can continue by...", "The next steps would be...") rather than
   actually completing the task. If rationalizing, force continuation.
   This prevents pipeline steps from being half-finished when the model
   decides to stop prematurely. (Source: trailofbits/claude-code-config
   Stop hook with prompt-based evaluation)

## Open Questions

- What state is most critical to preserve for Magellan's pipeline?
- Should this use Claude Code's memory directory or `.magellan/session/`?
- How much state is too much to reload post-compaction?

## Acceptance Criteria

- [ ] Pre-compact hook fires and saves state before context compaction
- [ ] Post-compaction, model can continue pipeline without re-reading files
- [ ] Session start loads previous session state if available
- [ ] State file stays under a reasonable size (< 50KB)
