# Connectors

Magellan is a **self-contained** knowledge discovery plugin. It does not require
connections to external SaaS tools to function — all knowledge extraction, graph
building, and querying happens locally using the files in your workspace.

## Optional Tool Integrations

While the core pipeline is self-contained, you can optionally connect external tools
to enhance Magellan's workflows:

| Category | Use Case | Example Tools |
|----------|----------|---------------|
| document-extraction | Extract text from binary formats (DOCX, XLSX, PPTX, scanned PDFs) | **Kreuzberg** (recommended) |
| verification | Cross-check extracted facts against source documents | **Gemini CLI** (with workspace extension) |
| ~~project-tracker~~ | Route open questions to your team as tickets | Jira, Linear, Asana, GitHub Issues |
| ~~chat~~ | Send contradiction summaries to team channels | Slack, Microsoft Teams |
| ~~knowledge-base~~ | Fetch referenced documents from team wikis | Confluence, Notion, Guru |

### Kreuzberg (Document & Code Extraction)

**Required dependency.** Extracts content from 91+ document formats and 248
programming languages. Runs fully local — no data leaves the machine.

```bash
pip install kreuzberg
```

Magellan uses kreuzberg's Python API (not the CLI binary) via
`tools/magellan-extract.py`. This avoids SSL/proxy issues with the Rust CLI
and provides richer output (metadata, code intelligence, language detection).

For code intelligence (tree-sitter AST analysis), run the one-time setup:

```bash
python3 tools/magellan-extract.py --setup
```

This downloads ~400MB of tree-sitter language parsers to `~/.magellan/parsers/`.
For air-gapped environments, copy the parsers folder from a connected machine.

### Gemini CLI (Fact Verification)

When Gemini CLI is installed with the Google Workspace extension, it can access
internal project documents (Google Docs, Sheets, etc.) that Claude cannot reach.
Use it as a verification step during fact extraction:

```bash
brew install gemini  # or: npm install -g @anthropic-ai/gemini-cli
glab auth login      # authenticate with workspace
```

During pipeline Step 2b (fact extraction), pipe extracted facts to Gemini after
each file to verify accuracy and check for missed content. Gemini serves as an
independent reviewer with access to the broader document context.

These integrations are **tool-agnostic** — any MCP server in the category works.
Add the relevant MCP servers to your `.mcp.json` to enable them.

## No Required Connectors

Unlike plugins that depend on external data sources, Magellan works entirely from
local files. Point it at a folder of collected materials (code, documents, transcripts,
diagrams) and it builds the knowledge graph from those files directly.

## System Requirements

Magellan has no system requirements beyond Claude Code. It reads files directly
using Claude's built-in capabilities — no external tools needed.

> **Note:** Claude does not yet natively read DOCX, PPTX, or XLSX files. Until it
> does, convert these to PDF before adding them to your workspace.
