#!/bin/bash
# Lookout installer — copies skills and commands to Claude Code
# For direct repo installs. Plugin marketplace installs handle this automatically.

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
CMD_DIR="$CLAUDE_DIR/commands/lookout"
SKILL_DIR="$CLAUDE_DIR/skills/lookout"
RUNTIME_DIR="$CLAUDE_DIR/lookout"
RULES_DIR="$CLAUDE_DIR/rules"

echo "Installing Lookout from $REPO_DIR"

# Create directories
mkdir -p "$CMD_DIR" "$SKILL_DIR" "$RUNTIME_DIR" "$RULES_DIR"

# Install main command
cp "$REPO_DIR/commands/lookout.md" "$CLAUDE_DIR/commands/lookout.md"

# Install subcommands
for cmd in capture.md; do
  if [ -f "$REPO_DIR/commands/$cmd" ]; then
    cp "$REPO_DIR/commands/$cmd" "$CMD_DIR/$cmd"
  fi
done
echo "  Commands: installed"

# Install skill (includes references/ directory)
cp -r "$REPO_DIR"/skills/lookout/* "$SKILL_DIR/lookout/"
echo "  Skills:   installed"

# Check current state
if [ -f "$RULES_DIR/lookout.md" ]; then
  echo "  State:    rules file exists (run /lookout to check for updates)"
else
  echo "  State:    no rules file yet (run /lookout for first-time audit)"
fi

echo ""
echo "Lookout installed."
echo ""
echo "Commands:"
echo "  /lookout                     Check and review changes"
echo "  /lookout:capture \"desc\"      Quick-add to backlog"
echo ""
if [ ! -f "$RULES_DIR/lookout.md" ]; then
  echo "Run /lookout now to audit your setup against current best practices."
fi
