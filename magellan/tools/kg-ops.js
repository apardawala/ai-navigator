#!/usr/bin/env node
// Magellan KG Operations Tool — deterministic pipeline operations
// Handles verification, counting, hashing, and state management.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ---------------------------------------------------------------------------
// Enums (single source of truth — mirrors file-conventions)
// ---------------------------------------------------------------------------

const DISPOSITIONS = [
  'extracted', 'ingested', 'cataloged', 'no_facts', 'no_text', 'unreadable',
  'extraction_error', 'skipped_unchanged', 'skipped_by_rule'
];

const ENTITY_TYPES = [
  'BusinessProcess', 'BusinessRule', 'Component', 'Service', 'Database',
  'DataEntity', 'Integration', 'Infrastructure', 'Person', 'Team',
  'Operational', 'Constraint'
];

const EDGE_TYPES = [
  'DEPENDS_ON', 'CALLS', 'READS_FROM', 'WRITES_TO', 'INTEGRATES_WITH',
  'ENFORCES', 'CONTAINS', 'TRIGGERS', 'PRODUCES', 'CONSUMES',
  'PART_OF', 'SUCCEEDED_BY', 'SAME_AS', 'SHARES_DATA_WITH'
];

const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low'];
const PRIORITY_LEVELS = ['critical', 'high', 'medium', 'low'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    } else {
      positional.push(argv[i]);
    }
  }
  return { command: positional[0], args };
}

function require_arg(args, name) {
  if (!args[name]) {
    process.stderr.write(`ERROR: Missing required argument --${name}\n`);
    process.exit(1);
  }
  return args[name];
}

