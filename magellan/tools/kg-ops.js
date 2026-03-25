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
  'ingested', 'no_facts', 'unreadable', 'extraction_error',
  'skipped_unchanged', 'skipped_by_rule'
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
// State management
// ---------------------------------------------------------------------------

function cmd_update_state(args) {
  const { mg } = resolve_mg(args);
  const stateFile = path.join(mg, 'state.json');
  const state = read_json(stateFile) || {};

  if (args.step) state.pipeline_step = parseInt(args.step, 10);
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

  write_json(path.join(mg, 'index.json'), index);
  console.log(`Rebuilt index.json: ${index.total_entities} entities, ${index.total_edges} edges across ${domains.length} domains`);
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
      if (entry === '.magellan' || entry === '.git' || entry === 'node_modules') continue;
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

  const results = { new: [], changed: [], unchanged: [], total: allFiles.length };

  for (const file of allFiles) {
    const fullPath = path.join(ws, file);
    const currentHash = execSync(`shasum -a 256 "${fullPath}" | cut -d' ' -f1`, { encoding: 'utf8' }).trim();
    const stored = pfData.files[file];

    if (!stored) {
      results.new.push({ file, hash: `sha256:${currentHash}` });
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

  // Count workspace files
  const allFiles = [];
  function walk(dir, rel) {
    for (const entry of fs.readdirSync(dir)) {
      if (entry === '.magellan' || entry === '.git' || entry === 'node_modules') continue;
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
  const missing = allFiles.filter(f => !ledgerFiles.includes(f));
  const stale = ledgerFiles.filter(f => !allFiles.includes(f));

  const result = {
    workspace_files: allFiles.length,
    ledger_entries: ledgerFiles.length,
    missing: missing,
    stale: stale,
    pass: missing.length === 0
  };

  if (result.pass) {
    console.log(JSON.stringify({ ...result, message: `Ledger: ${allFiles.length}/${allFiles.length} files accounted for` }, null, 2));
  } else {
    console.log(JSON.stringify({ ...result, message: `MISSING: ${missing.length} files not in ledger` }, null, 2));
  }
}

function cmd_verify_quotes(args) {
  const { ws, mg } = resolve_mg(args);
  const domains = get_domains(mg);
  const results = { verified: 0, failed: 0, errors: [] };

  for (const domain of domains) {
    const factsDir = path.join(mg, 'domains', domain, 'facts');
    if (!fs.existsSync(factsDir)) continue;

    for (const factFile of fs.readdirSync(factsDir).filter(f => f.endsWith('.json'))) {
      const data = read_json(path.join(factsDir, factFile));
      if (!data || !data.facts) continue;

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

  // Check all edges
  function checkEdges(edges, source) {
    for (const edge of edges) {
      let ok = true;
      if (!existingEntities.has(edge.from)) {
        results.dangling++;
        results.errors.push({ source, from: edge.from, to: edge.to, type: edge.type, error: `from entity "${edge.from}" not found` });
        ok = false;
      }
      if (!existingEntities.has(edge.to)) {
        results.dangling++;
        results.errors.push({ source, from: edge.from, to: edge.to, type: edge.type, error: `to entity "${edge.to}" not found` });
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
// Main
// ---------------------------------------------------------------------------

const COMMANDS = {
  'update-state': cmd_update_state,
  'update-processed': cmd_update_processed,
  'rebuild-index': cmd_rebuild_index,
  'hash-check': cmd_hash_check,
  'verify-ledger': cmd_verify_ledger,
  'verify-quotes': cmd_verify_quotes,
  'verify-edges': cmd_verify_edges,
  'verify-coverage': cmd_verify_coverage,
  'hub-scores': cmd_hub_scores
};

const { command, args } = parseArgs(process.argv.slice(2));

if (!command || command === 'help') {
  console.log(`Usage: node kg-ops.js <command> --workspace <path> [options]

State Management:
  update-state       Update state.json (--step N, --notes "...", --set-last-run)
  update-processed   Update processed_files.json entry
                     --file <path> --disposition <enum> [--domain, --fact-count, --hash, --error]
  rebuild-index      Rebuild index.json from domain files

Hash Operations:
  hash-check         Scan workspace, compare hashes against processed_files.json
                     Returns: {new: [...], changed: [...], unchanged: [...]}

Verification:
  verify-ledger      Reconcile workspace files against processed_files.json
  verify-quotes      Grep every fact's quote against its source document
  verify-edges       Check all edge from/to entity IDs exist as files
  verify-coverage    Coverage matrix: facts and entity refs per source file

Computation:
  hub-scores         Calculate hub scores for a domain (--domain <name>)

Enums:
  dispositions: ${DISPOSITIONS.join(', ')}
  entity types: ${ENTITY_TYPES.join(', ')}
  edge types:   ${EDGE_TYPES.join(', ')}
  severity:     ${SEVERITY_LEVELS.join(', ')}
  priority:     ${PRIORITY_LEVELS.join(', ')}`);
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
