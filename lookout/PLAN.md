# Lookout

A continuous improvement tool for AI-assisted development workflows.
Lookout keeps your AI tool configuration current by tracking official
changes and helping you incorporate what matters — automatically
aware, manually applied.

## Problem

AI tooling moves fast — and it's not just one tool. Claude Code,
Cursor, Gemini, Kiro — each has its own release cadence, model updates,
and API changes. Developers use multiple AI assistants across projects,
and each one shifts what "good" looks like for your setup.

Staying current is manual, scattered, and easy to drop. The cost of
falling behind is invisible — you keep using stale patterns without
knowing better ones exist. But chasing every update in real-time
is just the AI hype cycle dressed up as productivity.

## Core Principles

### Aware Automatically, Applied Manually

Lookout state lives inside CLAUDE.md files — the same files Claude
already reads at session start. When Claude encounters a CLAUDE.md
with a stale Lookout section, it knows updates are available and
notifies the user. No separate tool invocation needed for awareness.

The `/lookout` command is for the deep review — reading sources,
drafting edits, applying changes. But the *notification* is passive.

### Test, Don't Ask

Don't trust a model to explain its own optimal usage. Don't trust a
blog post's claims about best practices. When a change looks relevant,
test it against your actual workflow before incorporating it. Your
judgment during interactive review — not automated scoring — is the
evaluation mechanism.

### Curated, Not Configurable

Lookout ships with curated, vetted sources for each provider. Users
don't build their own source lists — that's the product's job. The
sources are selected to be official, factual, and high signal-to-noise.
This prevents users from drowning in self-curated RSS feeds disguised
as productivity.

### Native-First Design

Every design decision should reflect how this would work as a built-in
Claude Code feature. State lives in CLAUDE.md, not separate files.
Detection uses native tools (WebFetch, Read). The skill reads context
Claude already has. When this graduates from plugin to native feature,
the migration should be trivial.

## Solution

Two layers:

1. **Passive awareness** — Lookout state in every CLAUDE.md. Claude
   sees it at session start and notifies if stale.
2. **Active review** — `/lookout` command for deep review: fetch
   sources, triage, draft edits, apply with approval.

## Who Is This For

Anyone using AI coding tools who wants their config to stay current
without manually tracking changes across official sources.

## Runtime

Lookout is a Claude Code plugin — a set of skills and commands that
install to `~/.claude/` and run inside Claude Code sessions. No
external dependencies, no daemon, no separate process. It uses
Claude Code's native tools (WebFetch, Read, Edit) to check sources
and apply changes.

---

## Architecture: State in Rules Files

### The Key Design Decision

Lookout state lives in `.claude/rules/` files — Claude Code's native
mechanism for auto-loaded context. This is deliberate:

1. **Auto-loaded every session.** Claude reads rules files at session
   start alongside CLAUDE.md. No extra file reads needed.
2. **Lookout owns its own file.** No modification to the user's
   CLAUDE.md. Clean install, clean uninstall.
3. **Project-level state is automatic.** Each project can have its
   own `{project}/.claude/rules/lookout.md` — same mechanism, no
   separate state logic.
4. **Native-ready.** A built-in Claude Code feature would use rules
   files, not modify the user's CLAUDE.md. This IS how a native
   feature would work.
5. **No merge conflicts.** Each plugin owns its own rules file.
   Multiple plugins coexist without touching the same files.

### What It Looks Like

**Global rules** (`~/.claude/rules/lookout.md`):

```markdown
# Lookout

last_checked: 2026-03-25
last_seen_version: 2.1.75
docs_index_hash: a1b2c3
prompt_guide_hash: d4e5f6

At session start, check if this Lookout state is stale:
- last_checked older than 7 days, OR
- current Claude Code version newer than last_seen_version
If stale, notify once: "Lookout: N days since last check. Run
/lookout to review what's changed." Do not block or repeat.
```

**Project rules** (`{project}/.claude/rules/lookout.md`):

```markdown
# Lookout

last_reviewed: 2026-03-25
against_version: 2.1.75
```

### How Passive Awareness Works

1. User starts a Claude Code session.
2. Claude auto-loads `~/.claude/rules/lookout.md` (user-level rules
   load before project rules).
3. Claude sees Lookout state: `last_checked` and `last_seen_version`.
4. Claude knows its own current version (from the system).
5. If current version > `last_seen_version` OR `last_checked` is
   older than 7 days -> notify the user.
6. The notification is a one-liner, not a blocker:
   "Lookout: 12 days since last check (version 2.1.75 -> 2.1.80).
   Run /lookout to review."

If the user is in a project with its own rules file:
7. Claude also loads `{project}/.claude/rules/lookout.md`.
8. If the project's `against_version` is behind the global's
   `last_seen_version` -> the project hasn't been reviewed against
   recent changes.
