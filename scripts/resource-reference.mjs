import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {parseAllDocuments} from 'yaml';

export const bundlePath = 'contracts/resource-reference.json';
export const sha = data => createHash('sha256').update(data).digest('hex');
const ordered = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export const gvk = (apiVersion, kind) => apiVersion + '/' + kind;

export function readCrds(dir, {provider, files} = {}) {
  const names = readdirSync(dir).filter(f => /\.ya?ml$/.test(f)).sort(ordered);
  if (files) assert.deepEqual(names, Object.keys(files).sort(ordered), 'Unlisted or missing CRDs in ' + dir);
  const result = [];
  for (const filename of names) {
    const path = join(dir, filename);
    const bytes = readFileSync(path);
    if (files) assert.equal(sha(bytes), files[filename].sha256, 'Connector digest mismatch: ' + path);
    result.push(...crdsFromBytes(bytes, filename, provider));
  }
  return result;
}

export function crdsFromBytes(bytes, filename, provider) {
  const result = [];
  for (const doc of parseAllDocuments(bytes.toString())) {
    assert.ok(!doc.errors.length, 'Invalid YAML in ' + filename + ': ' + doc.errors.join(' '));
    const crd = doc.toJS();
    if (!crd || crd.kind === 'Kustomization') continue;
    assert.equal(crd.kind, 'CustomResourceDefinition', 'Unexpected manifest in ' + filename);
    for (const version of crd.spec.versions.filter(v => v.served)) {
      const id = gvk(crd.spec.group + '/' + version.name, crd.spec.names.kind);
      result.push({id, crd, version, provider, filename, digest: sha(bytes)});
    }
  }
  return result;
}

// Helm adds source comments and can change mapping order when it packages a CRD.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

export const contractDigest = value => sha(JSON.stringify(canonical(value)));

export function uniqueIndex(entries, key, label) {
  const result = new Map();
  for (const entry of entries) {
    const id = key(entry);
    assert.ok(!result.has(id), 'Duplicate ' + label + ': ' + id);
    result.set(id, entry);
  }
  return result;
}

export function chartInventory(directory) {
  const core = readCrds(join(directory, 'crds'));
  const {providers} = JSON.parse(readFileSync(join(directory, 'connector-crds.lock.json'), 'utf8'));
  const shipped = readdirSync(join(directory, 'connectors'), {withFileTypes: true}).filter(e => e.isDirectory()).map(e => e.name).sort();
  assert.deepEqual(shipped, Object.keys(providers).sort(), 'Connector directories differ from the chart lock');
  const connectors = Object.entries(providers).flatMap(([provider, {files}]) =>
    readCrds(join(directory, 'connectors', provider), {provider, files}));
  return uniqueIndex([...core, ...connectors].sort((a, b) => ordered(a.id, b.id)), e => e.id, 'served GVK');
}

export function sameInventory(expected, actual, label) {
  const missing = [...expected.keys()].filter(k => !actual.has(k));
  const extra = [...actual.keys()].filter(k => !expected.has(k));
  assert.ok(!missing.length && !extra.length,
    label + ' inventory differs. Missing [' + missing.join(', ') + ']. Unexpected [' + extra.join(', ') + '].');
}

// Visit schema nodes only. Literal values, CEL expressions and user property names are data.
function walk(node, visit, path = '', field = '') {
  visit(node, path, field);
  for (const key of ['properties', 'patternProperties', '$defs', 'definitions']) {
    for (const [name, child] of Object.entries(node[key] ?? {})) {
      const escaped = name.replaceAll('~', '~0').replaceAll('/', '~1');
      walk(child, visit, path + '/' + key + '/' + escaped, field ? field + '.' + name : name);
    }
  }
  for (const key of ['items', 'additionalProperties', 'not', 'if', 'then', 'else']) {
    if (node[key] && !Array.isArray(node[key]) && typeof node[key] === 'object') {
      const suffix = key === 'items' ? '[]' : key === 'additionalProperties' ? '[key]' : '';
      walk(node[key], visit, path + '/' + key, field + suffix);
    }
  }
  for (const key of ['allOf', 'oneOf', 'anyOf', 'items', 'prefixItems']) {
    if (Array.isArray(node[key])) node[key].forEach((child, index) => walk(child, visit, path + '/' + key + '/' + index, field));
  }
}

