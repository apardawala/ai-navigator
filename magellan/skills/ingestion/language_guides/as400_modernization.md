# AS/400 (IBM i) Modernization Environment Guide

## Overview

This guide covers the full methodology for analyzing an AS/400 (IBM i) codebase for
modernization. Unlike language guides that help extract facts from individual files,
this guide describes the **environment-level analysis workflow** — how to collect,
structure, and analyze an AS/400 system as a whole.

Use this guide when:
- Ingesting an AS/400 source code archive (zip with library/file directory structure)
- Processing AS/400 metadata outputs (DSPOBJD, DSPPGMREF)
- Building dependency maps and domain assignments across a full AS/400 application

---

## 1. Expected Directory Structure

Customer source code should arrive as a zip with this hierarchy:

```
<ZipRoot>/
  <Library>/           # Level 1: AS/400 Library (e.g. APPCORE, APPDATA, APPTRNS)
    <SourceFile>/      # Level 2: Source file type (QDDSSRC, QRPGSRC, QCLSRC, etc.)
      <program>.<ext>  # Individual source members
```

**Standard source file directories:**

| Directory  | Contents |
|------------|----------|
| `QRPGSRC`  | RPG/RPGLE/SQLRPGLE programs |
| `QCLSRC`   | CL programs (batch job control) |
| `QCLRSRC`  | CL programs (alternate) |
| `QDDSSRC`  | DDS — physical files, logical files, display files, print files, menus |
| `QMNUSRC`  | Menu source files |

The Library name (Level 1) is one of the most reliable domain signals — some libraries
map exclusively to one domain by name alone. Document these mappings in the project's
`.claude/CLAUDE.md` before running the pipeline (see Section 7).

---

## 2. AS/400 Metadata Commands

These commands are run by the customer against their **production environment** with the
full application library list active. Without the correct library list, objects from
application libraries will be missed.

### DSPOBJD — Object Descriptions

Lists every program and database object with its description.

```
DSPOBJD OBJ(*USRLIBL/*ALL) OBJTYPE(*ALL) DETAIL(*FULL) OUTPUT(*OUTFILE) OUTFILE(OUTPUTLIB/OBJDOUT)
```

**Key field:**
- `ODOBTX` — Object description text. If source code is poorly commented, this is the
  primary signal for domain mapping. Treat it like a one-line docstring for the program.

### DSPPGMREF — Program References

Lists all program-to-program calls and program-to-database interactions.

```
DSPPGMREF PGM(*USRLIBL/*ALL) OUTPUT(*OUTFILE) OBJTYPE(*ALL) OUTFILE(OUTPUTLIB/PGMREFOUT)
```

**Key fields:**

| Field    | Meaning |
|----------|---------|
| `WHLIB`  | Library of the source object |
| `WHPNAM` | Name of the calling program or database |
| `WHFNAME`| Name of the referenced object (called program or database) |

**Reading dependencies:** If program A in library B calls program C, then `WHLIB=B`,
`WHPNAM=A`, `WHFNAME=C`.

---

## 3. Building the Dependency Map

The dependency map is the single most valuable artifact for domain sequencing. Build it
from **three sources** merged into one list:

1. **DSPPGMREF output** — authoritative call/database references from AS/400
2. **BluInsights JSON** — static analysis output, covers references DSPPGMREF may miss
3. **Custom extraction prompts** — Claude-generated CSVs from source code (see Section 6)

**Merge process:**
1. Normalize all three sources to 4 columns: `Library`, `Source Program`, `Target Object`, `Reference Type`
2. Create a calculated field: `Source Program + "-" + Target Object`
3. Extract the unique list — this is the canonical dependency inventory

The unique dependency list is used two ways during domain assignment:
- Search by `Source Program` to see what a program depends on (downstream)
- Search by `Target Object` to see what depends on a program (upstream)

Traversing up and down this list is the primary method for correctly assigning
ambiguous programs to domains.

---

## 4. Menu Structure Extraction

AS/400 menus define the user-facing application structure. They are the most reliable
source for identifying business domains and sub-domains. Extract them when the application
uses AS/400 native menus.

**Menu file pairs:**

