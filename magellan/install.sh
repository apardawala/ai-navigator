#!/bin/bash
# Magellan installer — copies skills, commands, and hooks to Claude Code

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
CMD_DIR="$CLAUDE_DIR/commands/magellan"
SKILL_DIR="$CLAUDE_DIR/skills/magellan"
HOOK_DIR="$CLAUDE_DIR/hooks"
TOOL_DIR="$CLAUDE_DIR/tools/magellan"

echo "Installing Magellan from $REPO_DIR"

# Create directories
mkdir -p "$CMD_DIR" "$SKILL_DIR" "$HOOK_DIR" "$TOOL_DIR"

# Install main command (lives at commands/magellan.md, not in subdirectory)
cp "$REPO_DIR/commands/magellan.md" "$CLAUDE_DIR/commands/magellan.md"

# Install subcommands
for cmd in add.md ask.md research.md work.md; do
  if [ -f "$REPO_DIR/commands/$cmd" ]; then
    cp "$REPO_DIR/commands/$cmd" "$CMD_DIR/$cmd"
  fi
done
echo "  Commands: $(ls "$CMD_DIR" | wc -l | tr -d ' ') installed"

# Install skills
for skill_dir in "$REPO_DIR"/skills/*/; do
  skill_name=$(basename "$skill_dir")
  mkdir -p "$SKILL_DIR/$skill_name"
  cp -r "$skill_dir"/* "$SKILL_DIR/$skill_name/"
done

# Install principles
if [ -f "$REPO_DIR/skills/_principles.md" ]; then
  cp "$REPO_DIR/skills/_principles.md" "$SKILL_DIR/_principles.md"
fi
echo "  Skills:   $(ls -d "$SKILL_DIR"/*/ 2>/dev/null | wc -l | tr -d ' ') installed"

# Install tools
for tool in kg-write.js kg-query.js kg-ops.js magellan-extract.py; do
  if [ -f "$REPO_DIR/tools/$tool" ]; then
    cp "$REPO_DIR/tools/$tool" "$TOOL_DIR/$tool"
  fi
done
echo "  Tools:    $(ls "$TOOL_DIR" | wc -l | tr -d ' ') installed"

# Check kreuzberg
if python3 -c "import kreuzberg" 2>/dev/null; then
  echo "  Kreuzberg: $(python3 -c 'import kreuzberg; print(kreuzberg.__version__)')"
else
  echo ""
  echo "  WARNING: kreuzberg is not installed. Install with:"
  echo "    pip install kreuzberg"
  echo ""
  echo "  For code intelligence, also run:"
  echo "    python3 $TOOL_DIR/magellan-extract.py --setup"
fi

# Install statusline
if [ -f "$REPO_DIR/scripts/statusline.js" ]; then
  cp "$REPO_DIR/scripts/statusline.js" "$HOOK_DIR/statusline.js"
  echo "  Statusline: installed"
fi

echo ""
echo "Magellan installed. Restart Claude Code to load the new skills."
echo ""
echo "Commands:"
echo "  /magellan                  Run the discovery pipeline"
echo "  /magellan:add <path>       Add files or analyze a codebase"
echo "  /magellan:ask <question>   Query the knowledge graph"
echo "  /magellan:work \"desc\"      Structured SDLC workflow"
echo "  /magellan:research <topic> External research with citations"
