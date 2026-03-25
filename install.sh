#!/bin/bash
# AI Navigator installer — installs both Magellan and Lookout plugins

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "AI Navigator — Installing plugins"
echo "=================================="
echo ""

# Install Magellan
if [ -f "$REPO_DIR/magellan/install.sh" ]; then
  echo "--- Magellan ---"
  bash "$REPO_DIR/magellan/install.sh"
  echo ""
fi

# Install Lookout
if [ -f "$REPO_DIR/lookout/install.sh" ]; then
  echo "--- Lookout ---"
  bash "$REPO_DIR/lookout/install.sh"
  echo ""
fi

echo "=================================="
echo "AI Navigator installed."
echo ""
echo "Run /lookout to audit your setup against current best practices."
echo "Run /magellan to start knowledge discovery on a project."