9. Notify: "This project was last reviewed against 2.1.75.
   Current is 2.1.80. Run /lookout to review project-specific changes."

### What `/lookout` Does With State

When `/lookout` runs and completes a review:

1. Updates `~/.claude/rules/lookout.md`:
   - `last_checked` -> today
   - `last_seen_version` -> highest version seen
   - `docs_index_hash` -> current hash
   - `prompt_guide_hash` -> current hash

2. If in a project, creates/updates
   `{project}/.claude/rules/lookout.md`:
   - `last_reviewed` -> today
   - `against_version` -> current global `last_seen_version`

3. All updates go through the Edit tool — user approves each change.

### First Install: Setup Audit

When no `~/.claude/rules/lookout.md` exists, `/lookout` runs a
first-time audit instead of the normal check loop. This is the
highest-value moment — the user likely has accumulated drift from
a setup never reviewed against current best practices.

The audit:

1. **Reads the user's current setup:**
   - `~/.claude/CLAUDE.md` — Is it under 200 lines? Restating
     defaults? Conflicting with current guidance?
   - `~/.claude/settings.json` — Deprecated or missing settings?
   - `~/.claude/rules/` — Existing rules files?
   - Current Claude Code version

2. **Fetches current sources:**
   - Release notes (establish version baseline)
   - Claude Code docs key pages (settings, memory, skills, hooks,
     permissions, plugins, best-practices, model-config)
   - Prompt engineering guide

3. **Compares setup against current best practices:**
   - Instructions that restate Claude's defaults (wasted tokens)
   - Patterns that conflict with current official guidance
   - Features the user isn't using but could benefit from
   - CLAUDE.md size and structure vs. docs recommendations

4. **Presents findings** classified as:
   - `[IMPROVE]` — Specific actionable improvement, will draft edit
   - `[INFO]` — Worth knowing, no specific edit
   - `[OK]` — Checked and fine

5. **Interactive review** — Same one-at-a-time approval flow as
   any normal review. The audit does not rewrite the user's config
   wholesale — every proposed change is individually approved.

6. **Creates the rules file** with baseline state after review.

### Runtime Files

Only two files outside of rules:

```
~/.claude/lookout/
  docs-index.txt                   # Stored copy of llms.txt for diffing
  backlog.md                       # Reactive captures (append-only)
```

Changes are tracked by git history on the rules file and CLAUDE.md
edits — no separate changelog file.

---

## Architecture: Providers

Lookout is designed around **providers** — each representing an AI
tool ecosystem with its own sources, state tracking, and review targets.

A provider defines:
1. **Sources** — What to check (release notes, official blog, docs)
2. **State** — What to track in the rules file
3. **Targets** — Which files to review and potentially edit

Providers are implemented as skills. Each provider skill contains
the curated source list, the check logic, and knowledge of what
that tool's configuration looks like.

### V1: Claude Code Provider

V1 ships with a single provider: Claude Code. It handles:
- Claude Code release notes (via `/release-notes`)
- Anthropic blog (model releases, capability changes)
- Claude Code documentation (via `llms.txt` + key page tracking)
- Prompt engineering guide (content hash tracking)
- State: `~/.claude/rules/lookout.md`, `{project}/.claude/rules/lookout.md`
- Targets: `~/.claude/CLAUDE.md`, project CLAUDE.md, settings.json, rules files

### Future Providers (not V1)

| Provider | Sources | Targets |
|---|---|---|
| Cursor | Cursor changelog, relevant blog | `.cursorrules`, cursor settings |
| Gemini (via Kiro) | Gemini API changelog, Google AI blog | Kiro config, Gemini rules |
| Anthropic API | API docs changelog, SDK releases | SDK usage patterns in code |

Adding a provider means writing a new skill — no changes to the
core Lookout loop.

---

## Sources (V1: Claude Code)

### Design Philosophy

Official sources only. Blog posts, papers, and community commentary
are untested theories until they've had a few months to harden.
Sources are curated by Lookout, not configurable by users.

### Selection Criteria

A source earns its spot by meeting ALL of:
1. Produced by the tool vendor (not community commentary)
2. Contains factual changes (not opinions or speculation)
3. Has a stable, fetchable URL or built-in access method
4. Content is structured enough to parse programmatically

### V1 Source List

#### 1. Claude Code Release Notes
- **Detection:** Version comparison
- **Access:** Built-in `/release-notes` command. Output is structured
  markdown with `Version X.Y.Z:` headers followed by bullet points.
  The skill parses version headers and compares against
  `last_seen_version` from the CLAUDE.md Lookout section.
- **Why:** Directly affects tool configuration, available features,
  breaking changes, new skill/plugin APIs