function read_json(filepath) {
  if (!fs.existsSync(filepath)) return null;
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function write_json(filepath, data) {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const content = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(filepath, content, 'utf8');
  JSON.parse(fs.readFileSync(filepath, 'utf8')); // post-write validation
}

function resolve_mg(args) {
  const ws = require_arg(args, 'workspace');
  const mg = path.join(ws, '.magellan');
  if (!fs.existsSync(mg)) {
    process.stderr.write(`ERROR: No .magellan/ directory at ${ws}\n`);
    process.exit(1);
  }
  return { ws, mg };
}

function get_domains(mg) {
  return fs.readdirSync(path.join(mg, 'domains')).filter(d =>
    fs.statSync(path.join(mg, 'domains', d)).isDirectory()
  );
}

function validate_enum(val, allowed, label) {
  if (!allowed.includes(val)) {
    process.stderr.write(`ERROR: Invalid ${label} "${val}" (valid: ${allowed.join(', ')})\n`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------

const LOG_ACTIONS = [
  'pipeline', 'ingest', 'query', 'resolve', 'correction',
  'add-entity', 'modify-entity', 'add-edge', 'remove-edge',
  'add-contradiction', 'add-question', 'add-domain',
  'quality-gate', 'compress', 'codebase', 'research', 'summary'
];

function get_git_user() {
  try {
    return execSync('git config user.name', { encoding: 'utf8' }).trim();
  } catch (_) {
    try {
      return require('os').userInfo().username;
    } catch (_) {
      return 'unknown';
    }
  }
}

function cmd_log(args) {
  const { mg } = resolve_mg(args);
  const action = require_arg(args, 'action');
  validate_enum(action, LOG_ACTIONS, 'action');
  const detail = require_arg(args, 'detail');
  const user = get_git_user();
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  const logFile = path.join(mg, 'log.md');
  if (!fs.existsSync(logFile)) {
    fs.writeFileSync(logFile, '# Magellan Activity Log\n\n', 'utf8');
  }

  const entry = `- ${timestamp} | ${action} | ${user} | ${detail}\n`;
  fs.appendFileSync(logFile, entry, 'utf8');
  console.log(`Logged: ${action} | ${detail}`);
}

// ---------------------------------------------------------------------------
// Summary generation (wake-up mode)
// ---------------------------------------------------------------------------

function cmd_summary(args) {
  const { mg } = resolve_mg(args);
  const domains = fs.existsSync(path.join(mg, 'domains'))
    ? get_domains(mg) : [];

  const state = read_json(path.join(mg, 'state.json')) || {};
  const index = read_json(path.join(mg, 'index.json')) || {};

  // Domain overview
  const domainLines = [];
  const thinDomains = [];
  for (const domain of domains) {
    const stats = (index.domains && index.domains[domain]) || {};
    const ec = stats.entity_count || 0;
    const edg = stats.edge_count || 0;
    const cc = stats.contradiction_count || 0;
    const qc = stats.question_count || 0;
    domainLines.push(`  ${domain}: ${ec} entities, ${edg} edges, ${cc} contradictions, ${qc} open questions`);
    if (ec < 5) thinDomains.push(domain);
  }

  // Top contradictions (by severity: critical > high > medium > low)
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const allContradictions = [];
  for (const domain of domains) {
    const cFile = path.join(mg, 'domains', domain, 'contradictions.json');
    const cData = read_json(cFile);
    if (cData && cData.active) {
      for (const c of cData.active) {
        allContradictions.push({ ...c, domain });
      }
    }
  }
  allContradictions.sort((a, b) =>
    (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3)
  );
  const topContradictions = allContradictions.slice(0, 5);

  // Top open questions (by priority)
  const allQuestions = [];
  for (const domain of domains) {
    const qFile = path.join(mg, 'domains', domain, 'open_questions.json');
    const qData = read_json(qFile);
    if (qData && qData.active) {
      for (const q of qData.active) {
        allQuestions.push({ ...q, domain });
      }
    }
  }
  allQuestions.sort((a, b) =>
    (severityOrder[a.priority] || 3) - (severityOrder[b.priority] || 3)
  );
  const topQuestions = allQuestions.slice(0, 5);

  // Recent log entries
  const logFile = path.join(mg, 'log.md');
  let recentLog = [];
  if (fs.existsSync(logFile)) {
    const lines = fs.readFileSync(logFile, 'utf8').split('\n')
      .filter(l => l.startsWith('- '));
    recentLog = lines.slice(-5);
  }

  // Build markdown
  const parts = [];
  parts.push('# Magellan Summary');
  parts.push('');
  parts.push('> Auto-generated at commit time. Do not edit manually.');
  parts.push('');

  // Pipeline state
  if (state.pipeline_step || state.session_notes) {
    parts.push('## Pipeline State');
    if (state.pipeline_step) parts.push(`  Step: ${state.pipeline_step}`);
    if (state.session_notes) parts.push(`  Notes: ${state.session_notes}`);
    parts.push('');
  }

  // Domains
  parts.push(`## Domains (${domains.length})`);
  if (domainLines.length > 0) {
    parts.push(domainLines.join('\n'));
  } else {
    parts.push('  No domains yet.');
  }
  parts.push(`  Totals: ${index.total_entities || 0} entities, ${index.total_edges || 0} edges`);
  parts.push('');

  // Thin coverage
  if (thinDomains.length > 0) {
    parts.push('## Thin Coverage');
    parts.push(`  ${thinDomains.join(', ')} — fewer than 5 entities, needs more source materials`);
    parts.push('');
  }

  // Top contradictions
  if (topContradictions.length > 0) {
    parts.push(`## Top Contradictions (${allContradictions.length} active)`);
    for (const c of topContradictions) {
      parts.push(`  [${c.severity}] ${c.contradiction_id} (${c.domain}): ${c.description}`);
    }
    parts.push('');
  }

  // Top open questions
  if (topQuestions.length > 0) {
    parts.push(`## Top Open Questions (${allQuestions.length} active)`);
    for (const q of topQuestions) {
      parts.push(`  [${q.priority}] ${q.question_id} (${q.domain}): ${q.question}`);
    }
    parts.push('');
  }

  // Recent activity
  if (recentLog.length > 0) {
    parts.push('## Recent Activity');
    for (const line of recentLog) {
      parts.push(line);
    }
    parts.push('');
  }

  const content = parts.join('\n') + '\n';
  const summaryFile = path.join(mg, 'summary.md');
  fs.writeFileSync(summaryFile, content, 'utf8');
  console.log(`Generated summary.md (${domains.length} domains, ${allContradictions.length} contradictions, ${allQuestions.length} open questions)`);
}

// ---------------------------------------------------------------------------
// Graph visualization
// ---------------------------------------------------------------------------

function cmd_graph(args) {
  const { mg } = resolve_mg(args);
  const domains = fs.existsSync(path.join(mg, 'domains'))
    ? get_domains(mg) : [];

  const nodes = [];
  const edges = [];
  const domainColors = {};
  const palette = [
    '#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f',
    '#edc948','#b07aa1','#ff9da7','#9c755f','#bab0ac'
  ];

  // Collect entities as nodes
  for (let di = 0; di < domains.length; di++) {
    const domain = domains[di];
    domainColors[domain] = palette[di % palette.length];
    const entityDir = path.join(mg, 'domains', domain, 'entities');
    if (!fs.existsSync(entityDir)) continue;
    for (const ef of fs.readdirSync(entityDir).filter(f => f.endsWith('.json'))) {
      const entity = read_json(path.join(entityDir, ef));
      if (!entity) continue;
      nodes.push({
        id: entity.entity_id,
        label: entity.name || ef.replace('.json', ''),
        domain: domain,
        type: entity.type || '',
        summary: (entity.summary || '').substring(0, 200),
        color: domainColors[domain]
      });
    }
  }

  // Collect intra-domain edges
  for (const domain of domains) {
    const relFile = path.join(mg, 'domains', domain, 'relationships.json');
    const relData = read_json(relFile);
    if (relData && relData.edges) {
      for (const e of relData.edges) {
        edges.push({ from: e.from, to: e.to, label: e.type, color: '#999' });
      }
    }
  }

  // Collect cross-domain edges
  const crossFile = path.join(mg, 'cross_domain.json');
  const crossData = read_json(crossFile);
  if (crossData && crossData.edges) {
    for (const e of crossData.edges) {
      edges.push({ from: e.from, to: e.to, label: e.type, color: '#e15759', dashes: true });
    }
  }

  // Build legend
  const legendItems = domains.map(d =>
    `<span style="display:inline-block;width:12px;height:12px;background:${domainColors[d]};border-radius:2px;margin-right:4px;vertical-align:middle;"></span>${d}`
  ).join('&nbsp;&nbsp;&nbsp;');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Magellan Knowledge Graph</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1a2e; color: #e0e0e0; }
  #header { padding: 12px 20px; background: #16213e; display: flex; justify-content: space-between; align-items: center; }
  #header h1 { font-size: 16px; font-weight: 600; }
  #legend { font-size: 12px; }
  #stats { font-size: 12px; opacity: 0.7; }
  #graph { width: 100%; height: calc(100vh - 90px); }
  #detail { position: fixed; bottom: 0; left: 0; right: 0; background: #16213e; padding: 10px 20px; font-size: 13px; border-top: 1px solid #333; min-height: 44px; }
  #detail .name { font-weight: 600; font-size: 14px; }
  #detail .meta { opacity: 0.7; margin-top: 2px; }
  #search { position: fixed; top: 50px; right: 20px; z-index: 10; }
  #search input { background: #16213e; border: 1px solid #444; color: #e0e0e0; padding: 6px 10px; border-radius: 4px; width: 200px; font-size: 13px; }
</style>
<script src="https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js"></script>
</head>
<body>
<div id="header">
  <h1>Magellan Knowledge Graph</h1>
  <div id="legend">${legendItems}</div>
  <div id="stats">${nodes.length} entities &middot; ${edges.length} edges &middot; ${domains.length} domains</div>
</div>
<div id="search"><input type="text" id="searchInput" placeholder="Search entities..."></div>
<div id="graph"></div>
<div id="detail">Click a node to see details.</div>
<script>
const nodesData = ${JSON.stringify(nodes)};
const edgesData = ${JSON.stringify(edges)};
const nodes = new vis.DataSet(nodesData.map(n => ({
  id: n.id, label: n.label, color: { background: n.color, border: n.color, highlight: { background: '#fff', border: n.color }},
  font: { color: '#e0e0e0', size: 12 }, shape: 'dot', size: 10,
  _domain: n.domain, _type: n.type, _summary: n.summary
})));
const edges = new vis.DataSet(edgesData.map((e, i) => ({
  id: i, from: e.from, to: e.to, label: e.label,
  color: { color: e.color, highlight: '#fff' }, dashes: e.dashes || false,
  font: { color: '#888', size: 9, strokeWidth: 0 }, arrows: 'to', smooth: { type: 'curvedCW', roundness: 0.15 }
})));
const container = document.getElementById('graph');
const network = new vis.Network(container, { nodes, edges }, {
  physics: { barnesHut: { gravitationalConstant: -3000, springLength: 120, damping: 0.3 }},
  interaction: { hover: true, tooltipDelay: 100 }
});
network.on('click', function(params) {
  const detail = document.getElementById('detail');
  if (params.nodes.length > 0) {
    const n = nodesData.find(x => x.id === params.nodes[0]);
    if (n) detail.innerHTML = '<span class="name">' + n.id + '</span><div class="meta">' + n.type + ' &middot; ' + n.domain + (n.summary ? ' &middot; ' + n.summary : '') + '</div>';
  } else { detail.innerHTML = 'Click a node to see details.'; }
});
document.getElementById('searchInput').addEventListener('input', function(e) {
  const q = e.target.value.toLowerCase();
  if (!q) { nodes.forEach(n => nodes.update({ id: n.id, hidden: false })); return; }
  nodesData.forEach(n => { nodes.update({ id: n.id, hidden: !n.label.toLowerCase().includes(q) && !n.id.toLowerCase().includes(q) }); });
});
</script>
</body>
</html>`;

  const graphFile = path.join(mg, 'graph.html');
  fs.writeFileSync(graphFile, html, 'utf8');
  console.log(`Generated graph.html (${nodes.length} nodes, ${edges.length} edges, ${domains.length} domains)`);
}

// ---------------------------------------------------------------------------
// State management
// ---------------------------------------------------------------------------

function cmd_update_state(args) {
  const { mg } = resolve_mg(args);
  const stateFile = path.join(mg, 'state.json');
  const state = read_json(stateFile) || {};

  if (args.step) {
    const newStep = parseInt(args.step, 10);
    const currentStep = state.pipeline_step || 0;

    // Enforce: can only advance one step at a time (unless --force)
    if (!args.force && newStep > currentStep + 1) {
      process.stderr.write(`ERROR: Cannot jump from step ${currentStep} to step ${newStep}. Steps must advance sequentially. Use --force to override.\n`);
      process.exit(1);
    }

    // Enforce: quality gate must be logged for previous step before advancing
    if (!args.force && newStep > 1 && currentStep > 0) {
      const feedbackFile = path.join(mg, 'pipeline_feedback.json');
      const feedback = read_json(feedbackFile) || { steps: [] };
      const prevGate = feedback.steps.find(s => s.step === currentStep && s.type === 'quality_gate');
      if (!prevGate) {
        process.stderr.write(`ERROR: No quality gate recorded for step ${currentStep}. Run quality-gate --step ${currentStep} before advancing. Use --force to override.\n`);
        process.exit(1);
      }
    }

    state.pipeline_step = newStep;
  }
  if (args.notes) state.session_notes = args.notes;
  if (args['clear-step']) delete state.pipeline_step;

  if (args['set-last-run']) {
    state.last_run = {
      timestamp: new Date().toISOString(),
      mode: args.mode || 'full',
      file_count: parseInt(args['file-count'] || '0', 10)
    };
  }

  write_json(stateFile, state);
  console.log(`Updated state.json (step: ${state.pipeline_step || 'none'})`);
}

function cmd_update_processed(args) {
  const { mg } = resolve_mg(args);
  const file = require_arg(args, 'file');
  const disposition = require_arg(args, 'disposition');
  validate_enum(disposition, DISPOSITIONS, 'disposition');

  // Enforce: 'ingested' requires at least one fact referencing this file
  if (disposition === 'ingested') {
    const domainsDir = path.join(mg, 'domains');
    let factFound = false;
    if (fs.existsSync(domainsDir)) {
      for (const domain of fs.readdirSync(domainsDir)) {
        const factsDir = path.join(domainsDir, domain, 'facts');
        if (!fs.existsSync(factsDir)) continue;
        for (const f of fs.readdirSync(factsDir).filter(f => f.endsWith('.json'))) {
          const factData = read_json(path.join(factsDir, f));
          if (factData && factData.source_document === file) {
            factFound = true;
            break;
          }
        }
        if (factFound) break;
      }
    }
    if (!factFound) {
      process.stderr.write(`ERROR: Cannot mark "${file}" as ingested — no facts reference this file. Use 'cataloged' for files scanned but not deeply extracted.\n`);
      process.exit(1);
    }
  }

  const domain = args.domain || null;
  const factCount = args['fact-count'] ? parseInt(args['fact-count'], 10) : 0;
  const hash = args.hash || null;
  const error = args.error || null;

  const pfFile = path.join(mg, 'processed_files.json');
  const data = read_json(pfFile) || { files: {} };

  const entry = {
    disposition,
    domain,
    fact_count: factCount,
    processed_at: new Date().toISOString()
  };
  if (hash) entry.content_hash = hash;
  if (error) entry.error = error;

  data.files[file] = entry;
  write_json(pfFile, data);
  console.log(`Updated processed_files.json: ${file} → ${disposition}`);
}

function cmd_quality_gate(args) {
  const { mg } = resolve_mg(args);
  const step = parseInt(require_arg(args, 'step'), 10);

  const blockers = [];
  const warnings = [];

  const domains = fs.existsSync(path.join(mg, 'domains')) ? get_domains(mg) : [];
  const pfFile = path.join(mg, 'processed_files.json');
  const pfData = read_json(pfFile) || { files: {} };

  // Step-specific checks
  if (step === 1) {
    // Must have domains registered and files discovered
    const domainsFile = read_json(path.join(mg, 'domains.json'));
    if (!domainsFile || !domainsFile.domains || domainsFile.domains.length === 0) {
      blockers.push('No domains registered');
    }
    const fileCount = Object.keys(pfData.files || {}).length;
    if (fileCount === 0) warnings.push('No files tracked in processed_files.json');
  }

  if (step === 2) {
    // Must have facts extracted, all files accounted for
    let totalFacts = 0;
    let filesWithFacts = new Set();
    for (const domain of domains) {
      const factsDir = path.join(mg, 'domains', domain, 'facts');
      if (!fs.existsSync(factsDir)) continue;
      for (const f of fs.readdirSync(factsDir).filter(f => f.endsWith('.json'))) {
        const factData = read_json(path.join(factsDir, f));
        if (factData && factData.facts) {
          totalFacts += factData.facts.length;
          filesWithFacts.add(factData.source_document);
        }
      }
    }
    if (totalFacts === 0) blockers.push('No facts extracted from any file');
    if (totalFacts < 10) warnings.push(`Only ${totalFacts} facts extracted — expected more for a meaningful KG`);

    // Check for files marked ingested without facts
    const ingestedNoFacts = [];
    for (const [file, entry] of Object.entries(pfData.files || {})) {
      if (entry.disposition === 'ingested' && !filesWithFacts.has(file)) {
        ingestedNoFacts.push(file);
      }
    }
    if (ingestedNoFacts.length > 0) {
      blockers.push(`${ingestedNoFacts.length} files marked 'ingested' but have no facts: ${ingestedNoFacts.slice(0, 3).join(', ')}${ingestedNoFacts.length > 3 ? '...' : ''}`);
    }
  }

  if (step === 3) {
    // Must have entities created
    let entityCount = 0;
    for (const domain of domains) {
      const entDir = path.join(mg, 'domains', domain, 'entities');
      if (!fs.existsSync(entDir)) continue;
      entityCount += fs.readdirSync(entDir).filter(f => f.endsWith('.json')).length;
    }
    if (entityCount === 0) blockers.push('No entities created');

    // Entities should have summaries >= 50 chars
    let shortSummaries = 0;
    for (const domain of domains) {
      const entDir = path.join(mg, 'domains', domain, 'entities');
      if (!fs.existsSync(entDir)) continue;
      for (const f of fs.readdirSync(entDir).filter(f => f.endsWith('.json'))) {
        const ent = read_json(path.join(entDir, f));
        if (ent && ent.summary && ent.summary.length < 50) shortSummaries++;
      }
    }
    if (shortSummaries > 0) warnings.push(`${shortSummaries} entities have summaries under 50 chars`);
  }

  if (step >= 4) {
    // Should have relationships
    let edgeCount = 0;
    for (const domain of domains) {
      const relFile = path.join(mg, 'domains', domain, 'relationships.json');
      const relData = read_json(relFile);
      if (relData && relData.edges) edgeCount += relData.edges.length;
    }
    const crossFile = path.join(mg, 'cross_domain.json');
    const crossData = read_json(crossFile);
    if (crossData && crossData.edges) edgeCount += crossData.edges.length;
    if (edgeCount === 0 && domains.length >= 2) warnings.push('No relationships found despite multiple domains');
  }

  if (step >= 6) {
    // Should have domain summaries
    let missingSummaries = [];
    for (const domain of domains) {
      const summaryFile = path.join(mg, 'domains', domain, 'summary.json');
      if (!fs.existsSync(summaryFile)) missingSummaries.push(domain);
    }
    if (missingSummaries.length > 0) blockers.push(`Missing domain summaries: ${missingSummaries.join(', ')}`);
  }

  if (step >= 7) {
    // Must have onboarding guide
    if (!fs.existsSync(path.join(mg, 'onboarding_guide.md'))) {
      blockers.push('onboarding_guide.md not found');
    }
  }

  // Write to pipeline_feedback.json
  const feedbackFile = path.join(mg, 'pipeline_feedback.json');
  const feedback = read_json(feedbackFile) || { steps: [] };
  const entry = {
    step,
    type: 'quality_gate',
    result: blockers.length > 0 ? 'fail' : 'pass',
    blockers,
    warnings,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString()
  };
  feedback.steps.push(entry);
  write_json(feedbackFile, feedback);

  // Display
  console.log(`Quality Gate — Step ${step}: ${entry.result.toUpperCase()}`);
  if (blockers.length > 0) {
    console.log(`  BLOCKERS (${blockers.length}):`);
    for (const b of blockers) console.log(`    ✗ ${b}`);
  }
  if (warnings.length > 0) {
    console.log(`  WARNINGS (${warnings.length}):`);
    for (const w of warnings) console.log(`    ⚠ ${w}`);
  }
  if (blockers.length === 0 && warnings.length === 0) {
    console.log('  All checks passed.');
  }

  if (blockers.length > 0) process.exit(1);
}

function cmd_rebuild_index(args) {
  const { mg } = resolve_mg(args);
  const domains = get_domains(mg);
  const index = { domains: {}, total_entities: 0, total_edges: 0 };

  for (const domain of domains) {
    const domainDir = path.join(mg, 'domains', domain);
    const entityDir = path.join(domainDir, 'entities');
    const entityCount = fs.existsSync(entityDir)
      ? fs.readdirSync(entityDir).filter(f => f.endsWith('.json')).length
      : 0;

    const relFile = path.join(domainDir, 'relationships.json');
    const relData = read_json(relFile);
    const edgeCount = relData && relData.edges ? relData.edges.length : 0;

    const cFile = path.join(domainDir, 'contradictions.json');
    const cData = read_json(cFile);
    const contradictionCount = cData ? (cData.active || []).length : 0;

    const qFile = path.join(domainDir, 'open_questions.json');
    const qData = read_json(qFile);
    const questionCount = qData ? (qData.active || []).length : 0;

    index.domains[domain] = {
      entity_count: entityCount,
      edge_count: edgeCount,
      contradiction_count: contradictionCount,
      question_count: questionCount
    };
    index.total_entities += entityCount;
    index.total_edges += edgeCount;
  }

  // Add cross-domain edges
  const crossFile = path.join(mg, 'cross_domain.json');
  const crossData = read_json(crossFile);
  if (crossData && crossData.edges) {
    index.total_edges += crossData.edges.length;
  }

  // Add cross-domain contradictions
  const crossContraFile = path.join(mg, 'cross_domain_contradictions.json');
  const crossContraData = read_json(crossContraFile);
  index.cross_domain_contradictions = crossContraData ? (crossContraData.active || []).length : 0;

  write_json(path.join(mg, 'index.json'), index);
  console.log(`Rebuilt index.json: ${index.total_entities} entities, ${index.total_edges} edges across ${domains.length} domains (${index.cross_domain_contradictions} cross-domain contradictions)`);
}

// ---------------------------------------------------------------------------
// Hash operations
// ---------------------------------------------------------------------------

function cmd_hash_check(args) {
  const { ws, mg } = resolve_mg(args);
  const pfData = read_json(path.join(mg, 'processed_files.json')) || { files: {} };

  // Find all workspace files (excluding .magellan/ and .git/)
  const allFiles = [];
  function walk(dir, rel) {
    for (const entry of fs.readdirSync(dir)) {
      if (entry.startsWith('.') || entry === 'node_modules') continue;
      const full = path.join(dir, entry);
      const relPath = rel ? `${rel}/${entry}` : entry;
      if (fs.statSync(full).isDirectory()) {
        walk(full, relPath);
      } else {
        allFiles.push(relPath);
      }
    }
  }
  walk(ws, '');

  const force = !!args.force;
  const results = { new: [], changed: [], unchanged: [], forced: [], total: allFiles.length };

  for (const file of allFiles) {
    const fullPath = path.join(ws, file);
    const currentHash = execSync(`shasum -a 256 "${fullPath}" | cut -d' ' -f1`, { encoding: 'utf8' }).trim();
    const stored = pfData.files[file];

    if (!stored) {
      results.new.push({ file, hash: `sha256:${currentHash}` });
    } else if (force && stored.content_hash === `sha256:${currentHash}`) {
      results.forced.push({ file, hash: `sha256:${currentHash}`, domain: stored.domain });
    } else if (stored.content_hash !== `sha256:${currentHash}`) {
      results.changed.push({
        file,
        old_hash: stored.content_hash,
        new_hash: `sha256:${currentHash}`,
        domain: stored.domain
      });
    } else {
      results.unchanged.push(file);
    }
  }

  console.log(JSON.stringify(results, null, 2));
}

// ---------------------------------------------------------------------------
// Verification operations
// ---------------------------------------------------------------------------

function cmd_verify_ledger(args) {
  const { ws, mg } = resolve_mg(args);
  const pfData = read_json(path.join(mg, 'processed_files.json')) || { files: {} };

  const allFiles = [];
  function walk(dir, rel) {
    for (const entry of fs.readdirSync(dir)) {
      if (entry.startsWith('.') || entry === 'node_modules') continue;
      const full = path.join(dir, entry);
      const relPath = rel ? `${rel}/${entry}` : entry;
      if (fs.statSync(full).isDirectory()) {
        walk(full, relPath);
      } else {
        allFiles.push(relPath);
      }
    }
  }
  walk(ws, '');

  const ledgerFiles = Object.keys(pfData.files);
  const missingFiles = allFiles.filter(f => !ledgerFiles.includes(f));
  const staleFiles = ledgerFiles.filter(f => !allFiles.includes(f));

  const missing = missingFiles.map(f => ({
    file: f,
    issue: 'on disk but not in ledger',
    suggested_repair: `node kg-ops.js update-processed --workspace ${ws} --file "${f}" --disposition skipped_by_rule`
  }));

  const stale = staleFiles.map(f => ({
    file: f,
    issue: 'in ledger but not on disk',
    prior_disposition: pfData.files[f]?.disposition,
    suggested_repair: `node kg-ops.js remove-processed --workspace ${ws} --file "${f}"`
  }));

  const pass = missing.length === 0 && stale.length === 0;
  const message = pass
    ? `Ledger: ${allFiles.length}/${allFiles.length} files accounted for`
    : `${missing.length} untracked, ${stale.length} stale — run suggested_repair commands to reconcile`;

  console.log(JSON.stringify({
    workspace_files: allFiles.length,
    ledger_entries: ledgerFiles.length,
    missing,
    stale,
    pass,
    message
  }, null, 2));
}

function cmd_remove_processed(args) {
  const { mg } = resolve_mg(args);
  const file = require_arg(args, 'file');

  const pfFile = path.join(mg, 'processed_files.json');
  const data = read_json(pfFile) || { files: {} };

  if (!data.files[file]) {
    process.stderr.write(`WARNING: "${file}" not found in ledger — nothing to remove\n`);
    return;
  }

  delete data.files[file];
  write_json(pfFile, data);
  console.log(`Removed "${file}" from processed_files.json`);
}

function cmd_verify_quotes(args) {
  const { ws, mg } = resolve_mg(args);
  const domains = get_domains(mg);
  const results = { verified: 0, failed: 0, errors: [] };

  for (const domain of domains) {
    const factsDir = path.join(mg, 'domains', domain, 'facts');
    if (!fs.existsSync(factsDir)) continue;

    for (const factFile of fs.readdirSync(factsDir).filter(f => f.endsWith('.json'))) {
      let data;
      try {
        data = read_json(path.join(factsDir, factFile));
      } catch (e) {
        results.failed++;
        results.errors.push({ domain, file: factFile, error: `Parse error: ${e.message}` });
        continue;
      }
      if (!data || !data.facts) {
        results.failed++;
        results.errors.push({ domain, file: factFile, error: !data ? 'File empty or unreadable' : 'No facts array in file' });
        continue;
      }

      for (const fact of data.facts) {
        if (!fact.source || !fact.source.quote || !fact.source.document) {
          results.failed++;
          results.errors.push({
            domain,
            file: factFile,
            statement: fact.statement,
            error: 'Missing source quote or document'
          });
          continue;
        }

        const sourceFile = path.join(ws, fact.source.document);
        if (!fs.existsSync(sourceFile)) {
          results.failed++;
          results.errors.push({
            domain,
            file: factFile,
            statement: fact.statement,
            error: `Source file not found: ${fact.source.document}`
          });
          continue;
        }

        // Take a distinctive substring (20+ chars) and grep
        const quote = fact.source.quote;
        const searchStr = quote.length > 30
          ? quote.substring(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          : quote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        try {
          execSync(`grep -qF "${searchStr.replace(/"/g, '\\"')}" "${sourceFile}"`, { encoding: 'utf8' });
          results.verified++;
        } catch (_) {
          results.failed++;
          results.errors.push({
            domain,
            file: factFile,
            statement: fact.statement,
            quote: quote.substring(0, 80),
            source: fact.source.document,
            error: 'Quote not found in source document'
          });
        }
      }
    }
  }

  results.total = results.verified + results.failed;
  results.pass = results.failed === 0;
  console.log(JSON.stringify(results, null, 2));
}

