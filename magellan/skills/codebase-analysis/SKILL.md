---
name: codebase-analysis
description: Extract structural understanding from a live codebase — tech stack, architecture, conventions, integrations, dependencies, and concerns. Use when processing code directories via /magellan:add --codebase. Don't use for document ingestion — use the ingestion skill instead.
---

# Codebase Analysis

You analyze a codebase to extract structural understanding. This is different
from the ingestion skill which extracts business facts. You extract how the
code is organized, what it depends on, how it's built, and what patterns it
follows.

Your job: "How is this system built and structured?"

You produce two outputs:
1. **Structural entities** for the knowledge graph (components, services,
   integrations, dependencies)
2. **Analysis documents** in `.magellan/codebase/` for human consumption

## Phase 1: Tech Stack Discovery

Before reading code files, identify the tech stack from project metadata:

1. **Scan for manifest files** using Glob:
   - `package.json`, `package-lock.json`, `yarn.lock` → Node.js/JavaScript
   - `requirements.txt`, `pyproject.toml`, `setup.py`, `Pipfile` → Python
   - `go.mod`, `go.sum` → Go
   - `pom.xml`, `build.gradle`, `build.gradle.kts` → Java/Kotlin
   - `Cargo.toml` → Rust
   - `Gemfile` → Ruby
   - `composer.json` → PHP
   - `*.csproj`, `*.sln` → .NET
   - `Makefile`, `CMakeLists.txt` → C/C++
   - `Dockerfile`, `docker-compose.yml` → Container config
   - `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile` → CI/CD

2. **Read each manifest** and extract:
   - Language and version
   - Framework (Express, Django, Spring, Rails, etc.)
   - Key dependencies (database drivers, API clients, auth libraries)
   - Dev tooling (test frameworks, linters, build tools)

3. **Write STACK.md** to `.magellan/codebase/STACK.md`:
   ```markdown
   # Tech Stack

   ## Languages
   - TypeScript 5.x (primary), Python 3.11 (scripts)

   ## Frameworks
   - Next.js 14 (frontend), FastAPI (backend API)

   ## Key Dependencies
   - prisma (ORM), stripe (payments), auth0 (auth)

   ## Infrastructure
   - Docker, AWS (from Dockerfile and terraform/)

   ## Build & CI
   - pnpm, GitHub Actions, pytest
   ```

## Phase 2: Architecture Analysis

Read the top-level directory structure and key architectural files:

1. **Scan directory structure** (Bash `ls` on root and first level).
2. **Read architectural indicators**: README, configuration files, entry
   points (main.py, index.ts, App.java).
3. **Identify patterns**:
   - Monolith vs. microservices (single vs. multi-service directories)
   - MVC / layered / hexagonal / event-driven
   - Monorepo structure (packages/, apps/, services/)
   - API style (REST, GraphQL, gRPC — from route definitions)

4. **Write ARCHITECTURE.md** to `.magellan/codebase/ARCHITECTURE.md`:
   - Overall pattern (monolith, microservices, modular monolith)
   - Module/service boundaries
   - Data flow (how do requests move through the system)
   - Key entry points

## Phase 3: Code File Analysis

For each code file in the processing list, extract structural facts alongside
business facts. The ingestion skill handles business facts — you extract:

1. **Dependencies**: What does this file import? What modules does it depend on?
   Extract as relationship facts with type `DEPENDS_ON`.
2. **Interfaces**: What does this file expose? Public functions, classes, APIs,
   exported constants. Extract as entity properties.
3. **Integration points**: External API calls, database queries, message
   queue operations, file system access. Extract as `Integration` entities.
4. **Semantic role**: Classify each file as one of:
   - `configuration` — env, config, settings
   - `business_logic` — core domain rules
   - `data_access` — ORM, queries, repositories
   - `integration` — external API clients, SDK wrappers
   - `infrastructure` — logging, monitoring, error handling
   - `presentation` — routes, controllers, views, templates
   - `test` — test files
   Tag the entity with this role.

## Phase 4: Cross-Cutting Analysis

After processing individual files, analyze cross-cutting concerns:

1. **Conventions** — Read 5-10 files from different parts of the codebase.
   Identify:
   - Naming conventions (camelCase, snake_case, file naming patterns)
   - Error handling patterns (try/catch, Result types, error codes)
   - Logging patterns (what library, what format)
   - Common abstractions (base classes, shared utilities, middleware)

   Write `.magellan/codebase/CONVENTIONS.md`.

2. **Integrations** — Compile all `Integration` entities into a summary:
   - External APIs called (with URLs/endpoints if visible)
   - Databases accessed (connection strings, ORM models)
   - Message queues, caches, file stores
   - 3rd-party SDKs and their purpose

   Write `.magellan/codebase/INTEGRATIONS.md`.

3. **Concerns** — Identify potential issues:
   - Large files (> 500 lines) — complexity hotspots
   - Circular dependencies (A imports B, B imports A)
   - Missing tests (code directories without corresponding test files)
   - Hardcoded values that should be configuration
   - Deprecated dependencies (if version info available)

   Write `.magellan/codebase/CONCERNS.md`.

## Phase 5: Representation Inventory

Scan for representation choices that are arbitrary but binding:

1. **Field name mappings**: Cryptic names that need translation
   (e.g., `dlr_stat` = dealer status, `amt_due` = amount due)
2. **Unit conventions**: Currency in cents or dollars? Dates as epoch or ISO?
   Distances in miles or kilometers?
3. **Schema divergences**: Where the internal model differs from vendor APIs
   or database columns
4. **Historical naming**: Columns or variables named by someone who understood
   the domain differently

Write findings as facts tagged `["representation"]`. These help distinguish
domain contradictions from representation collisions when cross-linking with
document-derived entities.

## Entity Output

Code entities follow the standard entity schema in file-conventions. Use these
conventions:

- **Domain**: Use `_codebase` as the domain, or the relevant business domain
  if the code clearly belongs to one (e.g., billing code → `billing` domain).
- **Entity types**: `Component`, `Service`, `Integration`, `Database`,
  `DataEntity`, `Infrastructure` — all existing types.
- **Evidence**: `source.document` is the file path, `source.location` is
  the line range, `source.quote` is the relevant code snippet (keep under
  500 chars — signature + key logic, not the entire function).
- **Relationships**: Use existing types: `DEPENDS_ON`, `CALLS`,
  `READS_FROM`, `WRITES_TO`, `INTEGRATES_WITH`, `CONTAINS`.

## What You Do NOT Do

- Do not extract business rules from code. The ingestion skill handles that.
  You extract structure, not domain logic.
- Do not install or run external tools (SCIP, tree-sitter, etc.). Read the
  code directly.
- Do not skip files. Every code file gets a disposition in processed_files.json.
- Do not guess at architecture. If you can't determine a pattern from the
  code, say so as an open question.
