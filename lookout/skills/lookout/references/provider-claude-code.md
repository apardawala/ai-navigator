# Claude Code Provider

You are a Lookout provider for the Claude Code ecosystem. Your job is to
fetch official sources, parse them, and return structured change lists.

## Sources

### 1. Claude Code Release Notes

**How to fetch:** The release notes are available via the `/release-notes`
slash command. However, since you're running inside a skill, read them
by searching for the version entries that are newer than the last-seen
version in state.

The release notes follow a consistent format:

```
Version X.Y.Z:
* Change description one
* Change description two
```

**How to parse:**

1. Read the full release notes content provided by the caller.
2. Extract all `Version X.Y.Z:` headers.
3. Compare each version against `last_seen_version` from state.
4. Return only entries where the version is newer.

**How to classify each bullet:**

- Contains "breaking change", "deprecated", "removed", "renamed" ->
  tag as `[BREAKING]`
- Contains "added", "new", "introducing", "released" ->
  tag as `[NEW]`
- Contains "fixed", "fix" ->
  tag as `[FIX]`
- Everything else ->
  tag as `[CHANGE]`

### 2. Anthropic Blog

**How to fetch:** Use the WebFetch tool on https://www.anthropic.com/news.
Ask the model to extract post titles and publication dates.

**How to parse:**

1. From the fetched content, extract all post entries with:
   - Title
   - Date (or relative date, converted to absolute)
   - URL
2. Filter to posts published after `last_check_date` from state.
3. Return matching posts.

**Failure handling:** If the WebFetch fails or returns unexpected content,
report the failure and continue with other sources. Never fabricate
blog post entries. Never skip silently.

### 3. Claude Code Documentation

**How to fetch:** Claude Code docs publish a machine-readable page index
at https://code.claude.com/docs/llms.txt. This file lists every
documentation page URL, one per line.

**How to detect structural changes (new/removed pages):**

1. Fetch `llms.txt` via WebFetch.
2. Read `~/.claude/lookout/docs-index.txt` (stored copy from last check).
3. Diff the two lists:
   - URLs in new but not stored = new documentation pages
   - URLs in stored but not new = removed/renamed pages
4. Save the new `llms.txt` content to `docs-index.txt`.
5. Flag new/removed pages for review.

**How to detect content changes on key pages:**

Only track these 8 high-value pages for content changes:
- `settings.md` — Configuration reference
- `memory.md` — CLAUDE.md and auto-memory
- `skills.md` — Skill authoring
- `hooks.md` — Hooks configuration
- `permissions.md` — Permission model
- `plugins.md` — Plugin system
- `best-practices.md` — Official best practices
- `model-config.md` — Model configuration

For each key page:
1. Fetch via WebFetch: `https://code.claude.com/docs/en/{page}`
2. Ask the LLM to extract the substantive content (strip navigation,
   boilerplate, formatting).
3. Compare the extracted content against the stored summary from
   `docs_page_hashes` in state.json.
4. If meaningfully different, flag for review. Ask the LLM to
   summarize what changed.
5. Update the hash in state.

**Failure handling:** If `llms.txt` fetch fails, report and continue
with other sources. If an individual page fetch fails, skip that page
and report — don't block the entire docs check.

### 4. Prompt Engineering Guide

**How to fetch:** Use WebFetch on
https://platform.claude.com/docs/en/docs/build-with-claude/prompt-engineering/claude-prompting-best-practices

This is the "living reference" that Anthropic maintains as the canonical
source for prompting best practices.

**How to detect changes:**

1. Fetch the page via WebFetch.
2. Ask the LLM to extract the key recommendations, techniques, and
   section headings.
3. Compare against `prompt_guide_hash` in state.json.
4. If changed, flag for review with a summary of what's different.
5. Update the hash in state.

**Failure handling:** If the fetch fails (the URL has redirected before),
try the alternate URL without the `/docs` prefix. If both fail, report
and continue.

## Output Format

When the caller invokes you, return a structured summary:

```
## Claude Code Changes Since [last_version]

### Release Notes

[BREAKING] Version X.Y.Z: Setting X deprecated
[NEW] Version X.Y.Z: Feature Y now available
[FIX] Version X.Y.Z: Fixed issue with Z

### Anthropic Blog

[BLOG] "Post Title" (YYYY-MM-DD) -- URL

### Documentation

[DOCS-NEW] New page: page-name.md
[DOCS-REMOVED] Removed page: page-name.md
[DOCS-CHANGED] settings.md: Summary of what changed

### Prompt Engineering Guide

[GUIDE-CHANGED] Summary of what changed
  or
[GUIDE] No changes detected

### Summary

Release notes: N new versions (M changes total)
Blog posts: N new posts
Documentation: N structural changes, M content changes
Prompt guide: changed / unchanged
Breaking changes: N
```

## State Fields

This provider uses the following fields in `~/.claude/lookout/state.json`
under `providers.claude-code`:

- `last_check_date` — ISO date of last check (for blog filtering)
- `last_seen_version` — Last processed Claude Code version string
- `docs_page_hashes` — Object mapping page filename to content hash
  for the 8 tracked key pages
- `prompt_guide_hash` — Content hash of the prompt engineering guide

Additional runtime file:
- `~/.claude/lookout/docs-index.txt` — Stored copy of `llms.txt`

## Review Targets

When changes are found that warrant action, edits target:
- `~/.claude/CLAUDE.md` — Global Claude Code instructions
- `{project}/CLAUDE.md` — Project-level instructions
- `~/.claude/settings.json` — Claude Code settings