function cmd_verify_edges(args) {
  const { mg } = resolve_mg(args);
  const domains = get_domains(mg);
  const results = { verified: 0, dangling: 0, errors: [] };

  // Collect all entity IDs that exist as files
  const existingEntities = new Set();
  for (const domain of domains) {
    const entityDir = path.join(mg, 'domains', domain, 'entities');
    if (!fs.existsSync(entityDir)) continue;
    for (const f of fs.readdirSync(entityDir).filter(f => f.endsWith('.json'))) {
      const name = f.replace('.json', '');
      existingEntities.add(`${domain}:${name}`);
    }
  }

  // Derive domain from source string for repair commands
  function domain_from_source(source) {
    if (source === 'cross_domain.json') return '_cross_domain';
    return source.split('/')[0];
  }

  // Check all edges
  function checkEdges(edges, source) {
    const domain = domain_from_source(source);
    for (const edge of edges) {
      let ok = true;
      const removeCmd = `node kg-write.js remove-edge --workspace ${mg.replace('/.magellan', '')} --domain ${domain} --from "${edge.from}" --to "${edge.to}" --type ${edge.type}`;
      if (!existingEntities.has(edge.from)) {
        results.dangling++;
        results.errors.push({
          source, from: edge.from, to: edge.to, type: edge.type,
          error: `from entity "${edge.from}" not found`,
          suggested_repair: removeCmd
        });
        ok = false;
      }
      if (!existingEntities.has(edge.to)) {
        results.dangling++;
        results.errors.push({
          source, from: edge.from, to: edge.to, type: edge.type,
          error: `to entity "${edge.to}" not found`,
          suggested_repair: removeCmd
        });
        ok = false;
      }
      if (ok) results.verified++;
    }
  }

  // Intra-domain
  for (const domain of domains) {
    const relFile = path.join(mg, 'domains', domain, 'relationships.json');
    const data = read_json(relFile);
    if (data && data.edges) checkEdges(data.edges, `${domain}/relationships.json`);
  }

  // Cross-domain
  const crossFile = path.join(mg, 'cross_domain.json');
  const crossData = read_json(crossFile);
  if (crossData && crossData.edges) checkEdges(crossData.edges, 'cross_domain.json');

  results.total = results.verified + results.dangling;
  results.pass = results.dangling === 0;
  console.log(JSON.stringify(results, null, 2));
}

