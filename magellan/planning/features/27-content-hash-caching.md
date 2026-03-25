# F27: Content Hash Caching for Incremental Processing

**Epic:** [Cost & Token Optimization](../epics/09-cost-token-optimization.md)
**Inspired by:** ECC content-hash-cache-pattern skill
**Priority:** 1 (Foundation)
**Status:** Implemented

## Problem

Re-running Magellan's pipeline on a workspace with mostly unchanged files
reprocesses everything. Magellan has `processed_files.json` tracking which
files have been processed, but doesn't detect content changes vs. metadata
changes (touch, rename).

## Proposed Solution

Add SHA-256 content hashing to detect truly changed files and skip
reprocessing of unchanged content.

### Key Components

1. **Content hashing**: SHA-256 hash of file content stored alongside
   disposition in `processed_files.json`.
2. **Change detection**: On incremental run, compare current hash to stored
   hash. Skip files with matching hashes.
3. **Cascade invalidation**: When a source file changes, invalidate
   downstream artifacts (facts, entities, relationships derived from it).
4. **Hash verification**: Optionally verify that stored facts still match
   their source content (detect silent file modifications).

### Hierarchical Change Detection (from Cursor)

5. **Merkle tree for directory-level skipping**: Instead of checking
   every file hash individually, organize hashes into a Merkle tree
   where each directory node is the hash of its children. If a
   directory's hash matches the stored hash, skip the entire subtree —
   no need to check individual files within it. For a workspace with
   50,000 files, this reduces change detection from O(n) file
   comparisons to O(log n) tree walks.
6. **Fact-level caching**: Beyond file-level hashing, cache at the fact
   level. If a source document changes but 80% of extracted facts have
   identical source quotes, only re-extract for the changed portions.
   This requires storing a hash per fact alongside its source quote,
   enabling partial re-extraction instead of full re-ingestion.
   (Source: Cursor "Securely Indexing Large Codebases" — Merkle tree
   change detection, chunk-level embedding cache)

## Magellan-Specific Advantage

Magellan already tracks file dispositions in `processed_files.json` and
has source tracing on every fact. Content hashing extends this naturally --
when a source file's hash changes, we know exactly which facts, entities,
and relationships need re-extraction.

## Reference Implementation

- ECC `skills/content-hash-cache-pattern/` -- SHA-256 caching for file
  processing pipelines

### Format Principle: Standard Formats, Smart Loading

Token optimization should come from loading less data, not from encoding
data in compact custom formats. Research (McMillan 2026, 9,649 experiments)
shows that custom token-saving formats like TOON cost 138-740% MORE tokens
at scale because models can't construct efficient search patterns in
unfamiliar syntax. (Source: "Structured Context Engineering for File-Native
Agentic Systems" via Simon Willison)

Magellan's approach: keep JSON and Markdown. Save tokens by:
- Skipping unchanged files (content hash caching — this feature)
- Loading only relevant domains/entities per query (F05 TOC summaries)
- Using topic-scoped memory instead of flat dumps (F01)
- Routing simple tasks to cheaper models (F26)

## Open Questions

- Should hashing happen at the file level or chunk level?
- How to handle files that change frequently (logs, configs)?
- Should cascade invalidation be automatic or require user confirmation?
- Performance impact of hashing very large files?

## Acceptance Criteria

- [ ] Content hashes stored in processed_files.json
- [ ] Unchanged files skipped on incremental runs
- [ ] Changed files trigger re-extraction of dependent artifacts
- [ ] Measurable reduction in tokens used for incremental runs
