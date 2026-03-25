---
description: Check for AI tooling changes since your last run and review them interactively. Run this before starting new work to stay current. Don't use for adding backlog items — use /lookout:capture instead.
argument-hint: [--status]
allowed-tools:
  - Read
  - Edit
  - Write
  - WebFetch
  - Bash
  - Glob
  - AskUserQuestion
---

# /lookout

Check for changes since your last run and review them interactively.

## Usage

```
/lookout             Check and review (the normal flow)
/lookout --status    Show what's changed without reviewing
```

## Behavior

1. Read the lookout skill at `skills/lookout/SKILL.md`.
2. The skill references `references/provider-claude-code.md` for
   source-specific parsing and classification logic.
3. Follow the skill's loop: load state -> fetch changes ->
   present summary -> triage -> interactive review -> update state.

## First Run

If `~/.claude/rules/lookout.md` doesn't exist, this is a first install.
Run a setup audit of the user's current configuration against current
best practices. See the skill's "First Install Audit" section.

## Status Mode

If `--status` is passed, run steps 1-3 only (load state, fetch, present
summary). Do not triage or review. Do not update state — the user is
just peeking.

## Important

- State lives in `~/.claude/rules/lookout.md` (global) and
  `{project}/.claude/rules/lookout.md` (project).
- Ensure `~/.claude/lookout/` directory exists before writing runtime files.
- Release notes are accessed by reading the `/release-notes` output.
- Blog and docs are fetched via WebFetch. If a fetch fails, continue
  with other sources and report the failure.