function cmd_verify_coverage(args) {
  const { mg } = resolve_mg(args);
  const pfData = read_json(path.join(mg, 'processed_files.json')) || { files: {} };
  const domains = get_domains(mg);

  const coverage = [];

  for (const [file, info] of Object.entries(pfData.files)) {
    if (info.disposition !== 'ingested') {
      coverage.push({ file, disposition: info.disposition, facts: 0, entities: 0, domain: info.domain || '—' });
      continue;
    }

    const domain = info.domain;
    let entityRefs = 0;

    // Count entities that reference this source file
    if (domain) {
      const entityDir = path.join(mg, 'domains', domain, 'entities');
      if (fs.existsSync(entityDir)) {
        for (const ef of fs.readdirSync(entityDir).filter(f => f.endsWith('.json'))) {
          const entity = read_json(path.join(entityDir, ef));
          if (entity && entity.evidence) {
            const refs = entity.evidence.some(e => e.source === file || e.source.includes(path.basename(file)));
            if (refs) entityRefs++;
          }
        }
      }
    }

    coverage.push({
      file,
      disposition: info.disposition,
      facts: info.fact_count || 0,
      entities: entityRefs,
      domain: domain || '—'
    });
  }

  const ingested = coverage.filter(c => c.disposition === 'ingested');
  const contributing = ingested.filter(c => c.entities > 0);

  console.log(JSON.stringify({
    files: coverage,
    summary: {
      total: coverage.length,
      ingested: ingested.length,
      contributing_to_graph: contributing.length,
      no_entity_refs: ingested.filter(c => c.entities === 0).length
    }
  }, null, 2));
}

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

