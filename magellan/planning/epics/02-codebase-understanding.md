# Epic 2: Codebase Understanding (Live Code)

## Problem Statement

Magellan excels at extracting knowledge from documents (manuals, transcripts,
specs, legacy source), but doesn't analyze a live codebase to produce structured
understanding of its architecture, conventions, tech stack, and navigation aids.
For onboarding, engineers need both document-derived knowledge AND codebase-derived
understanding.

## Desired Outcome

Magellan can ingest and map a live codebase alongside documents, producing
structured artifacts (stack analysis, architecture maps, convention guides,
agent-navigable indexes) that feed into the knowledge graph and onboarding
materials.

## Features

- [F04: Codebase Mapping](../features/04-codebase-mapping.md)
- [F05: Deepinit (Agent-Readable Codebase Index)](../features/05-deepinit-codebase-index.md)

## Inspired By

- GSD: 4 parallel codebase-mapper agents producing 7 structured documents
- OMC: deepinit generating hierarchical AGENTS.md files throughout a codebase

## Magellan Advantage

Magellan's knowledge graph can link codebase-derived entities to document-derived
entities via cross-domain relationships. A function discovered in code can be
linked to its specification in a design doc and its known bugs in a QA manual.
Neither OMC nor GSD can do this.