- **Look for:** New features that enable/change workflows, deprecations,
  breaking changes, new settings or permissions
- **Cost:** Free (built-in, no WebFetch needed)

#### 2. Anthropic Blog
- **Detection:** Date comparison
- **Access:** WebFetch against https://www.anthropic.com/news.
  The skill asks the LLM to extract post titles and dates from the
  page, then filters to posts after `last_checked` date from the
  CLAUDE.md Lookout section. Blog structure may change — if the
  fetch returns unexpected content, the skill stops and reports the
  failure rather than guessing.
- **Why:** Model releases, capability changes, pricing, official
  best practices. Facts that change model selection and prompting.
- **Look for:** New model announcements, capability benchmarks,
  official guidance on context management
- **Cost:** 1 WebFetch call

#### 3. Claude Code Documentation
- **Detection:** `llms.txt` diff + content hash on key pages
- **Access:** Claude Code docs publish a machine-readable index at
  `code.claude.com/docs/llms.txt` listing all 70+ documentation pages.
  On each check:
  1. Fetch `llms.txt` and compare against stored copy
     (`~/.claude/lookout/docs-index.txt`).
  2. New URLs = new doc pages -> flag for review.
  3. Removed URLs = deleted/renamed pages -> flag for review.
  4. For content changes, track content hashes of 8 high-value pages
     (settings, memory, skills, hooks, permissions, plugins,
     best-practices, model-config). Re-fetch only those, compare
     hashes. If changed, flag for review.
- **Why:** The authoritative configuration reference. When docs change,
  your setup may need to match.
- **Look for:** New settings, changed CLAUDE.md guidance, new skill
  authoring patterns, permission model changes, plugin API updates
- **Cost:** 1 WebFetch for index, 0-8 for changed key pages
- **High-value pages tracked for content changes:**
  - `settings.md` — Configuration reference
  - `memory.md` — CLAUDE.md and auto-memory
  - `skills.md` — Skill authoring
  - `hooks.md` — Hooks configuration
  - `permissions.md` — Permission model
  - `plugins.md` — Plugin system
  - `best-practices.md` — Official best practices
  - `model-config.md` — Model configuration

#### 4. Prompt Engineering Guide
- **Detection:** Content hash
- **Access:** WebFetch against the Anthropic prompt engineering
  best practices page. The overview page points to this "living
  reference" as the canonical source. On each check, fetch and
  compare content hash against `prompt_guide_hash` from the
  CLAUDE.md Lookout section.
- **Why:** Official prompting practices. When this changes, your
  CLAUDE.md patterns may be outdated or suboptimal.
- **Look for:** New prompting techniques, changed recommendations,
  deprecated patterns
- **Cost:** 1 WebFetch call

### Sources Considered and Excluded

- **API Changelog** — URL returns 404. API changes are announced on
  the blog. Revisit if a stable URL appears.
- **Model self-query** — Models don't know their own optimal usage
- **GitHub Issues** — Too noisy for scheduled monitoring
- **Blogs/newsletters** — Opinions, not facts
- **Research papers** — Wait for real-world confirmation
- **Social media** — Ephemeral, noisy, not scannable

---

## Reactive Capture

Between lookout runs, you'll encounter things worth noting:

- You hit a bug and find a workaround
- You notice Claude using a feature you didn't know existed
- A colleague shares something relevant
- You stumble on an article worth investigating

### Capture

Zero-friction, < 5 seconds. Run `/lookout:capture` or append to
`~/.claude/lookout/backlog.md`:

```
- [ ] YYYY-MM-DD | bucket | one-line description | source (optional)
```

Buckets:
- `config` — CLAUDE.md, settings, permissions
- `tooling` — Plugin/skill architecture and APIs
- `workflow` — Development patterns and practices

Reactive captures are **hypotheses, not facts**. They appear in your
next `/lookout` run alongside official changes, and go through the
same interactive review.

---

## The Review Process

This is the core of Lookout — an interactive, human-in-the-loop
review of each actionable item.

### For each item:

1. **Read** — Fetch and read the source material fully. If a fetch
   fails, stop and ask for help (never skip silently).