function cmd_detect_cross_contradictions(args) {
  const { mg } = resolve_mg(args);

  const crossData = read_json(path.join(mg, 'cross_domain.json'));
  const sameAsEdges = (crossData?.edges || []).filter(e => e.type === 'SAME_AS');

  const conflicts = [];

  for (const edge of sameAsEdges) {
    const [domainA, nameA] = edge.from.split(':');
    const [domainB, nameB] = edge.to.split(':');
    if (!domainA || !nameA || !domainB || !nameB) continue;

    const entityA = read_json(path.join(mg, 'domains', domainA, 'entities', `${nameA}.json`));
    const entityB = read_json(path.join(mg, 'domains', domainB, 'entities', `${nameB}.json`));
    if (!entityA || !entityB) continue;

    // Compare structured properties — same key, different value
    const propsA = entityA.properties || {};
    const propsB = entityB.properties || {};
    for (const key of Object.keys(propsA)) {
      if (key in propsB && String(propsA[key]) !== String(propsB[key])) {
        conflicts.push({
          type: 'property_mismatch',
          entity_a: edge.from, entity_b: edge.to,
          property: key,
          value_a: propsA[key], value_b: propsB[key],
          confidence: 'high'
        });
      }
    }

    // Flag differing entity type classifications
    if (entityA.type !== entityB.type) {
      conflicts.push({
        type: 'type_mismatch',
        entity_a: edge.from, entity_b: edge.to,
        type_a: entityA.type, type_b: entityB.type,
        confidence: 'medium'
      });
    }
  }

  // Entities with identical names across domains but no SAME_AS edge
  const linked = new Set(sameAsEdges.flatMap(e => [e.from, e.to]));
  const byName = {};
  for (const domain of get_domains(mg)) {
    const entityDir = path.join(mg, 'domains', domain, 'entities');
    if (!fs.existsSync(entityDir)) continue;
    for (const f of fs.readdirSync(entityDir).filter(f => f.endsWith('.json'))) {
      const e = read_json(path.join(entityDir, f));
      if (!e || !e.name) continue;
      const key = e.name.toLowerCase().trim();
      if (!byName[key]) byName[key] = [];
      byName[key].push(e.entity_id);
    }
  }
  const unlinked_candidates = Object.entries(byName)
    .filter(([, ids]) => ids.length > 1 && !ids.every(id => linked.has(id)))
    .map(([name, ids]) => ({ name, entities: ids }));

  console.log(JSON.stringify({
    same_as_pairs_checked: sameAsEdges.length,
    conflicts_found: conflicts.length,
    conflicts,
    unlinked_name_collisions: unlinked_candidates.length,
    unlinked_candidates
  }, null, 2));
}

