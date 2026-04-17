#!/usr/bin/env node
// Magellan KG Write Tool — safe JSON I/O for knowledge graph mutations
// The LLM passes structured arguments, this script handles file I/O and validation.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Argument parsing
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
  return { command: positional[0], positional, args };
}

function require_arg(args, name) {
  if (!args[name]) {
    process.stderr.write(`ERROR: Missing required argument --${name}\n`);
    process.exit(1);
  }
  return args[name];
}

// ---------------------------------------------------------------------------
// Workspace helpers
// ---------------------------------------------------------------------------

function resolve_workspace(args) {
  const ws = require_arg(args, 'workspace');
  const mg = path.join(ws, '.magellan');
  if (!fs.existsSync(mg)) {
    process.stderr.write(`ERROR: No .magellan/ directory at ${ws}\n`);
    process.exit(1);
  }
  return mg;
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
  // Post-write validation
  JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function content_id(prefix, ...parts) {
  return prefix + '_' + crypto.createHash('sha256')
    .update(parts.join('\x00'))
    .digest('hex')
    .slice(0, 8);
}

function snake_case(str) {
  return str.toLowerCase()
    .replace(/[^a-z0-9\s_]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function slug(str) {
  return str.toLowerCase()
    .replace(/[^a-z0-9\s._-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

// ---------------------------------------------------------------------------
// Domain registry
// ---------------------------------------------------------------------------

function load_domains(mg) {
  const file = path.join(mg, 'domains.json');
  const data = read_json(file);
  return data ? data.domains : [];
}

function save_domains(mg, domains) {
  write_json(path.join(mg, 'domains.json'), { domains: domains.sort() });
}

function validate_domain_name(name) {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    process.stderr.write(`ERROR: Domain name "${name}" invalid (must match ^[a-z][a-z0-9_]*$)\n`);
    process.exit(1);
  }
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
  return d[m][n];
}

function check_similar_domains(name, existing) {
  const similar = existing.filter(d => {
    if (d === name) return false;
    const dist = levenshtein(d, name);
    return dist <= 3 || d.includes(name) || name.includes(d);
  });
  return similar;
}

function require_domain(mg, domain) {
  validate_domain_name(domain);
  const domains = load_domains(mg);
  if (!domains.includes(domain)) {
    process.stderr.write(`ERROR: Domain "${domain}" is not registered.\n`);
    process.stderr.write(`Registered domains: ${domains.length ? domains.join(', ') : '(none)'}\n`);
    process.stderr.write(`Register it first: node tools/kg-write.js add-domain --workspace <path> --domain ${domain}\n`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validate_confidence(val) {
  const n = parseFloat(val);
  if (isNaN(n) || n < 0 || n > 1) {
    process.stderr.write(`ERROR: Invalid confidence ${val} (must be 0.0-1.0)\n`);
    process.exit(1);
  }
  return n;
}

function validate_weight(val) {
  const n = parseFloat(val);
  if (isNaN(n) || n < 0 || n > 1) {
    process.stderr.write(`ERROR: Invalid weight ${val} (must be 0.0-1.0)\n`);
    process.exit(1);
  }
  return n;
}

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

function validate_enum(val, allowed, label) {
  if (!allowed.includes(val)) {
    process.stderr.write(`ERROR: Invalid ${label} "${val}" (valid: ${allowed.join(', ')})\n`);
    process.exit(1);
  }
}

function validate_quote(quote) {
  if (quote.length > 500) {
    process.stderr.write(`ERROR: Source quote exceeds 500 chars (got ${quote.length})\n`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmd_add_domain(args) {
  const mg = resolve_workspace(args);
  const domain = require_arg(args, 'domain');
  validate_domain_name(domain);

  const domains = load_domains(mg);

  if (domains.includes(domain)) {
    console.log(`Domain "${domain}" already registered`);
    return;
  }

  const similar = check_similar_domains(domain, domains);
  if (similar.length > 0 && !args.force) {
    process.stderr.write(`WARNING: Similar domain(s) already exist: ${similar.join(', ')}\n`);
    process.stderr.write(`Did you mean one of those? Use --force to register "${domain}" anyway.\n`);
    process.exit(1);
  }

  domains.push(domain);
  save_domains(mg, domains);

  // Create domain directory
  const domainDir = path.join(mg, 'domains', domain);
  if (!fs.existsSync(domainDir)) {
    fs.mkdirSync(path.join(domainDir, 'facts'), { recursive: true });
    fs.mkdirSync(path.join(domainDir, 'entities'), { recursive: true });
  }

  console.log(`Registered domain "${domain}" (${domains.length} total)`);
}

function cmd_add_fact(args) {
  const mg = resolve_workspace(args);
  const domain = require_arg(args, 'domain');
  require_domain(mg, domain);

  const statement = require_arg(args, 'statement');
  const subject = require_arg(args, 'subject');
  const predicate = require_arg(args, 'predicate');
  const object = require_arg(args, 'object');
  const sourceDoc = require_arg(args, 'source-doc');
  const sourceLocation = require_arg(args, 'source-location');
  const sourceQuote = require_arg(args, 'source-quote');
  const confidence = validate_confidence(require_arg(args, 'confidence'));

  if (statement.length < 10) {
    process.stderr.write(`ERROR: Statement must be at least 10 characters\n`);
    process.exit(1);
  }
  validate_quote(sourceQuote);

  const tags = args.tags ? args.tags.split(',').map(t => t.trim()) : [];
  const factId = content_id('f', subject, predicate, object);

  // Dedup: scan all fact files in domain for existing fact_id
  const factsDir = path.join(mg, 'domains', domain, 'facts');
  if (fs.existsSync(factsDir)) {
    for (const f of fs.readdirSync(factsDir).filter(f => f.endsWith('.json'))) {
      const existing = read_json(path.join(factsDir, f));
      if (existing && existing.facts && existing.facts.some(fact => fact.fact_id === factId)) {
        console.log(`Skipped: fact ${factId} already exists in ${domain}/facts/${f}`);
        return;
      }
    }
  }

  const sourceSlug = slug(path.basename(sourceDoc, path.extname(sourceDoc)));
  const factFile = path.join(mg, 'domains', domain, 'facts', `${sourceSlug}.json`);

  let data = read_json(factFile);
  if (!data) {
    data = {
      source_document: sourceDoc,
      domain: domain,
      extracted_at: new Date().toISOString(),
      fact_count: 0,
      facts: []
    };
  }

  const fact = {
    fact_id: factId,
    statement,
    subject,
    subject_domain: domain,
    predicate,
    object,
    source: {
      document: sourceDoc,
      location: sourceLocation,
      quote: sourceQuote
    },
    confidence,
    tags
  };

  data.facts.push(fact);
  data.fact_count = data.facts.length;
  data.extracted_at = new Date().toISOString();

  write_json(factFile, data);
  console.log(`Added fact to ${domain}/facts/${sourceSlug}.json (${data.fact_count} total)`);
}

function cmd_add_entity(args) {
  const mg = resolve_workspace(args);
  const domain = require_arg(args, 'domain');
  require_domain(mg, domain);

  const name = require_arg(args, 'name');
  const type = require_arg(args, 'type');
  validate_enum(type, ENTITY_TYPES, 'entity type');

  const summary = require_arg(args, 'summary');
  if (summary.length < 50) {
    process.stderr.write(`ERROR: Summary must be at least 50 characters (got ${summary.length})\n`);
    process.exit(1);
  }

  const confidence = validate_confidence(require_arg(args, 'confidence'));
  const weight = validate_weight(require_arg(args, 'weight'));
  const tags = args.tags ? args.tags.split(',').map(t => t.trim()) : [];

  const entityId = `${domain}:${snake_case(name)}`;
  const entitySlug = snake_case(name);
  const entityFile = path.join(mg, 'domains', domain, 'entities', `${entitySlug}.json`);

  // Parse evidence from stdin
  const evidence = [];
  const stdinData = args._stdin || '';
  if (stdinData.trim()) {
    for (const line of stdinData.trim().split('\n')) {
      if (!line.trim()) continue;
      const parts = {};
      for (const pair of line.split('|')) {
        const [key, ...rest] = pair.split(':');
        parts[key.trim()] = rest.join(':').trim();
      }
      if (!parts.source || !parts.location || !parts.quote) {
        process.stderr.write(`ERROR: Evidence line missing required fields (source, location, quote): ${line}\n`);
        process.exit(1);
      }
      validate_quote(parts.quote);
      evidence.push({
        source: parts.source,
        location: parts.location,
        quote: parts.quote,
        confidence: parts.confidence ? parseFloat(parts.confidence) : confidence
      });
    }
  }

  if (evidence.length === 0) {
    process.stderr.write(`ERROR: Entity requires at least one evidence entry via stdin\n`);
    process.exit(1);
  }

  const entity = {
    entity_id: entityId,
    name,
    type,
    domain,
    summary,
    properties: {},
    evidence,
    tags,
    confidence,
    weight,
    version: { current: 'v1', status: 'active' },
    related_entities: [],
    open_questions: []
  };

  write_json(entityFile, entity);
  console.log(`Created entity ${entityId} (${evidence.length} evidence entries)`);
}

function cmd_add_edge(args) {
  const mg = resolve_workspace(args);
  const domain = require_arg(args, 'domain');

  // _cross_domain is a special domain for cross-domain edges
  const isCrossDomain = domain === '_cross_domain';
  if (!isCrossDomain) require_domain(mg, domain);

  const from = require_arg(args, 'from');
  const to = require_arg(args, 'to');
  const type = require_arg(args, 'type');
  validate_enum(type, EDGE_TYPES, 'edge type');

  const description = require_arg(args, 'description');
  const evidenceSource = require_arg(args, 'evidence-source');
  const evidenceLocation = require_arg(args, 'evidence-location');
  const confidence = validate_confidence(require_arg(args, 'confidence'));
  const weight = validate_weight(require_arg(args, 'weight'));

  const relFile = isCrossDomain
    ? path.join(mg, 'cross_domain.json')
    : path.join(mg, 'domains', domain, 'relationships.json');
  let data = read_json(relFile);
  if (!data) {
    data = { domain, edges: [] };
  }

  // Check for duplicate edge
  const exists = data.edges.some(e => e.from === from && e.to === to && e.type === type);
  if (exists) {
    process.stderr.write(`WARNING: Edge ${type} (${from} → ${to}) already exists, skipping\n`);
    return;
  }

  const edge = {
    from,
    to,
    type,
    properties: { description },
    evidence: { source: evidenceSource, location: evidenceLocation },
    confidence,
    weight
  };

  data.edges.push(edge);
  write_json(relFile, data);

  const fromShort = from.split(':')[1] || from;
  const toShort = to.split(':')[1] || to;
  console.log(`Added edge ${type} (${fromShort} → ${toShort}) to ${domain}/relationships.json`);
}

function cmd_add_contradiction(args) {
  const mg = resolve_workspace(args);
  const domain = require_arg(args, 'domain');

  // _cross_domain is a special domain for cross-domain contradictions
  const isCrossDomain = domain === '_cross_domain';
  if (!isCrossDomain) require_domain(mg, domain);

  const description = require_arg(args, 'description');
  const severity = require_arg(args, 'severity');
  validate_enum(severity, SEVERITY_LEVELS, 'severity');

  const relatedEntities = args['related-entities']
    ? args['related-entities'].split(',').map(e => e.trim())
    : [];
  const source1 = require_arg(args, 'source1');
  const quote1 = require_arg(args, 'quote1');
  const source2 = require_arg(args, 'source2');
  const quote2 = require_arg(args, 'quote2');

  validate_quote(quote1);
  validate_quote(quote2);

  const cFile = isCrossDomain
    ? path.join(mg, 'cross_domain_contradictions.json')
    : path.join(mg, 'domains', domain, 'contradictions.json');
  let data = read_json(cFile);
  if (!data) {
    data = { active: [], resolved: [] };
  }

  const contradictionId = content_id('c', quote1, quote2);
  const alreadyExists = [...data.active, ...data.resolved].some(c => c.contradiction_id === contradictionId);
  if (alreadyExists) {
    console.log(`Skipped: contradiction ${contradictionId} already exists`);
    return;
  }

  const entry = {
    contradiction_id: contradictionId,
    description,
    domain,
    severity,
    status: 'open',
    related_entities: relatedEntities,
    sources: [
      { source: source1, quote: quote1 },
      { source: source2, quote: quote2 }
    ],
    detected_at: new Date().toISOString()
  };

  data.active.push(entry);
  write_json(cFile, data);
  const dest = isCrossDomain ? 'cross_domain_contradictions.json' : `${domain}/contradictions.json`;
  console.log(`Added contradiction ${contradictionId} (${severity}) to ${dest}`);
}

function cmd_remove_edge(args) {
  const mg = resolve_workspace(args);
  const domain = require_arg(args, 'domain');
  const from = require_arg(args, 'from');
  const to = require_arg(args, 'to');
  const type = require_arg(args, 'type');

  const isCrossDomain = domain === '_cross_domain';
  if (!isCrossDomain) require_domain(mg, domain);

  const relFile = isCrossDomain
    ? path.join(mg, 'cross_domain.json')
    : path.join(mg, 'domains', domain, 'relationships.json');

  const data = read_json(relFile);
  if (!data || !data.edges) {
    process.stderr.write(`WARNING: No relationships file found for domain "${domain}"\n`);
    return;
  }

  const before = data.edges.length;
  data.edges = data.edges.filter(e => !(e.from === from && e.to === to && e.type === type));

  if (data.edges.length === before) {
    process.stderr.write(`WARNING: Edge ${type} (${from} → ${to}) not found — nothing removed\n`);
    return;
  }

  write_json(relFile, data);
  console.log(`Removed edge ${type} (${from} → ${to}) from ${isCrossDomain ? 'cross_domain.json' : `${domain}/relationships.json`}`);
}

function cmd_add_question(args) {
  const mg = resolve_workspace(args);
  const domain = require_arg(args, 'domain');
  require_domain(mg, domain);

  const question = require_arg(args, 'question');
  const priority = require_arg(args, 'priority');
  validate_enum(priority, PRIORITY_LEVELS, 'priority');

  const relatedEntities = args['related-entities']
    ? args['related-entities'].split(',').map(e => e.trim())
    : [];
  const raisedBy = args['raised-by'] || 'Pipeline';
  const context = args['context'] || '';
  const directedTo = args['directed-to'] || '';

  const qFile = path.join(mg, 'domains', domain, 'open_questions.json');
  let data = read_json(qFile);
  if (!data) {
    data = { active: [], resolved: [] };
  }

  const questionId = content_id('oq', domain, question);
  const alreadyExists = [...data.active, ...data.resolved].some(q => q.question_id === questionId);
  if (alreadyExists) {
    console.log(`Skipped: question ${questionId} already exists`);
    return;
  }

  const entry = {
    question_id: questionId,
    question,
    domain,
    priority,
    status: 'open',
    related_entities: relatedEntities,
    raised_by: raisedBy,
    context,
    directed_to: directedTo,
    raised_at: new Date().toISOString()
  };

  data.active.push(entry);
  write_json(qFile, data);
  console.log(`Added question ${questionId} (${priority}) to ${domain}/open_questions.json`);
}

function cmd_validate(args) {
  const mg = resolve_workspace(args);
  const file = require_arg(args, 'file');
  const filepath = path.join(mg, file);

  if (!fs.existsSync(filepath)) {
    process.stderr.write(`ERROR: File not found: ${filepath}\n`);
    process.exit(1);
  }

  try {
    const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));

    // Detect file type and validate
    if (data.facts && Array.isArray(data.facts)) {
      const missing = data.facts.filter(f => !f.statement || !f.source?.quote);
      if (missing.length > 0) {
        process.stderr.write(`Invalid: ${missing.length} facts missing statement or source quote\n`);
        process.exit(1);
      }
      console.log(`Valid: fact file with ${data.facts.length} facts`);
    } else if (data.entity_id) {
      if (!data.summary || data.summary.length < 50) {
        process.stderr.write(`Invalid: entity summary missing or under 50 chars\n`);
        process.exit(1);
      }
      if (!data.evidence || data.evidence.length === 0) {
        process.stderr.write(`Invalid: entity has no evidence entries\n`);
        process.exit(1);
      }
      console.log(`Valid: entity ${data.entity_id} (${data.evidence.length} evidence, weight ${data.weight})`);
    } else if (data.edges && Array.isArray(data.edges)) {
      console.log(`Valid: relationships with ${data.edges.length} edges`);
    } else if (data.active !== undefined && data.resolved !== undefined) {
      console.log(`Valid: ${data.active.length} active, ${data.resolved.length} resolved`);
    } else if (data.domains) {
      console.log(`Valid: domain registry with ${data.domains.length} domains`);
    } else {
      console.log(`Valid JSON (unknown schema)`);
    }
  } catch (e) {
    process.stderr.write(`Invalid JSON: ${e.message}\n`);
    process.exit(1);
  }
}

function cmd_batch_entities(args) {
  const mg = resolve_workspace(args);
  const stdinData = args._stdin || '';
  if (!stdinData.trim()) {
    process.stderr.write('ERROR: batch-entities requires a JSON array via stdin\n');
    process.exit(1);
  }

  let entities;
  try {
    entities = JSON.parse(stdinData);
  } catch (e) {
    process.stderr.write(`ERROR: Invalid JSON on stdin: ${e.message}\n`);
    process.exit(1);
  }

  if (!Array.isArray(entities)) {
    process.stderr.write('ERROR: stdin must be a JSON array of entity objects\n');
    process.exit(1);
  }

  let created = 0;
  let errors = 0;

  for (let i = 0; i < entities.length; i++) {
    const ent = entities[i];
    const label = ent.name || `index ${i}`;
    try {
      if (!ent.domain) throw new Error('missing domain');
      if (!ent.name) throw new Error('missing name');
      if (!ent.type) throw new Error('missing type');
      if (!ent.summary) throw new Error('missing summary');
      if (!ent.evidence || !Array.isArray(ent.evidence) || ent.evidence.length === 0) throw new Error('missing or empty evidence array');

      require_domain(mg, ent.domain);
      validate_enum(ent.type, ENTITY_TYPES, 'entity type');

      if (ent.summary.length < 50) throw new Error(`summary too short (${ent.summary.length} chars, need 50+)`);

      const confidence = validate_confidence(String(ent.confidence || 0.85));
      const weight = validate_weight(String(ent.weight || 0.85));

      for (const ev of ent.evidence) {
        if (!ev.source || !ev.location || !ev.quote) throw new Error('evidence entry missing source, location, or quote');
        validate_quote(ev.quote);
      }

      const entityId = `${ent.domain}:${snake_case(ent.name)}`;
      const entitySlug = snake_case(ent.name);
      const entityFile = path.join(mg, 'domains', ent.domain, 'entities', `${entitySlug}.json`);

      const entity = {
        entity_id: entityId,
        name: ent.name,
        type: ent.type,
        domain: ent.domain,
        summary: ent.summary,
        properties: ent.properties || {},
        evidence: ent.evidence.map(ev => ({
          source: ev.source,
          location: ev.location,
          quote: ev.quote,
          confidence: ev.confidence != null ? parseFloat(ev.confidence) : confidence
        })),
        tags: ent.tags || [],
        confidence,
        weight,
        version: { current: 'v1', status: 'active' },
        related_entities: ent.related_entities || [],
        open_questions: ent.open_questions || []
      };

      write_json(entityFile, entity);
      console.log(`  Created ${entityId} (${ent.evidence.length} evidence)`);
      created++;
    } catch (e) {
      process.stderr.write(`  SKIP "${label}": ${e.message}\n`);
      errors++;
    }
  }

  console.log(`Batch complete: ${created} created, ${errors} errors`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const COMMANDS = {
  'add-domain': cmd_add_domain,
  'add-fact': cmd_add_fact,
  'add-entity': cmd_add_entity,
  'batch-entities': cmd_batch_entities,
  'add-edge': cmd_add_edge,
  'add-contradiction': cmd_add_contradiction,
  'remove-edge': cmd_remove_edge,
  'add-question': cmd_add_question,
  'validate': cmd_validate
};

// Read stdin if piped (for add-entity evidence)
let stdinData = '';
try {
  if (!process.stdin.isTTY && process.stdin.readable) {
    stdinData = fs.readFileSync(0, 'utf8');
  }
} catch (_) {
  // No stdin available — that's fine for non-entity commands
}

const { command, positional, args } = parseArgs(process.argv.slice(2));
args._stdin = stdinData;

const COMMAND_HELP = {
  'add-domain': `add-domain --workspace <path> --domain <name>`,
  'add-fact': `add-fact --workspace <path> --domain <name>
  --statement <text>     Fact statement (min 10 chars)
  --subject <text>       Entity or concept this fact is about
  --predicate <text>     Relationship verb (e.g. "has deadline")
  --object <text>        The target of the predicate
  --source-doc <path>    Source document path
  --source-location <text>  Page/section reference
  --source-quote <text>  Exact quote (max 500 chars)
  --confidence <0-1>     Confidence score
  [--tags <a,b,c>]       Comma-separated tags`,
  'add-entity': `add-entity --workspace <path> --domain <name>
  --name <text>          Entity name
  --type <EntityType>    ${ENTITY_TYPES.join(', ')}
  --summary <text>       Description (min 50 chars)
  --confidence <0-1>     Confidence score
  --weight <0-1>         Weight score
  [--tags <a,b,c>]       Comma-separated tags
  Evidence via stdin (one per line, pipe-delimited):
    source:<path>|location:<ref>|quote:<text>|confidence:<0-1>`,
  'batch-entities': `batch-entities --workspace <path>
  JSON array via stdin. Each object requires:
    domain, name, type, summary, confidence, weight, evidence[]
  Evidence entries: {source, location, quote, confidence}`,
  'add-edge': `add-edge --workspace <path> --domain <name>
  --from <entity_id>     Source entity (domain:name)
  --to <entity_id>       Target entity (domain:name)
  --type <EdgeType>      ${EDGE_TYPES.join(', ')}
  --description <text>   Why this relationship exists
  --evidence-source <path>  Source document
  --evidence-location <text>  Page/section
  --confidence <0-1>     Confidence score
  --weight <0-1>         Weight score`,
  'add-contradiction': `add-contradiction --workspace <path> --domain <name>
  --description <text>   What the contradiction is about
  --source1 <path>       First source document
  --quote1 <text>        Quote from first source (max 500 chars)
  --source2 <path>       Second source document
  --quote2 <text>        Quote from second source (max 500 chars)
  --severity <level>     ${SEVERITY_LEVELS.join(', ')}
  [--related-entities <a,b>]  Comma-separated entity IDs`,
  'add-question': `add-question --workspace <path> --domain <name>
  --question <text>      The open question
  --context <text>       Background context
  --priority <level>     ${PRIORITY_LEVELS.join(', ')}
  [--related-entities <a,b>]  Comma-separated entity IDs`,
  'remove-edge': `remove-edge --workspace <path> --domain <name|_cross_domain>
  --from <entity_id> --to <entity_id> --type <EdgeType>`,
  'validate': `validate --workspace <path> --file <path>  Validate a KG JSON file`
};

if (!command || command === 'help') {
  const subcmd = args._stdin ? null : positional[1] || Object.keys(args)[0];
  if (subcmd && COMMAND_HELP[subcmd]) {
    console.log(`Usage: node kg-write.js ${COMMAND_HELP[subcmd]}`);
    process.exit(0);
  }
  console.log(`Usage: node kg-write.js <command> --workspace <path> [options]
  Run "node kg-write.js help <command>" for detailed argument info.

Commands:
  add-domain          Register a new domain
  add-fact            Append a fact to a domain fact file
  add-entity          Create an entity file (evidence via stdin)
  batch-entities      Create multiple entities from a JSON array via stdin
  add-edge            Append an edge to relationships.json
  add-contradiction   Add a contradiction to the active array
  remove-edge         Remove an edge from relationships.json or cross_domain.json
  add-question        Add an open question to the active array
  validate            Validate a KG JSON file`);
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
