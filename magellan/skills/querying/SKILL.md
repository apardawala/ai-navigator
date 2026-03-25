---
name: querying
description: Answer questions about the knowledge graph using a combination of direct entity reads, domain summaries, and graph traversal. Use when responding to /magellan:ask queries.
---

# Querying the Knowledge Graph

You answer questions about the client's systems using the knowledge graph. Every
answer must include source citations. You never invent information — if the KG
doesn't have the answer, say so and identify it as an open question.

## Query Strategy

Choose your approach based on the question type:

### Semantic / Overview Questions
"How does billing work?" "What do we know about the title transfer process?"

1. Read the domain summary file at `.magellan/domains/<domain>/summary.json` using
   the Read tool.
2. If the summary answers the question, respond with it + citations.
3. If more detail is needed, read specific entity files for the relevant hubs
   (paths are in the summary's hub list).

### Factual / Lookup Questions
"What is the MANUAL_REVIEW threshold?" "What language is CBBLKBOOK written in?"

1. Identify the likely domain and entity from the question.
2. Use Glob on `.magellan/domains/<domain>/entities/*.json` to find matching
   entity IDs. If you don't know the domain, Glob across all domains:
   `.magellan/domains/*/entities/*.json`.
3. Read the matching entity file using the Read tool.
4. Answer with the specific fact + source citation.

### Structural / Dependency Questions
"What systems does billing depend on?"
"What would break if we decommission the AS/400 batch job?"
"List all components downstream of payment that touch PII data."

1. These require graph traversal — do NOT try to answer from entity files alone.
2. Perform manual graph traversal by reading relationship and cross-domain files,
   then following edges hop-by-hop. See the "Manual Graph Traversal" section below
   for the detailed procedure for each operation type:
   - "depends on" / "connects to" → **walk** (follow outgoing edges)
   - "what depends on" / "affected by" → **impact** (follow incoming edges)
   - "how are X and Y connected" → **between** (BFS from start to end)
   - "which entities have property X" → **filter** (walk + check entity properties)
3. Present the results with the full traversal path.

### Cross-Domain Questions
"How does billing interact with the title system?"
"What data flows between transportation and auction operations?"

1. Read `.magellan/cross_domain.json` using the Read tool to get cross-domain
   edges (SAME_AS links and inter-domain relationships).
2. Perform a manual graph walk starting from the relevant entity to find
   cross-domain paths (see "Manual Graph Traversal" below).
3. Read summaries for both domains for context.

### Cross-Domain Workflow / Saga Questions
"Trace the sale-to-settlement workflow across all domains."
"What happens end-to-end when a vehicle is sold?"
"Show the complete flow from check-in to title transfer with compensation actions."

1. Identify the start and end entities from the question. If the user specifies
   both endpoints, use the **between** traversal to find all paths. If only a
   start is given, use **walk** (outgoing) to trace the full chain.
2. Read `.magellan/cross_domain.json` using the Read tool to understand domain
   boundaries.
3. For each step in the traversal path, read the entity to get its domain,
   type, and summary.
4. Present the results as an **ordered step sequence** with:
   - Step number and domain swimlane
   - Entity name and what happens at this step
   - Domain event that triggers the next step (from relationship edge descriptions)
   - Which domain owns each step
5. Include a **Mermaid sequence diagram** showing the temporal flow across
   domain swimlanes:

```mermaid
sequenceDiagram
    participant SAL as Sales & Auction
    participant FIN as Financial Mgmt
    participant TIT as Title Docs

    SAL->>FIN: SaleCompleted event
    activate FIN
    FIN->>FIN: Calculate fees, generate invoice
    FIN-->>SAL: InvoiceCreated event
    deactivate FIN

    SAL->>TIT: InitiateTitleTransfer
    activate TIT
    alt Title clear
        TIT-->>SAL: TitleTransferApproved
    else Title issue
        TIT-->>SAL: TitleHold raised
        SAL->>FIN: Initiate fee reversal (compensation)
    end
    deactivate TIT
```

6. If the question asks about compensation actions or failure modes, add `alt`
   blocks for each step that can fail, showing the compensation path.
7. If the question asks about SLAs or timeouts, add `Note over` annotations
   where timing constraints are known from the KG.

### Open Questions and Contradictions
"What don't we know about billing?"
"What contradictions have been found?"

1. For domain-specific queries, read the file directly:
   - Open questions: Read `.magellan/domains/<domain>/open_questions.json`
   - Contradictions: Read `.magellan/domains/<domain>/contradictions.json`
2. For cross-domain queries (e.g., "What contradictions have been found?"),
   use Glob to find all files across domains, then read each:
   - Open questions: Glob `.magellan/domains/*/open_questions.json`, then Read each
   - Contradictions: Glob `.magellan/domains/*/contradictions.json`, then Read each
3. Present organized by priority/severity.

---

## Graph Traversal

Use `~/.claude/tools/magellan/kg-query.js` for all graph traversal. The tool handles BFS,
cycle detection, and cross-domain edges deterministically.

### Operations

**Walk** — follow edges from a start entity:
```bash
node ~/.claude/tools/magellan/kg-query.js walk --workspace <path> --start "billing:invoice_generation" --depth 3
```
Use `--direction incoming` for reverse walks (impact analysis).
Use `--edge-types DEPENDS_ON,CALLS` to filter by edge type.

**Impact** — what depends on this entity? (shortcut for reverse walk):
```bash
node ~/.claude/tools/magellan/kg-query.js impact --workspace <path> --start "billing:payment_gateway" --depth 3
```

**Between** — find paths connecting two entities (BFS):
```bash
node ~/.claude/tools/magellan/kg-query.js between --workspace <path> --start "billing:settlement" --end "title:transfer" --depth 5
```

**Neighbors** — list immediate connections:
```bash
node ~/.claude/tools/magellan/kg-query.js neighbors --workspace <path> --entity "billing:invoice_generation"
```

**Stats** — graph overview:
```bash
node ~/.claude/tools/magellan/kg-query.js stats --workspace <path>
```

### Using Results

The tool outputs JSON to stdout. Read the output, then load full entity
files for the entities in the result to add context to your answer.

For **filter queries** ("find all BusinessRule entities downstream of X"),
run a walk, then read each discovered entity and check its `type` field.

### Guardrails

- Default depth is 3. Maximum useful depth is 5.
- The tool handles cycle detection automatically (visited set).
- Cross-domain edges are included automatically.
- If the start entity doesn't exist, the tool errors with a clear message.
- **Honest incompleteness**: If the result set is empty or the paths seem
  incomplete, say so. Never fabricate traversal results.

---

## Answer Validation

After drafting an answer, self-assess before presenting it:

1. **Grounding check**: Can every factual claim trace to a specific KG entity
   with a source quote? List any claim that can't.
2. **Relevance check**: Does the answer address the user's actual question, or
   did retrieval pull related-but-wrong entities?
3. **Completeness check**: Are there KG entities or facts that are clearly
   relevant but weren't included?

Based on this assessment, apply the appropriate confidence tier:

- **High confidence**: All claims trace to KG facts with quotes. Present the
  answer normally with source citations.
- **Mixed confidence**: Some claims are grounded, some are inferred from
  partial evidence. Present the answer with an explicit **Caveats** section
  listing what's uncertain and why.
- **Low confidence**: Most claims can't be traced to KG facts. Do NOT present
  a guess. Instead respond: "The knowledge graph has insufficient evidence to
  answer this question reliably." Then list:
  - What specific information is missing from the KG
  - What materials could be ingested to fill the gap
  - Suggest `/magellan:add` for relevant documents

## Answer Format

Every answer must include:

1. The direct answer to the question
2. Source citations for every factual claim:
   - Entity ID that contains the fact
   - Original source document and location
   - Confidence level
3. Any caveats:
   - Low-confidence facts (weight < 0.5): flag explicitly
   - Contested facts: mention the contradiction
   - Open questions: mention what we don't know
4. **Confidence tier**: State "High confidence", "Mixed confidence", or
   "Low confidence" at the end of the answer.
5. **Sources consulted**: List domains scanned, entities loaded, and which
   contributed to the answer vs. which were loaded but not relevant. This
   makes retrieval observable — when an answer is wrong, the trajectory
   shows where it went wrong.

## Example Answer

Question: "How does invoice processing work?"

> Invoice processing in the billing domain follows a four-state lifecycle:
> DRAFT → ISSUED → PAID, with a MANUAL_REVIEW bypass for invoices exceeding
> $10,000.
>
> The MANUAL_REVIEW threshold is contested — the Q3 ops runbook states $10,000
> (source: Q3_ops_runbook.pdf, page 12, confidence: 0.75) but a database
> config sets it to $5,000 (source: billing_db_config.sql, line 47,
> confidence: 0.90). See contradiction c_001.
>
> The settlement process triggers after an invoice reaches PAID status,
> which in turn initiates title transfer in the title domain.
> (source: billing:settlement_service, evidence from Architecture overview.pdf)
>
> Open question: Is the $10k threshold still active? (oq_003, directed to
> senior_developer, priority: high)
>
> **Mixed confidence** — the lifecycle is well-documented but the threshold
> value is contested.
>
> *Sources consulted: billing domain summary, billing:invoice_generation,
> billing:settlement_service, billing:manual_review_bypass. Scanned but
> not used: billing:fee_schedule.*

## What You Do NOT Do

- Do not invent facts. If the KG doesn't have the information, say "The knowledge
  graph does not contain information about [topic]. This should be raised as an
  open question."
- Do not guess at relationships. Use the manual graph traversal procedure for
  structural questions.
- Do not omit source citations. Every factual claim needs provenance.
- Do not present low-weight entities (< 0.5) as established facts. Qualify them
  as "low-confidence" or "from informal sources."
- Do not hide contradictions. Always surface them when relevant to the question.

## When the KG is Empty or Sparse

If the workspace has few or no entities:
- Say so clearly: "The knowledge graph has N entities across M domains."
- Suggest what materials should be ingested to answer the question.
- Offer to help add materials using `/magellan:add`.