function cmd_hub_scores(args) {
  const { mg } = resolve_mg(args);
  const domain = require_arg(args, 'domain');
  const domainDir = path.join(mg, 'domains', domain);

  if (!fs.existsSync(domainDir)) {
    process.stderr.write(`ERROR: Domain "${domain}" not found\n`);
    process.exit(1);
  }

  // Count relationships per entity
  const relFile = path.join(domainDir, 'relationships.json');
  const relData = read_json(relFile);
  const edgeCounts = {};

  if (relData && relData.edges) {
    for (const edge of relData.edges) {
      edgeCounts[edge.from] = (edgeCounts[edge.from] || 0) + 1;
      edgeCounts[edge.to] = (edgeCounts[edge.to] || 0) + 1;
    }
  }

  // Also count cross-domain edges
  const crossFile = path.join(mg, 'cross_domain.json');
  const crossData = read_json(crossFile);
  if (crossData && crossData.edges) {
    for (const edge of crossData.edges) {
      if (edge.from.startsWith(`${domain}:`)) edgeCounts[edge.from] = (edgeCounts[edge.from] || 0) + 1;
      if (edge.to.startsWith(`${domain}:`)) edgeCounts[edge.to] = (edgeCounts[edge.to] || 0) + 1;
    }
  }

  // Read entities and calculate hub scores
  const entityDir = path.join(domainDir, 'entities');
  const hubs = [];

  if (fs.existsSync(entityDir)) {
    for (const ef of fs.readdirSync(entityDir).filter(f => f.endsWith('.json'))) {
      const entity = read_json(path.join(entityDir, ef));
      if (!entity) continue;
      if (entity.weight < 0.5) continue; // Exclude low-weight entities

      const relCount = edgeCounts[entity.entity_id] || 0;
      const hubScore = relCount * entity.weight;

      hubs.push({
        entity_id: entity.entity_id,
        name: entity.name,
        relationships: relCount,
        weight: entity.weight,
        hub_score: Math.round(hubScore * 100) / 100
      });
    }
  }

  hubs.sort((a, b) => b.hub_score - a.hub_score);

  console.log(JSON.stringify({
    domain,
    hubs: hubs.slice(0, 15),
    total_entities_scored: hubs.length
  }, null, 2));
}

// ---------------------------------------------------------------------------
// Audit Trail
// ---------------------------------------------------------------------------

const AUDIT_ACTIONS = [
  'file_discovered', 'file_extracted', 'file_ingested', 'file_excluded',
  'fact_extracted', 'entity_created', 'entity_updated', 'entity_merged',
  'edge_created', 'edge_removed',
  'contradiction_detected', 'contradiction_resolved',
  'question_raised', 'question_answered',
  'domain_registered', 'domain_summarized',
  'pipeline_step_started', 'pipeline_step_completed', 'quality_gate_run',
  'output_generated', 'correction_applied'
];

function get_session_id() {
  return process.env.CLAUDE_SESSION_ID || process.env.SESSION_ID || 'unknown';
}

function get_model_id() {
  return process.env.CLAUDE_MODEL || process.env.MODEL_ID || 'unknown';
}

function cmd_audit_log(args) {
  const { mg } = resolve_mg(args);
  const action = require_arg(args, 'action');
  validate_enum(action, AUDIT_ACTIONS, 'audit action');

  const detail = require_arg(args, 'detail');
  const inputRef = args['input'] || null;
  const outputRef = args['output'] || null;
  const rationale = args['rationale'] || null;

  const auditDir = path.join(mg, 'audit');
  if (!fs.existsSync(auditDir)) fs.mkdirSync(auditDir, { recursive: true });

  const logFile = path.join(auditDir, 'session_log.jsonl');
  const entry = {
    timestamp: new Date().toISOString(),
    session_id: get_session_id(),
    model_id: get_model_id(),
    user: get_git_user(),
    action,
    detail,
    input: inputRef,
    output: outputRef,
    rationale
  };

  fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
  console.log(`Audit: ${action} | ${detail}`);
}

