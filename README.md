# AI Navigator

A toolkit of Claude Code plugins for AI-assisted development. Each plugin
is independently installable but designed to work together.

## Plugins

### Magellan — Knowledge Discovery

Enterprise knowledge discovery that extracts structured knowledge from
documents, code, and transcripts into a queryable knowledge graph.
Surfaces contradictions and open questions as primary output.

```
/magellan                  Run the discovery pipeline
/magellan:add <path>       Add files or analyze a codebase
/magellan:ask <question>   Query the knowledge graph
/magellan:work "desc"      Structured SDLC workflow
/magellan:research <topic> External research with citations
```

[Full documentation →](magellan/README.md)

### Lookout — Continuous Improvement

Keeps your AI toolchain current by monitoring official Anthropic sources
and helping you incorporate changes interactively. Audits your setup
against current best practices on first install.

```
/lookout                   Check and review changes
/lookout:capture "desc"    Quick-add to backlog
```

[Full documentation →](lookout/README.md)

## Install

### Both plugins (recommended)

```bash
git clone https://github.com/Slalom/ai-navigator.git
cd ai-navigator && ./install.sh
```

### Individual plugins

```bash
# Magellan only
cd ai-navigator/magellan && ./install.sh

# Lookout only
cd ai-navigator/lookout && ./install.sh
```

### Via marketplace

```
/plugin install magellan@slalom
/plugin install lookout@slalom
```

## Design Philosophy

Both plugins share core principles:

- **Human-in-the-loop** — Tools propose, humans approve. Nothing is
  auto-applied without explicit consent.
- **Official sources only** — No blogs, no hype, no speculation.
  Facts from the vendor, tested against your workflow.
- **Simplicity above all** — Extend existing patterns. Don't create
  subsystems where a flat file works.
- **Native-first** — Use Claude Code's native primitives (rules files,
  skills, commands) rather than external infrastructure.

## Architecture

```
ai-navigator/
  magellan/                  # Knowledge discovery plugin
    .claude-plugin/          #   Plugin manifest
    commands/                #   5 commands
    skills/                  #   15 skills
    tools/                   #   3 Node.js CLI tools
    hooks/                   #   Statusline hook
  lookout/                   # Continuous improvement plugin
    .claude-plugin/          #   Plugin manifest
    commands/                #   2 commands
    skills/                  #   1 skill + references
  install.sh                 # Installs both plugins
  marketplace.json           # Marketplace definition for both
```

Each plugin has its own `plugin.json`, `install.sh`, and `CLAUDE.md`.
They are independently versioned and can be installed separately.

## License

Apache 2.0 — see individual plugin LICENSE files.
