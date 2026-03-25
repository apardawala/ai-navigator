#!/bin/bash
# Magellan installation script for Kiro IDE
# Converts Magellan skills and commands into Kiro steering files

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
KIRO_DIR="$PWD/.kiro"
STEERING_DIR="$KIRO_DIR/steering"
TOOLS_DIR="$PWD/.magellan-tools"

echo "Installing Magellan for Kiro into $KIRO_DIR..."

# Create directories
mkdir -p "$STEERING_DIR" "$TOOLS_DIR"

# ---------------------------------------------------------------------------
# Helper: Add Kiro frontmatter to a steering file
# ---------------------------------------------------------------------------
add_frontmatter() {
  local file="$1"
  local name="$2"
  local description="$3"
  local inclusion="$4"

  # Create temp file with frontmatter prepended
  local tmpfile=$(mktemp)
  cat > "$tmpfile" << FRONTMATTER
---
name: $name
description: $description
inclusion: $inclusion
---

FRONTMATTER

  # Strip any existing --- frontmatter from the source, then append content
  if head -1 "$file" | grep -q "^---$"; then
    # Has frontmatter — skip it
    awk 'BEGIN{skip=0; found=0} /^---$/{found++; if(found==2){skip=0; next} if(found==1){skip=1; next}} skip==0{print}' "$file" >> "$tmpfile"
  else
    cat "$file" >> "$tmpfile"
  fi

  mv "$tmpfile" "$file"
}

# ---------------------------------------------------------------------------
# Install commands as Manual steering files (slash commands)
# ---------------------------------------------------------------------------
echo "  Installing commands as steering files..."

cp "$REPO_DIR/commands/magellan.md" "$STEERING_DIR/magellan.md"
add_frontmatter "$STEERING_DIR/magellan.md" "magellan" \
  "Run the Magellan discovery pipeline or show status" "manual"

for cmd in add ask research work; do
  if [ -f "$REPO_DIR/commands/$cmd.md" ]; then
    cp "$REPO_DIR/commands/$cmd.md" "$STEERING_DIR/magellan-$cmd.md"
    # Extract description from original frontmatter
    desc=$(grep "^description:" "$REPO_DIR/commands/$cmd.md" | sed 's/description: //')
    add_frontmatter "$STEERING_DIR/magellan-$cmd.md" "magellan-$cmd" \
      "$desc" "manual"
  fi
done

echo "  Commands: $(ls "$STEERING_DIR"/magellan*.md 2>/dev/null | wc -l | tr -d ' ') installed"

# ---------------------------------------------------------------------------
# Install principles as Always steering
# ---------------------------------------------------------------------------
if [ -f "$REPO_DIR/skills/_principles.md" ]; then
  cp "$REPO_DIR/skills/_principles.md" "$STEERING_DIR/magellan-principles.md"
  add_frontmatter "$STEERING_DIR/magellan-principles.md" "magellan-principles" \
    "Core operating principles for Magellan knowledge discovery" "always"
  echo "  Principles: installed (always loaded)"
fi

# ---------------------------------------------------------------------------
# Install skills as Auto steering files
# ---------------------------------------------------------------------------
echo "  Installing skills as steering files..."

for skill_dir in "$REPO_DIR"/skills/*/; do
  skill_name=$(basename "$skill_dir")
  if [ "$skill_name" = "*" ]; then continue; fi
  if [ ! -f "$skill_dir/SKILL.md" ]; then continue; fi

  target="$STEERING_DIR/magellan-$skill_name.md"
  cp "$skill_dir/SKILL.md" "$target"

  # Extract description from original frontmatter
  desc=$(grep "^description:" "$skill_dir/SKILL.md" | sed 's/description: //')
  add_frontmatter "$target" "magellan-$skill_name" \
    "$desc" "auto"

  # Copy supporting files (language guides, etc.) into a subdirectory
  if [ -d "$skill_dir/language_guides" ]; then
    mkdir -p "$STEERING_DIR/magellan-$skill_name"
    cp -r "$skill_dir/language_guides" "$STEERING_DIR/magellan-$skill_name/"
  fi
done

echo "  Skills: $(ls "$STEERING_DIR"/magellan-*.md 2>/dev/null | wc -l | tr -d ' ') installed"

# ---------------------------------------------------------------------------
# Install tools
# ---------------------------------------------------------------------------
echo "  Installing tools..."

for tool in kg-write.js kg-query.js kg-ops.js; do
  if [ -f "$REPO_DIR/tools/$tool" ]; then
    cp "$REPO_DIR/tools/$tool" "$TOOLS_DIR/$tool"
  fi
done

echo "  Tools: $(ls "$TOOLS_DIR"/*.js 2>/dev/null | wc -l | tr -d ' ') installed at $TOOLS_DIR/"

# ---------------------------------------------------------------------------
# Rewrite Claude-specific references
# ---------------------------------------------------------------------------
echo "  Adapting references for Kiro..."

if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS sed — rewrite slash command syntax
  sed -i '' 's/\/magellan:/\/magellan-/g' "$STEERING_DIR"/magellan*.md
  # Rewrite tool paths from ~/.claude/tools/magellan/ to local .magellan-tools/
  sed -i '' "s|~/.claude/tools/magellan/|.magellan-tools/|g" "$STEERING_DIR"/magellan*.md
else
  # Linux sed
  sed -i 's/\/magellan:/\/magellan-/g' "$STEERING_DIR"/magellan*.md
  sed -i "s|~/.claude/tools/magellan/|.magellan-tools/|g" "$STEERING_DIR"/magellan*.md
fi

echo ""
echo "Magellan successfully installed for Kiro."
echo ""
echo "Available commands (type / in Kiro to invoke):"
echo "  /magellan                    Run the discovery pipeline"
echo "  /magellan-add <path>         Add files or analyze a codebase"
echo "  /magellan-ask <question>     Query the knowledge graph"
echo "  /magellan-work \"desc\"         Structured SDLC workflow"
echo "  /magellan-research <topic>   External research with citations"
echo ""
echo "Tools installed at: $TOOLS_DIR/"
echo "Steering files at:  $STEERING_DIR/"
