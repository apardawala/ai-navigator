# Lookout

A Claude Code plugin that keeps your AI toolchain current. Before you start
new work, Lookout catches you up on everything that changed — then helps you
incorporate what matters.

## The Problem

AI tooling moves fast. Release notes, model updates, documentation changes,
and new best practices constantly shift what "good" looks like for your
Claude Code setup. But you don't find out until something breaks, or worse,
you keep using stale patterns without knowing better ones exist.

Chasing every update in real-time is the AI hype cycle dressed up as
productivity. Lookout takes a different approach: check when it matters,
not when things change.

## How It Works

**Passive awareness:** Lookout stores state in `~/.claude/rules/lookout.md`,
which Claude auto-loads at every session start. If your setup is stale, Claude
tells you — no manual trigger needed.

**Active review:** When you're ready, run `/lookout` for an interactive review.
Lookout fetches what's new, triages it, and walks you through specific edits
to your configuration — one at a time, with rationale, approved by you.

### First Install

The first time you run `/lookout`, it audits your current setup against
current best practices:

- Is your CLAUDE.md under the recommended 200 lines?
- Are you restating Claude's default behavior? (wasted tokens)
- Are there instructions that conflict with current official guidance?
- Are you using features like `.claude/rules/` and auto-memory?

Every finding is presented individually. You approve, reject, or modify each one.

### Subsequent Runs

After the initial audit, `/lookout` checks 4 official sources for changes
since your last run:

1. **Claude Code release notes** — new features, breaking changes, deprecations
2. **Anthropic blog** — model releases, capability changes
3. **Claude Code documentation** — settings, memory, skills, hooks, permissions,
   plugins, best practices, and model config pages
4. **Prompt engineering guide** — official prompting best practices

Changes are triaged as REVIEW (actionable), NOTE (worth knowing), or SKIP.
You review only what matters.

### Reactive Capture

Between runs, capture signals as you encounter them:

```
/lookout:capture "Article on context management patterns" https://example.com
/lookout:capture "Claude used ToolSearch in unexpected way"
```

These appear in your next `/lookout` run alongside official changes.

## Install

### From a marketplace

```
/plugin install lookout@<marketplace-name>
```

### From the repo

```bash
git clone https://github.com/Slalom/lookout.git
cd lookout && ./install.sh
```

### For development

```bash
claude --plugin-dir /path/to/lookout
```

## Commands

| Command | What it does |
|---|---|
| `/lookout` | Check for changes since last run, review interactively |
| `/lookout --status` | Show what's changed without reviewing |
| `/lookout:capture "desc" [url]` | Quick-add a signal to backlog |

## Design Principles

**Aware automatically, applied manually.** Lookout tells you when things are
stale. You decide what to act on. Nothing is auto-applied.

**Curated, not configurable.** Sources are vetted and baked in. You don't
build your own feed list — that's the product's job.

**Test, don't ask.** Don't trust a model to explain its own optimal usage.
When a change looks relevant, test it against your workflow. Your judgment
during review is the evaluation mechanism.

**Native-first design.** State lives in `.claude/rules/`, not separate files.
Detection uses native tools. Every design decision reflects how this would
work as a built-in Claude Code feature.

## Architecture

```
Plugin structure:
  .claude-plugin/plugin.json       # Plugin manifest
  commands/lookout.md              # /lookout command
  commands/capture.md              # /lookout:capture command
  skills/lookout/SKILL.md          # Core check + triage + review logic
  skills/lookout/references/       # Provider-specific source parsing

Runtime state:
  ~/.claude/rules/lookout.md       # Global state (auto-loaded every session)
  {project}/.claude/rules/lookout.md  # Project state (per-project)
  ~/.claude/lookout/docs-index.txt # Docs page index for change detection
  ~/.claude/lookout/backlog.md     # Reactive captures
```

### Providers

Lookout uses a provider model. V1 ships with a Claude Code provider.
The architecture supports adding providers for other tools (Cursor, Gemini,
etc.) by adding reference files — no changes to the core loop.

### Change Detection

| Source | Method |
|---|---|
| Release notes | Version string comparison |
| Blog | Date comparison via WebFetch |
| Documentation | `llms.txt` diff (structural) + content hash on 8 key pages |
| Prompt guide | Content hash via WebFetch |

## Project-Level Reviews

When you run `/lookout` in a project, it also checks whether the project's
configuration has been reviewed against the latest global state. Each
project gets its own `.claude/rules/lookout.md` tracking when it was
last reviewed and against which version.

Project audits can use path-scoped rules — for example, moving skill
authoring instructions to a rules file that only loads when working in
`skills/`.

## License

Apache 2.0 — see [LICENSE](LICENSE).