function schemaParts(schema) {
  const shape = structuredClone(schema);
  const descriptions = {};
  walk(shape, (node, path) => {
    if (node.description) descriptions[path] = node.description;
    delete node.description;
  });
  return {shape, descriptions};
}

export function makeReference(pin, producer, controller) {
  assert.equal(pin.id, producer.id);
  assert.equal(pin.provider, producer.provider, 'Wrong provider for ' + pin.id);
  assert.deepEqual(pin.crd.spec.names, producer.crd.spec.names, 'Resource names changed: ' + pin.id);
  assert.equal(pin.crd.spec.scope, producer.crd.spec.scope, 'Scope changed: ' + pin.id);
  const {schema: pinnedVersionSchema, ...pinnedVersion} = pin.version;
  const {schema: producerVersionSchema, ...producerVersion} = producer.version;
  assert.ok(isDeepStrictEqual(pinnedVersion, producerVersion), 'Kubernetes version, printer columns, or subresources changed: ' + pin.id);
  const pinned = schemaParts(pinnedVersionSchema.openAPIV3Schema);
  const source = schemaParts(producerVersionSchema.openAPIV3Schema);
  assert.ok(isDeepStrictEqual(pinned.shape, source.shape), 'Kubernetes validation schema changed: ' + pin.id + '. Review the chart pin.');
  const result = {
    apiVersion: pin.crd.spec.group + '/' + pin.version.name,
    kind: pin.crd.spec.names.kind,
    inputs: {pinnedCrdSha256: pin.digest, schemaSha256: contractDigest(producerVersionSchema.openAPIV3Schema), controllerSha256: contractDigest(controller.value)},
    descriptions: canonical(source.descriptions),
    controller: canonical(controller.value),
  };
  hydrateReference(pin, result);
  return result;
}

function prose(value, label) {
  assert.ok(typeof value === 'string' && value.trim() && !value.startsWith('Auto-generated'), 'Missing guidance for ' + label);
}

const tuple = (...parts) => JSON.stringify(parts);

function checkExample(value, schema, path) {
  if (value === null && schema.nullable) return;
  if (schema.enum) assert.ok(schema.enum.includes(value), 'Unknown example value at ' + path);
  if (schema.type === 'object') {
    assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'Expected object at ' + path);
    for (const [key, child] of Object.entries(value)) {
      const definition = schema.properties?.[key] ?? schema.additionalProperties;
      if (typeof definition === 'object' && definition !== null) checkExample(child, definition, path + '.' + key);
      else assert.ok(definition === true || schema['x-kubernetes-preserve-unknown-fields'], 'Unknown example field ' + path + '.' + key);
    }
  } else if (schema.type === 'array') {
    assert.ok(Array.isArray(value), 'Expected array at ' + path);
    value.forEach((item, i) => checkExample(item, schema.items, path + '[' + i + ']'));
  } else if (schema.type === 'integer') assert.ok(Number.isInteger(value), 'Expected integer at ' + path);
  else if (schema.type) assert.equal(typeof value, schema.type, 'Example type differs at ' + path);
}

