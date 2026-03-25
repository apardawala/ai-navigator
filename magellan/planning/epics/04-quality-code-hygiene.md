# Epic 4: Quality & Code Hygiene

## Problem Statement

Magellan has strong quality gates for its pipeline (pipeline-review skill with
22-step verification), but LLM outputs beyond the ingestion pipeline aren't
validated against the knowledge graph. `/magellan:ask` answers have no
confidence scoring or grounding checks. Resolved contradictions don't become
canonical definitions that prevent future confusion.

## Desired Outcome

All Magellan outputs are validated against the knowledge graph with confidence
scoring. Resolved contradictions are promoted to canonical definitions that
serve as a semantic layer for the project.

## Features

- [F11: Factcheck + Answer Validation](../features/11-factcheck-answer-validation.md)
- [F32: Governed Definitions](../features/32-governed-definitions.md)

## Inspired By

- OMC: factcheck hook on LLM outputs
- RAGAS scoring framework (faithfulness, relevance, precision)

## Magellan Advantage

Magellan's factcheck can go beyond generic verification -- it can check LLM
claims against structured, source-traced facts. "Does this code match the
business rule we extracted from the QA manual?" is a question only Magellan
can answer.
