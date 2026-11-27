import {mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {parseAllDocuments, stringify} from 'yaml';
import {bundlePath, chartInventory, hydrateReference, readBundle} from './resource-reference.mjs';

const input = 'contracts/kubernetes';
const output = 'docs/reference/kubernetes';
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const releases = json('contracts/releases.json');
const chart = releases.crds;
const resources = chartInventory(input);
const references = readBundle(bundlePath, resources);
const syntheticRef = '/reference/connectors/synthetic/' + releases.synthetic.version + '/';
const exampleDocs = parseAllDocuments(readFileSync('static/examples/synthetic-table.yaml', 'utf8'));
const examples = new Map(exampleDocs.map(doc => [doc.get('kind'), doc.toJS()]));
const tick = String.fromCharCode(96);
const code = (value) => tick + String(value).replaceAll('|', '\\|') + tick;
const cell = (value) => String(value ?? '').replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();

function details(schema) {
  const parts = [];
  if (schema.description) parts.push(cell(schema.description));
  for (const [key, value] of Object.entries(schema)) {
    if (['type', 'description', 'required', 'items', 'properties', 'title', 'default'].includes(key)) continue;
    if (key === 'additionalProperties' && typeof value === 'object') continue;
    if (key === 'x-kubernetes-validations') {
      for (const {message, rule} of value) parts.push((message ? cell(message) + ' ' : '') + code(rule));
    } else {
      parts.push(code(key) + ' ' + code(JSON.stringify(value)));
    }
  }
  return parts.join(' · ');
}

function fieldAnchor(path) {
  const id = path.replaceAll('[]', '-item').replaceAll('[key]', '-entry').replaceAll('.', '-').toLowerCase();
  return '<span id="field-' + id + '"></span>';
}

function fieldsOf(path, schema, required) {
  const fields = [{path, schema, required}];
  for (const [name, child] of Object.entries(schema.properties ?? {})) {
    fields.push(...fieldsOf(path + '.' + name, child, schema.required?.includes(name) ? 'yes' : 'no'));
  }
  if (schema.items) fields.push(...fieldsOf(path + '[]', schema.items, '—'));
  if (typeof schema.additionalProperties === 'object') {
    fields.push(...fieldsOf(path + '[key]', schema.additionalProperties, '—'));
  }
  return fields;
}

function schemaDisclosure(section, fields, anchors) {
  const lines = ['', '<details class="crd-disclosure">', '<summary>Kubernetes schema for <code>' + section + '</code></summary>', '',
    'Required applies when the parent is present. A dash in the default column means the CRD declares no default.', '',
    '| Field | Type | Required | Default | Schema constraints and descriptions |', '| --- | --- | --- | --- | --- |'];
  for (const {path, schema, required} of fields) {
    const defaultValue = Object.hasOwn(schema, 'default') ? code(JSON.stringify(schema.default)) : '—';
    const anchor = anchors.has(path) ? '' : fieldAnchor(path);
    lines.push('| ' + [anchor + code(path), schema.type ?? 'any', required, defaultValue, details(schema)].join(' | ') + ' |');
  }
  lines.push('', '</details>', '');
  return lines;
}

function specSection(definition, kind, required) {
  const lines = ['', '## Specification {#spec}', ''];
  if (definition.description) lines.push(cell(definition.description), '');
  if (definition.required?.length) lines.push('This resource requires ' + definition.required.map(code).join(', ') + '.', '');
  const fields = fieldsOf('spec', definition, required);
  const anchors = new Set();
  for (const name of Object.keys(definition.properties ?? {})) {
    const path = 'spec.' + name;
    const rows = fields.filter(field => field.path === path || field.path.startsWith(path + '.') || field.path.startsWith(path + '['));
    lines.push('### ' + name, '');
    const children = [];
    for (const field of rows) {
      if (field.path.endsWith('[]') || field.path.endsWith('[key]')) continue;
      const note = field.schema.description;
      if (!note?.trim()) throw Error('Missing field guidance for ' + kind + ' ' + field.path);
      anchors.add(field.path);
      if (field.path === path) {
        lines.push(fieldAnchor(path) + note.trim(), '');
      } else {
        children.push('| ' + fieldAnchor(field.path) + code(field.path) + ' | ' + cell(note) + ' |');
      }
    }
    if (children.length) lines.push('| Field | When to use it |', '| --- | --- |', ...children, '');
  }
  lines.push(...schemaDisclosure('spec', fields, anchors));
  return lines;
}

const conditionFields = {
  type: 'Names the check. Use it to select the condition you want to inspect.',
  status: 'Reports whether the named condition holds. Read the reason to see why.',
  reason: 'A short identifier for this outcome. Use it when comparing observations or filtering results.',
  message: 'When present, gives details about this object, such as the name of a dependency.',
  observedGeneration: 'Compare with ' + code('metadata.generation') + ' to see which version of the spec the controller checked.',
  lastTransitionTime: 'Records the time of the last transition for this condition.',
};

function exampleYaml(example) {
  const {conditions, ...status} = example.status;
  if (conditions) status.conditions = conditions.map(({type, status, reason, ...detail}) => ({type, status, reason, ...detail}));
  return stringify({status}, {lineWidth: 0}).trimEnd();
}

function statusNarrative(schema, controller) {
  const {conditions, outcomes, dynamicOutcomes = [], example, narrative, kind} = controller;
  const fields = schema.properties;
  const lines = [];
  if (conditions.length) {
    if (fields.conditions.description) lines.push(cell(fields.conditions.description), '');
    lines.push('| Condition | What it tells you |', '| --- | --- |',
      ...conditions.map(c => '| [' + code(c.type) + '](#outcome-' + encodeURIComponent(c.type.toLowerCase()) + ') | ' + cell(c.meaning) + ' |'), '');
  }
  if (narrative) lines.push(narrative.trim(), '');
  if (example) lines.push('**' + example.title + '**', '', example.introduction, '',
    '```yaml', exampleYaml(example), '```', '', example.nextCheck, '');
  if (outcomes.length || dynamicOutcomes.length) {
    lines.push('<details class="crd-disclosure">', '<summary>' + kind + ' condition results and reasons</summary>', '');
    for (const condition of conditions) {
      lines.push('#### ' + condition.type + ' {#outcome-' + condition.type.toLowerCase() + '}', '',
        '| Status and reason | What to check |', '| --- | --- |');
      for (const row of outcomes.filter(r => r.conditionType === condition.type)) {
        lines.push('| ' + code(row.status + ' / ' + row.reason) + ' | ' + cell(row.guidance) + ' |');
      }
      for (const row of dynamicOutcomes.filter(r => r.conditionType === condition.type)) {
        lines.push('| ' + code(row.status) + ' / ' + cell(row.reasonSource) + ' | ' + cell(row.guidance) + ' |');
      }
      lines.push('');
    }
    lines.push('', '</details>', '');
  }
  return lines.join('\n');
}

function statusSection(schema, controller) {
  const definition = schema.properties.status;
  const narrative = statusNarrative(definition, controller);
  const lines = ['', '## Controller status {#status}', ''];
  const anchors = new Set();
  const conditionSchema = definition.properties?.conditions;
  if (controller.conditions.length) {
    lines.push('### Conditions {#conditions}', '', fieldAnchor('status.conditions'), '');
    anchors.add('status.conditions');
  }
  lines.push('<div class="crd-status-guidance">', '', narrative, '', '</div>', '');
  if (conditionSchema) {
    lines.push('<details class="crd-disclosure">', '<summary>Condition field meanings</summary>', '',
      '| Field | What to look for |', '| --- | --- |');
    for (const [name, meaning] of Object.entries(conditionFields)) {
      if (!conditionSchema.items?.properties?.[name]) continue;
      const path = 'status.conditions[].' + name;
      anchors.add(path);
      lines.push('| ' + fieldAnchor(path) + code(name) + ' | ' + meaning + ' |');
    }
    lines.push('', '</details>', '');
  }
  const observations = Object.entries(definition.properties ?? {}).filter(([name]) => name !== 'conditions');
  if (observations.length) {
    lines.push('<details class="crd-disclosure">', '<summary>How to read status fields</summary>', '',
      '| Field | What it tells you |', '| --- | --- |');
    for (const [name, field] of observations) {
      const path = 'status.' + name;
      const suffix = schema.properties.spec?.properties?.[name] ? '-1' : '';
      const alias = '<span id="' + name.toLowerCase() + suffix + '"></span>';
      anchors.add(path);
      lines.push('| ' + alias + fieldAnchor(path) + code(path) + ' | ' + cell(field.description) + ' |');
    }
    lines.push('', '</details>', '');
  }
  const fields = fieldsOf('status', definition, schema.required?.includes('status') ? 'yes' : 'no');
  lines.push(...schemaDisclosure('status', fields, anchors));
  return lines;
}

function pageFor(crd, version, filename, provider, schema, controller) {
  const {group, names, scope} = crd.spec;
  const source = 'https://github.com/prokrust-ai/helm-charts/blob/' + chart.revision + '/charts/prokrust-crds/files/' + filename;
  const lines = ['---', 'title: ' + names.kind, '---', ''];
  lines.push(schema.description.trim(), '');
  lines.push(code(group + '/' + version.name) + ' · ' + scope + ' · ' + code(names.plural));
  if (provider) {
    lines.push('', 'Enable the ' + code(provider) + ' connector CRD in the cluster to use this kind.');
    const specRules = schema.properties.spec['x-kubernetes-validations'] ?? [];
    if (specRules.some(({rule}) => rule === 'self == oldSelf')) {
      lines.push('', 'The connection spec is immutable. To use different settings, create a new connection.');
    }
  }

  const example = examples.get(names.kind);
  if (example && example.apiVersion === group + '/' + version.name) {
    lines.push('', '## Example', '');
    if (names.kind === 'Table') {
      lines.push('This part of a table definition selects a dataset through a connection in the same workspace.', '',
        '```yaml', stringify({spec: {source: example.spec.source}}).trimEnd(), '```', '',
        'Copy the API version, kind, and name from the connection into ' + code('connectionRef') + '. The selector version identifies the schema for ' + code('config') + '. Here the synthetic connector accepts one dataset, ' + code('events') + '. To select a different object or table with another provider, use its selector keys. [Source selector examples](/user/create-a-table/#source-selector) · [Synthetic selector](' + syntheticRef + '#table-selector)');
    } else {
      lines.push('This connection supplies the generated data for the [quickstart](/user/synthetic-table/).', '',
        '```yaml', stringify(example).trimEnd(), '```', '',
        code('apiVersion') + ' and ' + code('kind') + ' identify the resource type. A table uses ' + code('metadata.name') + ' to find this connection. The seed fixes the generated values. The partition count sets the number of files. Rows per partition sets the size of each file in rows. [Connection fields and ranges](' + syntheticRef + '#connection-fields)');
    }
  } else if (provider) {
    lines.push('', 'To select data through this connection, see [Create a table](/user/create-a-table/#source-selector).');
  }

  if (schema.properties.status) lines.push(...statusSection(schema, controller));
  else if (controller.narrative) lines.push('', '## Status {#status}', '', controller.narrative);
  if (schema.properties.spec) lines.push(...specSection(schema.properties.spec, names.kind, schema.required?.includes('spec') ? 'yes' : 'no'));
  lines.push('', 'The validation schema matches [' + chart.chart + ' ' + chart.version + '](' + source + ').');
  return lines.join('\n');
}

const pages = new Map();
const inventory = {};
for (const [id, entry] of resources) {
  const {crd, version, provider, filename} = entry;
  const ref = references.get(id);
  const schema = hydrateReference(entry, ref);
  const group = crd.spec.group;
  const dir = join(output, group, version.name);
  const kind = crd.spec.names.kind;
  const path = join(dir, kind.toLowerCase() + '.md');
  if (pages.has(path)) throw Error('Duplicate resource path: ' + path);
  const source = provider ? 'connectors/' + provider + '/' + filename : 'crds/' + filename;
  pages.set(path, {dir, body: pageFor(crd, version, source, provider, schema, ref.controller)});
  const url = '/' + path.slice('docs/'.length, -'.md'.length) + '/';
  (inventory[group] ??= []).push({kind, version: version.name, url, purpose: schema.description, ...(provider && {provider})});
}
rmSync(output, {recursive: true, force: true});
for (const [path, {dir, body}] of pages) {
  mkdirSync(dir, {recursive: true});
  writeFileSync(path, body + '\n');
}
writeFileSync(join(output, 'inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
console.log('Generated ' + pages.size + ' Kubernetes resource pages.');