function checkController(ref, schema) {
  const {kind, controller: c} = ref;
  assert.equal(c.contractVersion, 1);
  assert.equal(c.apiVersion, ref.apiVersion, 'Controller API version differs for ' + kind);
  assert.equal(c.kind, kind);
  assert.ok(Array.isArray(c.conditions) && Array.isArray(c.outcomes), 'Missing controller catalog for ' + kind);
  const types = uniqueIndex(c.conditions, entry => entry.type, kind + ' condition');
  const conditionSchema = schema?.properties?.conditions;
  if (!conditionSchema) assert.equal(types.size, 0, kind + ' has no conditions field');
  const states = conditionSchema?.items?.properties?.status?.enum;
  for (const {type, meaning} of c.conditions) {
    prose(type, kind + ' condition type');
    prose(meaning, kind + '/' + type);
  }
  const fixed = new Set();
  const dynamic = new Set();
  const dynamicStates = new Set();
  const covered = new Set();
  for (const [isDynamic, rows] of [[false, c.outcomes], [true, c.dynamicOutcomes ?? []]]) {
    for (const row of rows) {
      assert.ok(types.has(row.conditionType) && states?.includes(row.status), 'Unknown condition or state in ' + kind + ': ' + JSON.stringify(row));
      prose(row.guidance, kind + '/' + row.conditionType);
      prose(isDynamic ? row.reasonSource : row.reason, kind + '/' + row.conditionType + ' reason');
      const set = isDynamic ? dynamic : fixed;
      const id = tuple(row.conditionType, row.status, isDynamic ? row.reasonSource : row.reason);
      if (isDynamic) dynamicStates.add(tuple(row.conditionType, row.status));
      assert.ok(!set.has(id), 'Duplicate outcome in ' + kind + ': ' + id);
      set.add(id);
      covered.add(row.conditionType);
    }
  }
  assert.deepEqual(covered, new Set(types.keys()), 'Missing outcomes for ' + kind);
  if (!types.size && schema) prose(c.narrative, kind + ' status');
  if (schema) {
    const e = c.example;
    assert.ok(e, 'Missing tested status example for ' + kind);
    for (const key of ['title', 'introduction', 'nextCheck']) prose(e[key], kind + ' example.' + key);
    assert.ok(e.status && Object.keys(e.status).length, 'Empty status example for ' + kind);
    checkExample(e.status, schema, kind + '.status');
    for (const entry of e.status.conditions ?? []) {
      assert.ok(fixed.has(tuple(entry.type, entry.status, entry.reason)) || dynamicStates.has(tuple(entry.type, entry.status)),
        'Undeclared example outcome for ' + kind + ': ' + JSON.stringify(entry));
    }
  } else assert.ok(!c.example, 'Status example supplied for status-less ' + kind);
}

// The public bundle stores prose and controller observations. Kubernetes still owns the schema shape.
export function hydrateReference(pin, ref) {
  assert.equal(gvk(ref.apiVersion, ref.kind), pin.id);
  assert.equal(ref.inputs.pinnedCrdSha256, pin.digest, 'Stale public reference for ' + pin.id);
  const {shape: schema} = schemaParts(pin.version.schema.openAPIV3Schema);
  const used = new Set();
  walk(schema, (node, path, field) => {
    if (Object.hasOwn(ref.descriptions, path)) {
      node.description = ref.descriptions[path];
      used.add(path);
    }
    // A scalar array element or arbitrary map entry has no independent configuration key.
    if (!path || (/^spec\./.test(field) && /\/properties\/[^/]+$/.test(path))) prose(node.description, pin.id + ' ' + (field || 'resource'));
  });
  assert.equal(used.size, Object.keys(ref.descriptions).length, 'Unknown schema path in ' + pin.id);
  for (const [key, field] of Object.entries(schema.properties.status?.properties ?? {})) {
    prose(field.description, pin.id + ' status.' + key);
  }
  checkController(ref, schema.properties.status);
  assert.equal(contractDigest(schema), ref.inputs.schemaSha256, 'Schema documentation digest differs for ' + pin.id);
  assert.equal(contractDigest(ref.controller), ref.inputs.controllerSha256, 'Controller contract digest differs for ' + pin.id);
  return schema;
}

export function readBundle(path, pins) {
  const bundle = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(bundle.contractVersion, 1);
  const refs = uniqueIndex(bundle.resources, r => gvk(r.apiVersion, r.kind), 'public reference');
  sameInventory(pins, refs, 'Public reference');
  return refs;
}