| File | Suffix | Contains |
|------|--------|----------|
| Display file | `.mnudds` | Option numbers and descriptions (DDS source) |
| Command file | `.mnucmd` | Actions for each option |

The command file name = display file name + `QQ`
(e.g., `MNMAIN.mnudds` → `MNMAINQQ.mnucmd`)

**Output columns:** Menu Name, Option Number, Option Description, Action, Action Type
(`Program Call` / `Menu Call` / `OTHER`), Target Name

Use the prompts in Section 6 to extract menu structure via Claude. Two variants:
- **With descriptions** — parses both `.mnudds` and `.mnucmd` (more complete, harder)
- **Without descriptions** — parses `.mnucmd` only (simpler, ~100% coverage)

Run both and use them together. Description mismatches between the two flag parsing errors.

---

## 5. BluInsights Data Integration

BluInsights is a third-party static analysis tool for IBM i. When available, it provides
per-source-file metrics that inform migration sequencing.

**Key metrics per source file:**

| Metric | Meaning |
|--------|---------|
| Cyclomatic Complexity | Decision logic count — higher = harder to migrate and test |
| Total Lines of Source Code | Raw size |
| Effective Lines of Code | Lines excluding blanks and comments |
| Source Dependencies | Objects this file references |
| Source Cross-Domain Dependencies | References to objects in a different domain |
| Target Dependencies | Objects that reference this file |
| Target Cross-Domain Dependencies | References from objects in a different domain |

**Cross-domain dependency counts are the primary sequencing signal.** Files with high
cross-domain source dependencies should migrate later (they depend on other domains).
Files with high cross-domain target dependencies are integration hubs — migrate last.

Merge BluInsights data with the dependency map and domain assignments to produce the
full source file inventory used for migration planning.

---

## 6. Extraction Prompts

These prompts are used with Claude to extract structured dependency data directly from
source code. Each produces a 4-column CSV. Run them when DSPPGMREF or BluInsights data
is unavailable or incomplete.

All prompts share these requirements:
- Case-insensitive matching throughout
- Output filenames in uppercase
- Remove duplicates, sort by Library → Program → Target
- File types to analyze: `CBL`, `CBLLE`, `CLLE`, `CLP`, `RPGLE`, `SQLRPGLE`, `SQLCBLLE`

### Prompt A: Program Calls

**Output columns:** Library Name, Program Name, Target Program, Call String

**Patterns to detect:**
- `CALL PGM(name)`, `CALL "name"`, `CALL name` (CL)
- `SBMJOB CMD(CALL ...)` — extract the embedded CALL
- `EXTPGM('name')` — RPG external program prototype
- `EXTPROC('name')` — RPG external procedure (skip `EXTPROC(*)`)
- `EXEC SQL CALL name` — SQL stored procedure call
- `CALLP name()` — RPG free-format call
- `GO MENU(name)` / `GO name` — menu navigation (treat as program reference)

**Exclusions:** Comment lines (`*`, `//`, `C*`, `--`), system keywords (`QCMDEXC`, `IF`,
`THEN`, `ELSE`, `END`, `DO`, `WHILE`), programs starting with `*`, system commands
(`DLTOVR`, `OVRDBF`, `CHGVAR`, `SNDPGMMSG`, `MONMSG`).

### Prompt B: Database References

**Output columns:** Library Name, Program Name, Database File, Reference String

**Patterns to detect:**
- RPG F-spec: line starts with `F`, contains `DISK` → extract filename after `F`
- RPG free-format: `dcl-f <name> ... disk`
- COBOL: `ASSIGN TO DATABASE-<filename>`, `FD <filename>`
- CL: `DCLF FILE(<filename>)`
- SQL: `FROM`, `JOIN`, `INSERT INTO`, `UPDATE`, `DELETE FROM` clauses
- RPG ops: `CHAIN`, `SETLL`, `READE` followed by filename

**Exclusions:** System files starting with `Q` (except legitimate ones), display files
(`DSP*`), printer files (`PRT*`), QTEMP work files.

### Prompt C: Display File References

**Output columns:** Library Name, Program Name, Display File, Reference String

**Patterns to detect:**
- RPG F-spec: line starts with `F`, contains `WORKSTN`
- RPG free-format: `dcl-f <name> workstn`
- COBOL: `ASSIGN TO WORKSTATION-<filename>` (strip `-SI` suffix)
- CL: `DCLF FILE(<filename>)` where filename has `DS`, `DSP`, or `DISP` prefix

