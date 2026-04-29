# AI Navigator — Project Context

**Status**: Active
**Last Updated**: 2026-04-29

This file (`GEMINI.md`) is the canonical, repo-wide context for AI Navigator.
Both Claude (`CLAUDE.md`) and Gemini read their respective context files
automatically. Shared project context lives here.

## What This Is

AI Navigator is a toolkit of AI-assisted development plugins. Each plugin is
independently installable but designed to work together.

### Magellan — Knowledge Discovery

Enterprise knowledge discovery that extracts structured knowledge from
documents, code, and transcripts into a queryable knowledge graph. Surfaces
contradictions and open questions as primary output.

- **Commands**: `/magellan`, `/magellan:add`, `/magellan:ask`, `/magellan:work`, `/magellan:research`
- **Source**: `magellan/`
- **Docs**: `magellan/README.md`

### Lookout — Continuous Improvement

Monitors official AI tooling sources for changes and helps users incorporate
them interactively. Human-in-the-loop review — never auto-applies.

- **Commands**: `/lookout`, `/lookout:capture`
- **Source**: `lookout/`
- **Docs**: `lookout/README.md`

## Architecture

```
ai-navigator/
  magellan/           # Knowledge discovery plugin
    commands/         # Slash command definitions
    skills/           # Reusable instruction sets (lazy-loaded)
    tools/            # CLI tools (kg-write.js, kg-ops.js, kg-query.js, magellan-extract.py)
    scripts/          # Runtime scripts (statusline)
    install.sh        # Installs to ~/.claude/ or ~/.gemini/
  lookout/            # Continuous improvement plugin
    commands/
    skills/
    install.sh
  install.sh          # Installs both plugins
```

## Key Dependencies

- **kreuzberg** (`pip install kreuzberg`): Document and code extraction.
  Required for Magellan. Uses the Python API, not the CLI binary.
- **Tree-sitter parsers** (optional): For code intelligence across 248
  languages. Install via `python3 tools/magellan-extract.py --setup`.

## Working on This Repo

- Each plugin has its own `CLAUDE.md` with agent-specific instructions.
- Skills follow the pattern: `skills/<name>/SKILL.md` under 500 lines,
  flat subdirectories, negative triggers in descriptions.
- Tools are JavaScript (Node.js) for KG operations, Python for extraction.
- After changes, run the plugin's `install.sh` to sync to the local agent.
- Test changes by running the plugin in a target workspace.

## Cross-Model Verification

When both Claude and Gemini CLIs are available, use them as verification
partners. Each agent reads its own context file but works on the same
codebase. Use the secondary agent to cross-check findings, review code,
and validate extracted facts.
