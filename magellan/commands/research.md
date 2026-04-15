---
description: Research external context for Intent Based Modernization — customer sentiment, competitor analysis, integration alternatives, industry trends. Use after the discovery pipeline has built the knowledge graph. Don't use for KG queries — use /magellan:ask instead.
disable-model-invocation: true
context: fork
argument-hint: <topic> or --from-kg
---

# External Research

Perform web research to supplement the knowledge graph with external context.
Research findings are saved to `.magellan/research/` — they are NOT auto-ingested
into the KG. The user reviews findings and selectively ingests what's relevant.

## Usage

```
/magellan:research <topic>           Research a specific topic
/magellan:research --from-kg         Auto-generate research topics from the KG
```

## Ad-Hoc Research

When a topic is provided:

1. **Frame the research.** Decompose the topic into 3-5 sub-questions across
   these categories:
   - **Customer sentiment**: How do users experience this? What do they like/dislike?
   - **Competitor analysis**: How do competitors handle this? Where are they better?
   - **Alternative integrations**: For any 3rd-party dependency, are there better
     alternatives available today?
   - **Industry trends**: Where is the industry heading? What's the system of
     the future look like?
   Not every category applies to every topic — use the ones that fit.

2. **Research each sub-question.** Use WebFetch to find relevant sources.
   For each finding:
   - Record the source URL and access date
   - Extract the key insight in 1-2 sentences
   - Assess reliability: official docs > industry reports > blog posts > forums

3. **Write the report** to `.magellan/research/<topic-slug>.md`:

   ```markdown
   # Research: <Topic>

   Researched: <date>
   KG context: <relevant entity IDs, if any>

   ## Customer Sentiment
   - <finding> — [source](url), accessed <date>

   ## Competitor Analysis
   - <finding> — [source](url), accessed <date>

   ## Alternative Integrations
   - <finding> — [source](url), accessed <date>

   ## Industry Trends
   - <finding> — [source](url), accessed <date>

   ## Strategic Assessment
   <2-3 paragraph synthesis: what does this mean for the system's future?>

   ---
   To ingest specific findings into the KG:
     /magellan:add .magellan/research/<topic-slug>.md
   ```

4. **Display summary**: Topic, number of sources consulted, key findings per
   category, path to the report.

## KG-Driven Research (`--from-kg`)

When `--from-kg` is specified, auto-generate research topics from the knowledge
graph:

1. **Read the KG.** If `.magellan/index.json` doesn't exist or has zero
   entities, display: "No knowledge graph found. Run /magellan first to
   build the KG, then research." and stop.
   Otherwise, scan entity types across all domains:
   - `Integration` entities → research alternative integrations
   - `Service` entities with external dependencies → research vendor landscape
   - `Component` entities tagged as customer-facing → research customer sentiment
   - Entities referenced in contradictions → research industry best practices

2. **Generate topic list.** Present the topics to the user for approval before
   researching. Example:

   ```
   Proposed research topics (from KG):
     1. Payment Gateway alternatives (billing:stripe_integration)
     2. Customer sentiment on dealer portal (dealer:dealer_portal)
     3. AS/400 modernization approaches (infrastructure:as400_batch)
     4. Title transfer industry standards (title:title_transfer_process)

   Research all, or select specific numbers? [all/1,2,3...]
   ```

3. **Research approved topics** using the ad-hoc workflow above, one report
   per topic.

4. **Display summary**: Total topics researched, reports generated, paths.

5. **Log**: `node ~/.claude/tools/magellan/kg-ops.js log --workspace <path>
   --action research --detail "<topic> — report generated at .magellan/research/<file>"`.

## Rules

- Every finding MUST have a source URL. No unsourced claims.
- Research reports go to `.magellan/research/`, never directly to
  `domains/`. The user decides what to ingest.
- If WebFetch fails for a URL, retry once. If it fails again, note the
  failure in the report and move on. Do NOT silently skip.
- Keep reports factual. The Strategic Assessment section can be opinionated
  but must be grounded in the findings above it.