**Note:** `SNDRCVF`, `SNDF`, `RCVF` reference record formats, not file names — use only
to confirm that a display file declared via DCLF is actively used.

### Prompt D: Print File References

**Output columns:** Library Name, Program Name, Print File, Reference String

**Patterns to detect:**
- RPG F-spec: line starts with `F`, contains `PRINTER`
- RPG free-format: `dcl-f <name> printer`
- COBOL: `ASSIGN TO FORMATFILE-<filename>` (strip `-SI` suffix), `ASSIGN TO PRINTER-<name>`
- CL: `OVRPRTF FILE(<filename>)`, `DCLF` with `PRT` or `PR` prefix

**Include** `QSYSPRT` and `QPRINT` (legitimate system print files).
**Exclude** `*PRTF` (generic override placeholder).

### Prompt E: Query References

**Output columns:** Library Name, Program Name, Query Called, Reference String

**Patterns to detect:**
- CL: `RUNQRY QRY(<name>)` — extract query name; skip `QRY(*NONE)`
- CL: `STRQMQRY QMQRY(*LIBL/<name>)` — extract name after library qualifier
- CL/RPG: Dynamic `RUNQRY QRY(&variable)` — record the variable name prefixed with `&`
- COBOL: String literals containing `RUNQRY QRY(<name>)` moved to command strings
- RPG: String assignments or `dcl-c` constants containing `RUNQRY` with query name

**Note:** AS/400 queries are a separate analysis artifact. If the customer uses queries
extensively, collect the full query list (`WRKQRY` output) separately from the source code.

---

## 7. Domain and Subdomain Assignment

Domain assignment for AS/400 systems uses a layered approach. Apply in order:

**Layer 1 — Library name (highest confidence)**
Some libraries map exclusively to one domain by name alone. Document the
customer-specific mappings in the project's `.claude/CLAUDE.md` before
running the pipeline, for example:

```
## AS/400 Library Domain Mappings
- `<TRANSPORTLIB>` → Transportation
- `<TITLELIB>` → Title / DMV Integration
- `<CHECKLIB>` → Financial Management (check printing)
- `<VALUATIONLIB>` → Vehicle / Product Valuation
```

The pipeline will use these mappings as the highest-confidence domain signal
before falling back to menu structure, summaries, or dependency traversal.

**Layer 2 — Menu structure**
The top-level menu options define the primary domains. Map menu branches to domains
and use program-to-menu relationships to classify ambiguous programs.

**Layer 3 — Source file summary**
Use Claude to summarize each source file's intent from comments and code. Consider
abbreviations (e.g., `SLD` = Sold, `INV` = Invoice/Inventory, `DLR` = Dealer).

**Layer 4 — Dependency traversal**
For ambiguous files, traverse the unique dependency list:
- Search Column 2 (Source Program) to find what this program calls → infer from targets
- Search Column 3 (Target Object) to find what calls this program → infer from callers
- Traversing upstream (callers) is often more reliable than downstream (callees)

**Layer 5 — Object description (DSPOBJD `ODOBTX`)**
Use the object description text when code is poorly commented and other signals are weak.

**Output format:** CSV with columns: Source File Name, Library, Primary Domain,
Sub Domain, Confidence Level.

The goal is to have very few files in a generic/uncategorized domain. Iterate until
nearly every file has a meaningful domain assignment.

---

## 8. What Carries Business Logic (Fact Extraction Priority)

When ingesting AS/400 source files into the knowledge graph, prioritize:

- **DSPOBJD output** — object descriptions give domain context for poorly-commented code
- **DSPPGMREF output** — authoritative call and database dependency facts
- **Menu structure CSVs** — application navigation = business domain boundaries
- **Unique dependency list** — program-to-program and program-to-database relationships
- **Domain assignment CSV** — primary classification facts for every source file
- **BluInsights metrics** — complexity and cross-domain dependency counts (migration signals)

For individual source code files, use the language-specific guides (`rpg.md`, `cobol.md`,
`cl.md`, `dds.md`) for fact extraction. This guide covers the environment-level artifacts.
