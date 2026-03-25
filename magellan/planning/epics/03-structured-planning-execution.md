# Epic 3: Structured Planning & Execution (Process Repository)

## Problem Statement

Magellan stops at knowledge discovery and design generation (Phase 2). Once an
engineer has the knowledge graph, onboarding guide, DDD specs, and API contracts,
there's no structured workflow to translate that understanding into planned,
executed, and verified work.

Magellan should be a portable process repository -- the methodology and playbook
an engineer carries from job to job, usable at every stage of work.

## Desired Outcome

Magellan provides a knowledge-graph-informed SDLC workflow: structured
requirements gathering with ambiguity gating, phased planning that draws on
the knowledge graph, execution, and verification that validates against the
graph.

## Design Principles

- Magellan is usable at every stage, but doesn't execute the whole process
- Git state is the cold-start context -- no shadow state directories
- Parallel execution is a natural instruction, not a separate feature
- The verification phase includes test execution when available

## Features

- ~~F06: Deep Interview~~ — merged into F07's Discuss phase (KG-driven readiness check)
- [F07: Phase-Based SDLC Workflow](../features/07-phase-based-sdlc-workflow.md)

## Inspired By

- OMC: deep-interview with mathematical ambiguity scoring
- GSD: discuss -> plan -> execute -> verify -> audit lifecycle

## Magellan Advantage

Unlike GSD and OMC which plan from codebase analysis alone, Magellan can feed
the knowledge graph into planning: known contradictions become risks, open
questions become blockers, entity relationships inform dependency analysis, and
business rules inform acceptance criteria. The knowledge graph IS the context.
