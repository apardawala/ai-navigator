---
description: Quick-capture a signal to your Lookout backlog for review on your next /lookout run. Don't use for checking changes — use /lookout instead.
argument-hint: '<description> [url]'
allowed-tools:
  - Read
  - Write
---

# /lookout:capture

Add a signal to your backlog for review later.

## Usage

```
/lookout:capture "New article on context management" https://example.com
/lookout:capture "Claude used ToolSearch in unexpected way"
/lookout:capture "Colleague mentioned new Cursor feature"
```

## Behavior

1. Ensure `~/.claude/lookout/` directory exists. Create if needed.
2. Read `~/.claude/lookout/backlog.md`. If it doesn't exist, create it
   with header:
   ```
   # Lookout Backlog
   ```
3. Determine the bucket from the description:
   - Mentions CLAUDE.md, settings, permissions, config → `config`
   - Mentions skill, plugin, API, tool → `tooling`
   - Everything else → `workflow`
4. Append a new line:
   ```
   - [ ] YYYY-MM-DD | bucket | description | url
   ```
5. Confirm: "Captured. Will appear in your next `/lookout` run."

## Rules

- Never modify existing backlog entries.
- Append only.
- If the backlog file can't be read or written, stop and report why.