2. **Extract** — Identify specific, actionable lessons. Classify
   each into:
   - Global config change (`~/.claude/CLAUDE.md`)
   - Project config change (`{project}/CLAUDE.md`)
   - Feature idea (log, don't build)
   - No action needed
3. **Draft** — For each actionable lesson, draft a specific edit
   with rationale. Present one at a time.
4. **Decide** — User approves, rejects, or modifies each edit.
5. **Apply** — Apply approved edits immediately.
6. **Update state** — After all edits, update the Lookout section
   in the relevant CLAUDE.md files (dates, versions, hashes).

### Change Classification

Not every item needs full review:

```
Item from check
  |
  +-- Breaking change or deprecation?
  |     Yes -> Immediate detailed review
  |
  +-- New feature relevant to current setup?
  |     Yes -> Review: does it improve a workflow?
  |
  +-- New CLI flag, setting, or permission?
  |     Yes -> Note it. Test manually when relevant.
  |
  +-- Bug fix or minor change?
        Skip — note and move on
```

---

## File Structure

```
lookout/                           # Development repo
  PLAN.md                          # This file
  CLAUDE.md                        # Project instructions for development
  install.sh                       # Sync to ~/.claude/
  skills/
    lookout/
      SKILL.md                     # Core loop: check + triage + review
    providers/
      claude-code/
        SKILL.md                   # Claude Code provider: sources, parsing,
                                   # targets. Future providers go here as
                                   # sibling directories.
  commands/
    lookout.md                     # /lookout — main command
    lookout-capture.md             # /lookout:capture — quick backlog add

~/.claude/rules/
  lookout.md                       # Global state (auto-loaded every session)

~/.claude/lookout/                 # Runtime files (user-specific)
  docs-index.txt                   # Stored copy of llms.txt for diffing
  backlog.md                       # Reactive captures (append-only)

{project}/.claude/rules/
  lookout.md                       # Project state (auto-loaded in project)
```

---

## Commands

- `/lookout` — Check for changes since last run, then review
  interactively. This is the primary command — everything in one flow.
- `/lookout:capture "description" [url]` — Quick-add to backlog
  between runs.

Two commands. That's it. Passive awareness needs no command — it's
triggered by Claude reading the CLAUDE.md Lookout section at session
start.

---

## Future: Native Integration

Lookout is designed to graduate from plugin to built-in Claude Code
feature. Here's what that would look like:

### What Claude Code Already Has

- CLAUDE.md hierarchy (global, project, nested)
- Auto-memory that saves learnings across sessions
- `/release-notes` built-in
- `/doctor` for self-diagnosis
- Skill hot-reload

### What Lookout Adds

- **Freshness tracking** — "When was this config last reviewed?"
- **Gap analysis** — Comparing what's new against what you have
  configured and telling you what matters for YOUR setup
- **Guided incorporation** — Not just "here's what changed" but
  "here's a specific edit to your config, with rationale"

### Native Feature Spec

As a built-in feature, Lookout would:

1. Embed freshness metadata in CLAUDE.md automatically (no plugin
   install needed).
2. Check freshness at session start — compare embedded version
   against current version, flag if stale.
3. On `/lookout`, fetch official sources, present summary, walk
   through interactive review — exactly as the plugin does.
4. Have direct access to Claude's knowledge of the user's full
   config (settings, permissions, skills, hooks) for smarter
   triage — "this new feature affects your hooks setup."
5. Update the CLAUDE.md Lookout section as part of the review flow.

The plugin proves the UX and source curation. The native feature
adds deeper config awareness.

---

## Resolved Decisions

| Question | Decision | Rationale |
|---|---|---|
| Where state lives | `.claude/rules/lookout.md` | Auto-loaded by Claude. Own file = clean install/uninstall. No CLAUDE.md modification. |
| Passive vs. active | Both: passive awareness + active review | Rules file gives automatic staleness detection. /lookout gives deep review. |
| First install | Setup audit against current best practices | Highest-value moment — user has accumulated drift. Audit before baseline. |
| How to evaluate changes | Interactive human review | Your judgment during review is the eval. No automated scoring. |
| Source curation | Curated by Lookout, not user-configurable | Users shouldn't build source lists. That's the product's job. |
| Provider architecture | Each provider is a skill | Adding a provider = adding a skill directory. No changes to core loop. |
| How many commands | 2 | `/lookout` for review. `/lookout:capture` for quick adds. Awareness is passive. |
| Native integration path | Plugin first, native later | Prove the UX as plugin. Graduate to native with deeper config awareness. |

## Build Order

1. **Rules file + passive awareness** — Define the rules file format,
   the staleness check instruction, and state update logic
2. **First install audit** — The setup audit that runs when no rules
   file exists. Reads setup, fetches sources, compares, presents findings.
3. **Provider skill: Claude Code** — Parse release notes, detect
   new versions, fetch blog/docs/guide, present summary
4. **Core skill: check + review loop** — The interactive flow,
   including rules file state updates
5. **Capture command** — Quick backlog append
6. **Main command** — `/lookout` wiring it all together
7. **install.sh** — Sync to ~/.claude/

## Non-Goals (for now)

- Automated evaluation or scoring
- Background/scheduled monitoring
- Multi-user or team sync
- Non-official source monitoring
- Model self-query as discovery
- User-configurable source lists
- Multiple simultaneous providers (V1 = Claude Code only)