function cmd_audit_manifest(args) {
  const { mg } = resolve_mg(args);
  const file = require_arg(args, 'file');
  const stage = require_arg(args, 'stage');
  validate_enum(stage, ['discovered', 'extracted', 'ingested', 'excluded', 'entity_linked'], 'stage');

  const auditDir = path.join(mg, 'audit');
  if (!fs.existsSync(auditDir)) fs.mkdirSync(auditDir, { recursive: true });

  const manifestFile = path.join(auditDir, 'processing_manifest.json');
  const manifest = read_json(manifestFile) || { files: {} };

  if (!manifest.files[file]) {
    manifest.files[file] = {
      bronze_path: file,
      silver_path: null,
      discovered_at: null,
      extracted_at: null,
      extraction_tool: null,
      extraction_tool_version: null,
      silver_line_count: null,
      ingested_at: null,
      model_used: null,
      session_id: null,
      facts_produced: [],
      entities_contributed_to: [],
      excluded: false,
      exclusion_reason: null
    };
  }

  const entry = manifest.files[file];
  const now = new Date().toISOString();

  if (stage === 'discovered') {
    entry.discovered_at = now;
    if (args['hash']) entry.content_hash = args['hash'];
  }

  if (stage === 'extracted') {
    entry.extracted_at = now;
    entry.silver_path = args['silver-path'] || null;
    entry.extraction_tool = args['tool'] || 'kreuzberg';
    entry.extraction_tool_version = args['tool-version'] || null;
    if (args['line-count']) entry.silver_line_count = parseInt(args['line-count'], 10);
  }

  if (stage === 'ingested') {
    entry.ingested_at = now;
    entry.model_used = get_model_id();
    entry.session_id = get_session_id();
    if (args['facts']) {
      const newFacts = args['facts'].split(',').map(f => f.trim());
      entry.facts_produced = [...new Set([...entry.facts_produced, ...newFacts])];
    }
  }

  if (stage === 'entity_linked') {
    if (args['entities']) {
      const newEntities = args['entities'].split(',').map(e => e.trim());
      entry.entities_contributed_to = [...new Set([...entry.entities_contributed_to, ...newEntities])];
    }
  }

  if (stage === 'excluded') {
    entry.excluded = true;
    entry.exclusion_reason = args['reason'] || 'no reason provided';
  }

  write_json(manifestFile, manifest);
  console.log(`Manifest: ${file} → ${stage}`);
}

