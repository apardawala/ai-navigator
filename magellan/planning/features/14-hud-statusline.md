# F14: HUD Statusline + Progress

**Epic:** [Developer Experience](../epics/05-developer-experience.md)
**Inspired by:** OMC (HUD with presets), GSD (progress dashboard with routing)
**Priority:** 3 (Foundation)
**Status:** Implemented

## Problem

The existing statusline shows model name, directory, and context usage. During
Magellan pipeline runs, users need richer information: current pipeline step,
entities discovered, contradictions found, domain progress. There's also no
quick way to see overall pipeline status and what to do next.

## Proposed Solution

Extend the existing statusline hook to show Magellan-specific metrics during
pipeline runs, and enhance `--status` to show progress with next-action routing.

### Key Components

1. **Pipeline progress in statusline**: Current step (e.g., "Step 3/22:
   Build Graph") and percentage complete.
2. **Knowledge metrics**: Entity count, fact count, contradiction count,
   open questions count.
3. **Domain progress**: Which domains are complete vs. in-progress.
4. **Next-action routing**: When `--status` is run, show current position
   and suggest the logical next action (e.g., "3 open contradictions in
   dealer domain — resolve before proceeding to Phase 2").

## Reference Implementation

- OMC `skills/hud/SKILL.md` -- HUD with configurable presets
- GSD `/gsd:progress` -- intelligent next-action routing
- Existing `~/.claude/hooks/statusline.js` in user's config

## Open Questions

- How to read Magellan pipeline state from the statusline hook (bridge file)?
- How to handle non-pipeline operations (ask, add)?

## Acceptance Criteria

- [ ] Statusline shows current pipeline step during runs
- [ ] Knowledge graph metrics displayed in real-time
- [ ] `--status` shows progress summary with next-action suggestion
- [ ] Graceful fallback when not in a pipeline run
