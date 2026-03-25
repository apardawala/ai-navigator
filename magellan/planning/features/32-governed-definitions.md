# F32: Resolution Feedback into Knowledge Graph

**Epic:** [Quality & Code Hygiene](../epics/04-quality-code-hygiene.md)
**Inspired by:** User interview — the real problem was resolutions not feeding back
**Priority:** 5 (Core KG Enhancement)
**Status:** Implemented (simplified from original "Governed Definitions" proposal)

## Problem

When a contradiction is resolved or an open question is answered, the
resolution is stored in the audit trail but the related entities are never
updated. Entity summaries, properties, and evidence still reflect the
conflicting information. The resolution is trapped in the audit trail.

## What Was Implemented

Extended the `--resolve` flow in `commands/add.md` to feed resolutions
back into the KG:

- **For contradictions**: Add the resolution as correction-level evidence
  (confidence 0.95) on each related entity. Update the entity summary to
  reflect the resolved fact.
- **For open questions**: Add the answer as correction-level evidence on
  each related entity. Remove the question ID from the entity's
  open_questions array.

The entity weight system (corrections = 0.95) naturally makes the resolution
authoritative over the original conflicting facts.

## What Was Cut

The original proposal included: new `governed/` directories, a governed
definition JSON schema, cross-domain governance with `applies_to_domains`,
a governed definition index, and versioning. None of this was needed —
the existing entity evidence system handles authority through weights.