function cmd_audit_methodology(args) {
  const { mg } = resolve_mg(args);

  const auditDir = path.join(mg, 'audit');
  if (!fs.existsSync(auditDir)) fs.mkdirSync(auditDir, { recursive: true });

  const state = read_json(path.join(mg, 'state.json')) || {};
  const index = read_json(path.join(mg, 'index.json')) || {};
  const domains = fs.existsSync(path.join(mg, 'domains')) ? get_domains(mg) : [];
  const pfData = read_json(path.join(mg, 'processed_files.json')) || { files: {} };
  const manifest = read_json(path.join(auditDir, 'processing_manifest.json')) || { files: {} };

  // Count dispositions
  const dispCounts = {};
  for (const [, entry] of Object.entries(pfData.files || {})) {
    dispCounts[entry.disposition] = (dispCounts[entry.disposition] || 0) + 1;
  }

  // Count facts and entities
  let totalFacts = 0;
  let totalEntities = 0;
  for (const domain of domains) {
    const factsDir = path.join(mg, 'domains', domain, 'facts');
    if (fs.existsSync(factsDir)) {
      for (const f of fs.readdirSync(factsDir).filter(f => f.endsWith('.json'))) {
        const data = read_json(path.join(factsDir, f));
        if (data && data.facts) totalFacts += data.facts.length;
      }
    }
    const entDir = path.join(mg, 'domains', domain, 'entities');
    if (fs.existsSync(entDir)) {
      totalEntities += fs.readdirSync(entDir).filter(f => f.endsWith('.json')).length;
    }
  }

  // Get kreuzberg version (Python API)
  let kreuzbergVersion = 'unknown';
  try {
    kreuzbergVersion = execSync('python3 -c "import kreuzberg; print(kreuzberg.__version__)" 2>/dev/null || echo unknown', { encoding: 'utf8' }).trim();
  } catch (_) {}

  // Get session log entry count
  const logFile = path.join(auditDir, 'session_log.jsonl');
  let auditEntryCount = 0;
  if (fs.existsSync(logFile)) {
    auditEntryCount = fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(l => l).length;
  }

  const methodology = `# Processing Methodology

> Auto-generated audit document. Describes how source materials were processed
> into the knowledge graph. Intended for independent audit and FOIA compliance.

## Overview

This knowledge graph was built from ${Object.keys(pfData.files || {}).length} source
documents using the Magellan knowledge management pipeline. The pipeline
extracts text from source documents, identifies atomic facts with source
citations, and builds a structured knowledge graph of entities and relationships.

## Processing Pipeline

### Stage 1: Document Discovery
Source documents were discovered in the workspace directory. Each file was
assigned a SHA-256 content hash for change detection. Files were categorized
by type and assigned to business domains for targeted analysis.

### Stage 2a: Text Extraction (Bronze to Silver)
Each source document was processed through kreuzberg (version: ${kreuzbergVersion}),
a local document intelligence tool that extracts text from 91+ file formats
including PDF, DOCX, XLSX, and scanned documents via OCR. No data was sent
to external services during extraction — all processing occurred locally.

Extracted text was saved to the silver layer (\`.magellan/silver/\`) as plain
text files, creating a durable intermediate representation that preserves
the full content of each source document in a machine-readable format.

### Stage 2b: Fact Extraction (Silver to Gold)
An AI model read each silver text file and extracted atomic facts — single,
self-contained factual statements. Each fact includes:
- A natural language statement summarizing the fact
- The source document path
- The exact location within the document (page, section)
- A verbatim quote from the source (max 500 characters)
- A confidence score (0.0 to 1.0)
- Domain classification

Facts were written to the gold layer (\`.magellan/domains/<domain>/facts/\`).

### Stage 3: Knowledge Graph Construction
Facts were grouped into entities — business processes, rules, constraints,
and data concepts. Each entity includes:
- A summary description
- Evidence array linking back to source facts with quotes
- Confidence and weight scores
- Relationships to other entities

### Quality Controls
- Every fact traces to a verbatim source quote
- Quote verification checks that quotes exist in the source documents
- File ledger reconciliation ensures every file reaches a recorded disposition
- Quality gates run after each pipeline step with automated checks
- State transitions are enforced sequentially — steps cannot be skipped

## Tools Used

| Tool | Purpose | Version |
|------|---------|---------|
| Magellan | Knowledge graph pipeline | See git history |
| kreuzberg | Document text extraction | ${kreuzbergVersion} |
| kg-write.js | Schema-validated KG writes | See git history |
| kg-ops.js | Pipeline operations and verification | See git history |
| kg-query.js | Graph traversal and querying | See git history |

## Processing Statistics

| Metric | Value |
|--------|-------|
| Total files discovered | ${Object.keys(pfData.files || {}).length} |
| Files with facts extracted (ingested) | ${dispCounts['ingested'] || 0} |
| Files cataloged (scanned, not deeply extracted) | ${dispCounts['cataloged'] || 0} |
| Files with no extractable facts | ${dispCounts['no_facts'] || 0} |
| Files excluded by rule | ${dispCounts['skipped_by_rule'] || 0} |
| Unreadable files | ${dispCounts['unreadable'] || 0} |
| Total atomic facts extracted | ${totalFacts} |
| Total entities in knowledge graph | ${totalEntities} |
| Business domains | ${domains.length} (${domains.join(', ')}) |
| Audit log entries | ${auditEntryCount} |

## Disposition Definitions

| Disposition | Meaning |
|-------------|---------|
| extracted | Text extracted to silver layer, not yet analyzed for facts |
| ingested | Facts extracted and written to the knowledge graph |
| cataloged | File identified and scanned but not deeply analyzed for facts |
| no_facts | File read but contained no extractable domain facts |
| no_text | kreuzberg could not extract text from the file |
| unreadable | File could not be opened or processed |
| skipped_by_rule | File excluded from processing (e.g., build artifacts, configs) |
| skipped_unchanged | Content hash matches previous run, no reprocessing needed |

## Provenance

Every entity in the knowledge graph can be traced back to source documents
through the following chain:

\`\`\`
Entity (gold) → Evidence array → Fact (gold) → Source quote + location →
Silver extract (.magellan/silver/) → Bronze source document (workspace)
\`\`\`

The processing manifest (\`.magellan/audit/processing_manifest.json\`) provides
a per-file record of this chain including timestamps, tool versions, and
session identifiers.

The session log (\`.magellan/audit/session_log.jsonl\`) provides a chronological
record of every processing action taken, including the model and session that
performed each action.

## Data Handling

- All source documents remain in the workspace (bronze layer) unmodified
- Text extracts are stored locally in \`.magellan/silver/\`
- No source data was transmitted to external services during text extraction
- AI model processing occurred via API calls; source text was sent to the
  model provider for fact extraction and entity building
- The knowledge graph (\`.magellan/domains/\`) contains only extracted facts,
  entities, and relationships — not raw source content
`;

  const methodFile = path.join(auditDir, 'methodology.md');
  fs.writeFileSync(methodFile, methodology, 'utf8');
  console.log(`Generated methodology.md (${Object.keys(pfData.files || {}).length} files, ${totalFacts} facts, ${totalEntities} entities)`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const COMMANDS = {
  'log': cmd_log,
  'summary': cmd_summary,
  'graph': cmd_graph,
  'quality-gate': cmd_quality_gate,
  'update-state': cmd_update_state,
  'update-processed': cmd_update_processed,
  'remove-processed': cmd_remove_processed,
  'rebuild-index': cmd_rebuild_index,
  'hash-check': cmd_hash_check,
  'verify-ledger': cmd_verify_ledger,
  'verify-quotes': cmd_verify_quotes,
  'verify-edges': cmd_verify_edges,
  'verify-coverage': cmd_verify_coverage,
  'detect-cross-contradictions': cmd_detect_cross_contradictions,
  'hub-scores': cmd_hub_scores,
  'audit-log': cmd_audit_log,
  'audit-manifest': cmd_audit_manifest,
  'audit-methodology': cmd_audit_methodology
};

const { command, args } = parseArgs(process.argv.slice(2));

if (!command || command === 'help') {
  console.log(`Usage: node kg-ops.js <command> --workspace <path> [options]

Activity Log:
  log                Append an entry to .magellan/log.md
                     --action <enum> --detail "description"
                     Git user is detected automatically.
                     Actions: ${LOG_ACTIONS.join(', ')}

Summary:
  summary            Generate .magellan/summary.md — compressed KG overview
                     for session start context. Run before committing changes.

Visualization:
  graph              Generate .magellan/graph.html — interactive knowledge graph
                     explorer. Opens in browser. Nodes colored by domain, search,
                     click for details.

Quality:
  quality-gate       Run verification checks for a pipeline step (--step N)
                     Writes result to pipeline_feedback.json. Blocks on failures.
                     Must pass before update-state can advance to next step.

State Management:
  update-state       Update state.json (--step N, --notes "...", --set-last-run)
                     Enforces sequential advancement. Use --force to override.
  update-processed   Update processed_files.json entry
                     --file <path> --disposition <enum> [--domain, --fact-count, --hash, --error]
                     'ingested' requires facts to exist for the file. Use 'cataloged' for
                     files scanned but not deeply extracted.
  remove-processed   Remove a stale entry from processed_files.json
                     --file <path>
  rebuild-index      Rebuild index.json from domain files

Hash Operations:
  hash-check         Scan workspace, compare hashes against processed_files.json
                     Returns: {new: [...], changed: [...], unchanged: [...], forced: [...]}
                     --force  Re-queue unchanged files for re-ingestion (use when content was edited then reverted)

Verification:
  verify-ledger      Reconcile workspace files against processed_files.json
  verify-quotes      Grep every fact's quote against its source document
  verify-edges       Check all edge from/to entity IDs exist as files
  verify-coverage    Coverage matrix: facts and entity refs per source file
  detect-cross-contradictions  Scan SAME_AS pairs for property/type conflicts
                               and flag same-named entities with no SAME_AS edge

Computation:
  hub-scores         Calculate hub scores for a domain (--domain <name>)

Audit Trail:
  audit-log          Append structured entry to audit/session_log.jsonl
                     --action <audit_action> --detail "description"
                     [--input <ref>] [--output <ref>] [--rationale "why"]
                     Actions: ${AUDIT_ACTIONS.join(', ')}
  audit-manifest     Update per-file provenance in audit/processing_manifest.json
                     --file <path> --stage <discovered|extracted|ingested|excluded|entity_linked>
                     Stages accept additional args:
                       discovered: [--hash]
                       extracted: [--silver-path, --tool, --tool-version, --line-count]
                       ingested: [--facts <comma-separated>]
                       entity_linked: [--entities <comma-separated>]
                       excluded: [--reason]
  audit-methodology  Generate audit/methodology.md — full process documentation
                     for independent audit and FOIA compliance

Enums:
  dispositions: ${DISPOSITIONS.join(', ')}
  entity types: ${ENTITY_TYPES.join(', ')}
  edge types:   ${EDGE_TYPES.join(', ')}
  severity:     ${SEVERITY_LEVELS.join(', ')}
  priority:     ${PRIORITY_LEVELS.join(', ')}
  audit actions: ${AUDIT_ACTIONS.join(', ')}`);
  process.exit(0);
}

if (!COMMANDS[command]) {
  process.stderr.write(`ERROR: Unknown command "${command}". Run with "help" for usage.\n`);
  process.exit(1);
}

try {
  COMMANDS[command](args);
} catch (e) {
  process.stderr.write(`ERROR: ${e.message}\n`);
  process.exit(1);
}
