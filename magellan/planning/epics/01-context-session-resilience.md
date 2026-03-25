# Epic 1: Context & Session Resilience

## Problem Statement

Magellan pipeline runs can be long-lived, spanning hours of ingestion and graph
building. When Claude auto-compacts the context window, critical pipeline state
is lost. When users close their laptop and return the next day, there's no
structured handoff to resume human context.

## Desired Outcome

Magellan sessions survive context compaction and produce clear handoff artifacts
for human resumption.

## Features

- [F01: Compaction-Resilient Memory](../features/01-compaction-resilient-memory.md) — implemented
- ~~F02: Session Pause/Resume~~ — covered by F01 session_notes + F14 next-action routing

## Inspired By

- OMC: project-memory hooks, notepad system, pre-compact hooks
- GSD: STATE.md handoff documents

## Magellan Advantage

Magellan already has `state.json` for pipeline resumability. These features
extend that from machine-state to human-state.
