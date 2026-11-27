import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename, dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {bundlePath, chartInventory, crdsFromBytes, gvk, makeReference, readBundle, readCrds, sameInventory, uniqueIndex} from './resource-reference.mjs';

const {values: options} = parseArgs({options: {
  api: {type: 'string'}, operator: {type: 'string'}, connectors: {type: 'string'},
  charts: {type: 'string'}, crd: {type: 'string'}, controller: {type: 'string'},
  resource: {type: 'string'}, check: {type: 'boolean'},
}});
const root = fileURLToPath(new URL('../', import.meta.url));
const pinDir = join(root, 'contracts/kubernetes');
const destination = join(root, bundlePath);
const pins = chartInventory(pinDir);
if (options.resource) assert.ok(pins.has(options.resource), 'Unknown served GVK ' + options.resource);
const source = options.api || options.operator || options.connectors;
const pair = options.crd || options.controller;
assert.equal([source, options.charts, pair].filter(Boolean).length, 1,
  'Use --api DIR --operator DIR --connectors DIR, --charts DIR, or --crd FILE --controller FILE.');
const scratch = mkdtempSync(join(tmpdir(), 'prokrust-crd-reference-'));

function catalogFile(path) {
  const bytes = readFileSync(path);
  const value = JSON.parse(bytes);
  return {id: gvk(value.apiVersion, value.kind), value};
}

function catalogs(dir) {
  return readdirSync(dir).filter(name => name.endsWith('.json')).sort().map(name => catalogFile(join(dir, name)));
}

const hasProvider = (provider) => [...pins.values()].filter(pin => pin.provider === provider);
const providers = [...new Set([...pins.values()].map(pin => pin.provider).filter(Boolean))].sort();
const metadata = [];
const schemas = [];

function fromSource() {
  const selected = options.resource && pins.get(options.resource);
  if (!selected || !selected.provider) {
    assert.ok(options.api && options.operator, 'The source import needs --api and --operator.');
    const crds = join(scratch, 'core-crds');
    const status = join(scratch, 'core-status');
    mkdirSync(crds); mkdirSync(status);
    execFileSync('cargo', ['run', '--locked', '-p', 'prokrust-api', '--bin', 'prokrust-crdgen', '--', '--output', crds],
      {cwd: resolve(options.api), stdio: 'inherit'});
    execFileSync('sh', ['scripts/generate-status-reference.sh', status],
      {cwd: resolve(options.operator), stdio: 'inherit'});
    addProducer(undefined, readCrds(crds), catalogs(status));
  }
  for (const provider of providers) {
    if (selected && selected.provider !== provider) continue;
    assert.ok(options.connectors, 'The source import needs --connectors DIR (provider and SDK checkouts).');
    const checkout = resolve(options.connectors, provider);
    const chart = join(checkout, 'charts', 'prokrust-' + provider + '-crds');
    const rendered = execFileSync('helm', ['template', 'reference', chart], {maxBuffer: 16 * 1024 * 1024});
    const status = join(scratch, provider);
    mkdirSync(status);
    execFileSync('python3', [resolve(options.connectors, 'sdk/scripts/export-status-reference.py'),
      '--provider', checkout, '--output-dir', status], {stdio: 'inherit'});
    addProducer(provider, crdsFromBytes(rendered, basename(chart), provider), catalogs(status));
  }
}

function addProducer(provider, definitions, controllers) {
  const expected = new Map(hasProvider(provider).map(pin => [pin.id, pin]));
  for (const [label, items] of [['CRDs', definitions], ['controller artifacts', controllers]]) {
    sameInventory(expected, uniqueIndex(items, item => item.id, label), (provider ?? 'core') + ' ' + label);
  }
  schemas.push(...definitions);
  metadata.push(...controllers);
}

function fromCharts() {
  const charts = resolve(options.charts);
  const released = chartInventory(join(charts, 'prokrust-crds/files'));
  sameInventory(pins, released, 'Release charts');
  for (const provider of [undefined, ...providers]) {
    const name = provider ? 'connector-' + provider : 'prokrust-system';
    const definitions = [...released.values()].filter(row => row.provider === provider);
    addProducer(provider, definitions, catalogs(join(charts, name, 'files/reference')));
  }
}

try {
  let only = options.resource;
  if (source) fromSource();
  else if (options.charts) fromCharts();
  else {
    assert.ok(options.crd && options.controller, 'Supply both --crd and --controller.');
    const condition = catalogFile(resolve(options.controller));
    if (only) assert.equal(only, condition.id, 'Wrong controller for selected GVK');
    only = condition.id;
    const pin = pins.get(only);
    assert.ok(pin, 'Unknown GVK ' + only);
    const path = resolve(options.crd);
    const crds = crdsFromBytes(readFileSync(path), basename(path), pin.provider);
    schemas.push(...crds); metadata.push(condition);
  }
  const bySchema = uniqueIndex(schemas, row => row.id, 'producer schema');
  const byController = uniqueIndex(metadata, row => row.id, 'producer controller');
  if (!only) {
    sameInventory(pins, bySchema, 'Producer schemas');
    sameInventory(pins, byController, 'Producer controllers');
  }
  const saved = only ? readBundle(destination, pins) : null;
  const resources = [...pins.values()].map(pin => {
    if (only && pin.id !== only) return saved.get(pin.id);
    assert.ok(bySchema.has(pin.id) && byController.has(pin.id), 'Missing producer input for ' + pin.id);
    return makeReference(pin, bySchema.get(pin.id), byController.get(pin.id));
  });
  const bytes = JSON.stringify({contractVersion: 1, resources}, null, 2) + '\n';
  if (options.check) {
    assert.ok(readFileSync(destination, 'utf8') === bytes, 'Stale public reference. Refresh it and review the changes.');
  } else {
    // A failed or interrupted refresh must leave the previous complete inventory usable.
    const temp = mkdtempSync(join(dirname(destination), '.reference-'));
    try {
      writeFileSync(join(temp, 'resources.json'), bytes);
      renameSync(join(temp, 'resources.json'), destination);
    } finally {
      rmSync(temp, {recursive: true, force: true});
    }
  }
  console.log((options.check ? 'Verified ' : 'Updated ') + (only || resources.length + ' served Kubernetes resources') + '.');
} finally {
  rmSync(scratch, {recursive: true, force: true});
}
