---
name: lookout
description: Core Lookout skill — checks official sources for changes since your last run, triages them, and walks you through an interactive review. Called by the /lookout command.
user-invocable: false
---

# Lookout Core

You run the check-triage-review loop. You coordinate with the provider
skill to fetch changes, then present them to the user and interactively
review actionable items.

## State Model

Lookout state lives in `.claude/rules/` files, not separate state files.
Claude auto-loads these at session start.

**Global state** in `~/.claude/rules/lookout.md`:
- `last_checked` — date of last /lookout run
- `last_seen_version` — highest Claude Code version seen
- `docs_index_hash` — hash of llms.txt for structural change detection
- `prompt_guide_hash` — hash of prompt engineering guide

**Project state** in `{project}/.claude/rules/lookout.md`:
- `last_reviewed` — date of last project-specific review
- `against_version` — version the project was last reviewed against

Read state from the rules file. Write state back to the same file
after a review, using the Edit tool (user approves the state update).

## The Loop

### Step 1: Load State

Read `~/.claude/rules/lookout.md`. Extract state fields from the
content (they're inline in the markdown, not frontmatter).

**If the file doesn't exist, this is a first install.** Jump to the
First Install Audit (below). Do not proceed with the normal loop.

If in a project, also read `{project}/.claude/rules/lookout.md` for
project state.

### Step 2: Fetch Changes

Run the Claude Code provider (see `references/provider-claude-code.md`
for full source details, parsing logic, and classification rules):

1. **Release notes**: Read the output of the `/release-notes` command
   content. Parse version headers. Filter to versions newer than
   `last_seen_version`. Classify each bullet.

2. **Blog**: Use WebFetch on https://www.anthropic.com/news.
   Extract posts newer than `last_checked`.
   If the fetch fails, report the failure and continue with other
   sources — do not block the entire check on a single fetch failure.

3. **Documentation**: Fetch `code.claude.com/docs/llms.txt` and diff
   against `~/.claude/lookout/docs-index.txt` to detect new/removed
   pages. Then check content hashes on 8 key pages (settings, memory,
   skills, hooks, permissions, plugins, best-practices, model-config).
   Flag structural and content changes.

4. **Prompt guide**: Fetch the prompt engineering best practices page.
   Compare content hash against `prompt_guide_hash`. Flag if changed.

5. **Backlog**: Read `~/.claude/lookout/backlog.md`. Extract all lines
   matching `- [ ]` (unchecked items). Skip malformed lines silently.

For sources 2-4, each fetch is independent. If one fails, report
it and continue with the others. Never block the entire check on
a single source failure.

### Step 3: Present Summary

Display a summary of everything found:

```
Lookout — Claude Code
Last checked: YYYY-MM-DD (N days ago)
Last seen version: X.Y.Z

New since then:
  Release notes: [versions] (N changes)
  Blog posts: N new posts
  Documentation: N changes (M structural, K content)
  Prompt guide: changed / unchanged
  Backlog: N items captured reactively

Highlights:
  [BREAKING] ...
  [NEW] ...
  [BLOG] ...
  [DOCS-NEW] ...
  [DOCS-CHANGED] ...
  [GUIDE-CHANGED] ...
  [BACKLOG] ...

Review these now? (y/n)
```

If nothing new is found:

```
Lookout — Claude Code
Last checked: YYYY-MM-DD (N days ago)

Everything is current. No new changes since your last check.
```

Update state and exit.

### Step 4: Triage

If the user chooses to review, classify each item:

- Breaking change or deprecation -> REVIEW (immediate, detailed)
- New feature relevant to current setup -> REVIEW
- Documentation change on a key page -> REVIEW
- New CLI flag, setting, or permission -> NOTE
- Bug fix or minor change -> SKIP

Present the triage for approval before proceeding.

### Step 5: Interactive Review

For each REVIEW item, in priority order:

1. **Read**: Fetch the full source material.
2. **Extract**: Identify actionable lessons. Classify target:
   - Global config change (`~/.claude/CLAUDE.md`)
   - Global rules change (`~/.claude/rules/`)
   - Project config change (`{project}/CLAUDE.md`)
   - Settings change (`~/.claude/settings.json`)
   - Feature idea (log only)
   - No action needed
3. **Draft**: One edit at a time with rationale. Cite the source.
4. **Decide**: Wait for user approval.
5. **Apply**: Edit tool, user approves.

### Step 6: Update State

After review is complete (or if user skips review):

1. Update `~/.claude/rules/lookout.md`:
   - `last_checked` -> today's date
   - `last_seen_version` -> highest version seen
   - `docs_index_hash` -> current hash
   - `prompt_guide_hash` -> current hash

2. If in a project, update `{project}/.claude/rules/lookout.md`:
   - `last_reviewed` -> today's date
   - `against_version` -> current `last_seen_version`

3. Save updated `docs-index.txt` if it changed.

4. Mark reviewed backlog items as `[x]` in backlog.md.

Display: "Lookout complete. State updated. N changes applied."

---

## First Install Audit

When no `~/.claude/rules/lookout.md` exists, this is a first install.
The user likely has accumulated drift — a setup that's never been
audited against current best practices. This is the highest-value
moment for Lookout.

### What the Audit Does

1. **Announce**: "Welcome to Lookout. Running a first-time audit of
   your Claude Code setup against current best practices."

2. **Read the user's current setup:**
   - `~/.claude/CLAUDE.md` — global instructions
   - `~/.claude/settings.json` — current settings (if exists)
   - `~/.claude/rules/` — any existing rules files
   - Note the current Claude Code version

3. **Fetch current sources:**
   - Release notes (establish version baseline)
   - Anthropic blog (recent posts for context)
   - Claude Code docs: fetch `llms.txt` and key pages (settings,
     memory, skills, hooks, permissions, plugins, best-practices,
     model-config)
   - Prompt engineering guide

4. **Audit the CLAUDE.md against current best practices:**
   - Is it under 200 lines? (docs recommend this)
   - Does it restate Claude's default behavior? (wasteful tokens)
   - Are there instructions that conflict with current official
     guidance from the docs or prompt engineering guide?
   - Are there deprecated settings or patterns?
   - Is it using features it doesn't know about? (e.g., rules/
     directory, auto-memory, skills)
   - Are instructions specific and verifiable, or vague?

