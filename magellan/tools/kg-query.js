#!/usr/bin/env node
// Magellan KG Query Tool — deterministic graph traversal
// Offloads BFS/DFS from the LLM to prevent hallucinated paths.

const fs = require('fs');
const path = require('path');

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

// ---------------------------------------------------------------------------
// Graph loading
// ---------------------------------------------------------------------------

function load_all_edges(mg) {
  const edges = [];

  // Intra-domain edges
  const domainDirs = fs.readdirSync(path.join(mg, 'domains')).filter(d =>
    fs.statSync(path.join(mg, 'domains', d)).isDirectory()
  );
  for (const domain of domainDirs) {
    const relFile = path.join(mg, 'domains', domain, 'relationships.json');
    const data = read_json(relFile);
    if (data && data.edges) {
      edges.push(...data.edges);
    }
  }

  // Cross-domain edges
  const crossFile = path.join(mg, 'cross_domain.json');
  const crossData = read_json(crossFile);
  if (crossData && crossData.edges) {
    edges.push(...crossData.edges);
  }

  return edges;
}

function load_entity(mg, entityId) {
  const [domain, name] = entityId.split(':');
  if (!domain || !name) return null;
  const entityFile = path.join(mg, 'domains', domain, 'entities', `${name}.json`);
  return read_json(entityFile);
}

// ---------------------------------------------------------------------------
// Traversal operations
// ---------------------------------------------------------------------------

function cmd_walk(args) {
  const mg = path.join(require_arg(args, 'workspace'), '.magellan');
  const start = require_arg(args, 'start');
  const depth = parseInt(args.depth || '3', 10);
  const direction = args.direction || 'outgoing';
  const edgeTypes = args['edge-types'] ? args['edge-types'].split(',') : null;

  const allEdges = load_all_edges(mg);
  const visited = new Set();
  const results = [];

  function traverse(entityId, currentDepth, pathSoFar) {
    if (currentDepth > depth) return;
    if (visited.has(entityId)) return;
    visited.add(entityId);

    const matching = allEdges.filter(e => {
      const matches = direction === 'outgoing'
        ? e.from === entityId
        : e.to === entityId;
      if (!matches) return false;
      if (edgeTypes && !edgeTypes.includes(e.type)) return false;
      return true;
    });

    for (const edge of matching) {
      const next = direction === 'outgoing' ? edge.to : edge.from;
      const hop = {
        from: edge.from,
        to: edge.to,
        type: edge.type,
        description: edge.properties?.description || '',
        depth: currentDepth
      };
      results.push(hop);
      traverse(next, currentDepth + 1, [...pathSoFar, hop]);
    }
  }

  // Verify start entity exists
  const startEntity = load_entity(mg, start);
  if (!startEntity) {
    process.stderr.write(`ERROR: Entity "${start}" not found\n`);
    process.exit(1);
  }

  traverse(start, 1, []);

  console.log(JSON.stringify({
    start,
    direction,
    depth,
    edge_types: edgeTypes,
    hops: results,
    entities_visited: Array.from(visited)
  }, null, 2));
}

function cmd_impact(args) {
  // Impact is just a reverse walk
  args.direction = 'incoming';
  cmd_walk(args);
}

function cmd_between(args) {
  const mg = path.join(require_arg(args, 'workspace'), '.magellan');
  const start = require_arg(args, 'start');
  const end = require_arg(args, 'end');
  const maxDepth = parseInt(args.depth || '5', 10);

  const allEdges = load_all_edges(mg);

  // BFS to find paths
  const queue = [{ entity: start, path: [] }];
  const visited = new Set([start]);
  const foundPaths = [];

  while (queue.length > 0 && foundPaths.length < 10) {
    const { entity, path: currentPath } = queue.shift();

    if (currentPath.length > maxDepth) continue;

    // Find all edges from this entity (both directions)
    const outgoing = allEdges.filter(e => e.from === entity);
    const incoming = allEdges.filter(e => e.to === entity);

    for (const edge of [...outgoing, ...incoming]) {
      const next = edge.from === entity ? edge.to : edge.from;
      const hop = {
        from: edge.from,
        to: edge.to,
        type: edge.type,
        description: edge.properties?.description || ''
      };

      if (next === end) {
        foundPaths.push([...currentPath, hop]);
        continue;
      }

      if (!visited.has(next) && currentPath.length < maxDepth) {
        visited.add(next);
        queue.push({ entity: next, path: [...currentPath, hop] });
      }
    }
  }

  console.log(JSON.stringify({
    start,
    end,
    max_depth: maxDepth,
    paths_found: foundPaths.length,
    paths: foundPaths
  }, null, 2));
}

function cmd_neighbors(args) {
  const mg = path.join(require_arg(args, 'workspace'), '.magellan');
  const entity = require_arg(args, 'entity');

  const allEdges = load_all_edges(mg);
  const outgoing = allEdges.filter(e => e.from === entity);
  const incoming = allEdges.filter(e => e.to === entity);

  console.log(JSON.stringify({
    entity,
    outgoing: outgoing.map(e => ({
      to: e.to,
      type: e.type,
      description: e.properties?.description || ''
    })),
    incoming: incoming.map(e => ({
      from: e.from,
      type: e.type,
      description: e.properties?.description || ''
    })),
    total: outgoing.length + incoming.length
  }, null, 2));
}

function cmd_stats(args) {
  const mg = path.join(require_arg(args, 'workspace'), '.magellan');
  const allEdges = load_all_edges(mg);

  // Count entities
  const entityIds = new Set();
  for (const e of allEdges) {
    entityIds.add(e.from);
    entityIds.add(e.to);
  }

  // Count by type
  const edgeTypes = {};
  for (const e of allEdges) {
    edgeTypes[e.type] = (edgeTypes[e.type] || 0) + 1;
  }

  // Count by domain
  const domainDirs = fs.readdirSync(path.join(mg, 'domains')).filter(d =>
    fs.statSync(path.join(mg, 'domains', d)).isDirectory()
  );
  const domains = {};
  for (const domain of domainDirs) {
    const entityDir = path.join(mg, 'domains', domain, 'entities');
    const entityCount = fs.existsSync(entityDir)
      ? fs.readdirSync(entityDir).filter(f => f.endsWith('.json')).length
      : 0;
    domains[domain] = { entities: entityCount };
  }

  console.log(JSON.stringify({
    total_entities: Object.values(domains).reduce((s, d) => s + d.entities, 0),
    total_edges: allEdges.length,
    edge_types: edgeTypes,
    domains
  }, null, 2));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const COMMANDS = {
  'walk': cmd_walk,
  'impact': cmd_impact,
  'between': cmd_between,
  'neighbors': cmd_neighbors,
  'stats': cmd_stats
};

const { command, args } = parseArgs(process.argv.slice(2));

if (!command || command === 'help') {
  console.log(`Usage: node kg-query.js <command> --workspace <path> [options]

Commands:
  walk         Follow edges from a start entity (outgoing by default)
               --start <entity_id> --depth <N> --direction outgoing|incoming
               --edge-types DEPENDS_ON,CALLS (optional filter)

  impact       Reverse walk — what depends on this entity?
               --start <entity_id> --depth <N>

  between      Find paths between two entities (BFS)
               --start <entity_id> --end <entity_id> --depth <N>

  neighbors    List immediate neighbors of an entity
               --entity <entity_id>

  stats        Graph statistics (entity counts, edge types, domains)`);
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
