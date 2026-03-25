# CLAUDE.md

Lookout is a continuous improvement tool for AI-assisted development
workflows. It monitors official sources for changes and helps users
incorporate them interactively.

## Commands

- `/lookout` — Check for changes since last run, review interactively
- `/lookout:capture "desc" [url]` — Quick-add to backlog

## Architecture

- **Provider skills** (`skills/providers/`) define sources, parsing,
  and targets per AI tool ecosystem. V1: Claude Code only.
- **Core skill** (`skills/lookout/`) runs the check-triage-review loop.
- **Commands** (`commands/`) are thin wrappers that load the skills.
- **Runtime state** lives at `~/.claude/lookout/` (not in this repo).

## Principles

- Keep skills under 200 lines. Move bulk content to references.
- Official sources only — no blogs, papers, or social media.
- Human-in-the-loop review — never auto-apply changes.
- One edit at a time during review.

## After Any Change

Run `./install.sh` to sync to `~/.claude/`.