5. **Audit settings.json:**
   - Any deprecated settings?
   - Any useful settings not yet configured?
   - Permission rules that could be tightened or relaxed?

6. **Present audit findings:**

   ```
   Lookout — First Install Audit
   ==============================
   Claude Code version: 2.1.75

   Setup analyzed:
     ~/.claude/CLAUDE.md: 98 lines
     ~/.claude/settings.json: present
     ~/.claude/rules/: 0 files

   Findings:
     [IMPROVE] CLAUDE.md has 2 instructions that restate defaults
     [IMPROVE] Not using .claude/rules/ — could organize instructions
     [INFO] 3 new features since your setup was likely written
     [INFO] Prompt guide recommends technique X you're not using

   Review these findings? (y/n)
   ```

7. **Interactive review**: Same flow as a normal review — read,
   extract, draft edits, approve/reject, one at a time.

8. **Create the rules file**: After the audit review is complete,
   create `~/.claude/rules/lookout.md` with today's date, current
   version, and baseline hashes.

9. **Store baselines**: Save `docs-index.txt` with current `llms.txt`.

### Audit Classification

Findings are classified as:

- `[IMPROVE]` — Specific, actionable improvement. Will draft an edit.
- `[INFO]` — Worth knowing but no specific edit. User decides.
- `[OK]` — Checked and fine. Brief mention, no action.

### What the Audit Does NOT Do

- It does not rewrite the user's CLAUDE.md from scratch.
- It does not add instructions the user didn't ask for.
- It does not change settings without explicit approval.
- Every proposed change goes through the same one-at-a-time
  approval flow as a normal review.

---

## Rules

1. **Never skip a failed fetch silently.** If WebFetch or Read fails,
   stop and tell the user what failed and why.
2. **Never fabricate changes.** Only report what you actually find.
3. **One edit at a time.** Never batch multiple edits into one approval.
4. **Read before editing.** Always read the target file before proposing
   edits, so you understand the current state.
5. **Don't over-edit.** If a change doesn't affect the user's current
   setup, classify as NOTE, not REVIEW.
6. **State updates need approval too.** The rules file updates go
   through the same Edit approval as any other change.
