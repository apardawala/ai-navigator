#!/bin/bash
# Magellan installation script for Gemini/AntiGravity

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
WORK_DIR="$PWD/.agent"
WORKFLOWS_DIR="$WORK_DIR/workflows"
SKILLS_DIR="$WORK_DIR/skills"

echo "Installing Magellan for Gemini into $WORK_DIR..."

# Create directories
mkdir -p "$WORKFLOWS_DIR" "$SKILLS_DIR"

# Install workflows (commands)
echo "  Installing workflows..."
cp "$REPO_DIR/commands/magellan.md" "$WORKFLOWS_DIR/magellan.md"
for cmd in add ask research work; do
  if [ -f "$REPO_DIR/commands/$cmd.md" ]; then
    cp "$REPO_DIR/commands/$cmd.md" "$WORKFLOWS_DIR/magellan-$cmd.md"
  fi
done

# Perform transformations to convert Claude Command syntax to Gemini Workflow syntax
# e.g., `/magellan:add` -> `/magellan-add`
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS sed
  sed -i '' 's/\/magellan:/\/magellan-/g' "$WORKFLOWS_DIR"/*.md
else
  # Linux sed
  sed -i 's/\/magellan:/\/magellan-/g' "$WORKFLOWS_DIR"/*.md
fi

echo "  Workflows installed: $(ls "$WORKFLOWS_DIR" | wc -l | tr -d ' ')"

# Install skills
echo "  Installing skills..."
for skill_dir in "$REPO_DIR"/skills/*/; do
  skill_name=$(basename "$skill_dir")
  if [ "$skill_name" != "*" ]; then
    mkdir -p "$SKILLS_DIR/$skill_name"
    cp -r "$skill_dir"/* "$SKILLS_DIR/$skill_name/"
  fi
done

if [ -f "$REPO_DIR/skills/_principles.md" ]; then
  cp "$REPO_DIR/skills/_principles.md" "$SKILLS_DIR/_principles.md"
fi
echo "  Skills installed: $(ls -d "$SKILLS_DIR"/*/ 2>/dev/null | wc -l | tr -d ' ')"

echo ""
echo "Magellan successfully installed for Gemini."
echo "Note: if you are already in an active agent session, you may need to reload the agent for workflows/skills to take effect."
echo ""
echo "Available Workflows:"
echo "  /magellan                  Run the discovery pipeline"
echo "  /magellan-add <path>       Add files or analyze a codebase"
echo "  /magellan-ask <question>   Query the knowledge graph"
echo "  /magellan-work \"desc\"      Structured SDLC workflow"
echo "  /magellan-research <topic> External research with citations"
