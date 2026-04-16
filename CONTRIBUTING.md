# Contributing to AI Navigator

## Setup

```bash
git clone https://github.com/apardawala/ai-navigator.git
cd ai-navigator

# Install Magellan (Claude Code)
cd magellan && ./install.sh && cd ..

# Install Lookout (Claude Code)
cd lookout && ./install.sh && cd ..
```

Restart Claude Code after installing.

## Project Structure

```
ai-navigator/
  magellan/          # Knowledge discovery plugin
    commands/        #   Slash commands (entry points)
    skills/          #   Domain expertise (lazy-loaded)
    tools/           #   Node.js CLI tools (deterministic operations)
  lookout/           # Continuous improvement plugin
```

## Making Changes

1. Create a branch from `main`.
2. Make your changes. Follow the existing code style.
3. Test by running the relevant install script and using the plugin.
4. Commit with a descriptive message (e.g., `feat: add X`, `fix: resolve Y`).
5. Open a pull request against `main`.

## Magellan Skills

Skills live in `magellan/skills/`. Each skill is a `SKILL.md` under 500 lines
with optional `references/` for bulky content. When modifying skills:

- Keep SKILL.md focused on procedures, not encyclopedic detail.
- Use flat subdirectories (one level deep).
- Include negative triggers in the frontmatter description.
- After changes, run `./install.sh` to sync to `~/.claude/`.

See `magellan/CLAUDE.md` for full skill authoring standards.

## Magellan Tools

Tools live in `magellan/tools/`. These are Node.js scripts that handle
deterministic operations (JSON mutations, graph traversal, verification).
They must not require network access or LLM calls.

## Platform Support

Magellan supports multiple AI platforms via install scripts:

- `install.sh` — Claude Code
- `install-gemini.sh` — Gemini CLI / AntiGravity
- `install-kiro.sh` — Kiro IDE

The canonical source files live in `magellan/commands/` and `magellan/skills/`.
Platform-specific installers convert syntax as needed. Do not maintain separate
copies of skills per platform.

## License

Apache 2.0. By contributing, you agree that your contributions will be licensed
under the same license.
