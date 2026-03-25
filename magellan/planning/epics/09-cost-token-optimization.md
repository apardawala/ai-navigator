# Epic 9: Cost & Token Optimization

## Problem Statement

Magellan uses Opus for everything regardless of task complexity. Re-running
the pipeline on unchanged files wastes tokens on redundant processing.

## Desired Outcome

Magellan routes tasks to appropriate model tiers based on complexity and
skips reprocessing of unchanged content via content hashing.

## Features

- ~~F25: Cost Tracking~~ — cut (Claude Code doesn't expose token/cost data)
- ~~F26: Smart Model Routing~~ — implemented as guidance in CLAUDE.md (automatic routing needs mid-conversation model switching)
- [F27: Content Hash Caching](../features/27-content-hash-caching.md) — implemented

## Magellan Advantage

Magellan already has `processed_files.json` tracking file dispositions. Content
hash caching extends this naturally. Model routing can be informed by the
knowledge graph -- simple entity extraction uses Haiku, cross-domain linking
with contradictions uses Opus.
