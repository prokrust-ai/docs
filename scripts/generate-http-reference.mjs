import assert from 'node:assert/strict';
import Ajv2020 from 'ajv/dist/2020.js';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inputs = join(root, 'contracts/http');
const output = join(root, 'docs/reference/api/http');
const checking = process.argv.includes('--check');
const groups = new Map();
const operationIds = new Set();
const slug = (name) => name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
const relativeRef = (schema) => schema.$ref?.split('/').at(-1);
const inline = (text) => String(text).replaceAll('|', '\\|').replaceAll('\n', ' ');
const code = (word) => '`' + word + '`';
const header = (title, id) => `---\ntitle: ${JSON.stringify(title)}\nslug: /reference/api/http/${id}\n---\n`;
const block = (language, value) => '\n```' + language + '\n' + value + '\n```\n';

async function emit(file, content) {
  if (checking) {
    assert.equal(await readFile(file, 'utf8'), content, `Regenerate ${file}`);
    return;
  }
  await mkdir(dirname(file), {recursive: true});
  await writeFile(file, content);
}

function typeName(schema) {
  if (!schema) return 'unspecified';
  const ref = relativeRef(schema);
  if (ref) return `[${ref}](#type-${slug(ref)})`;
  if (schema.oneOf) return schema.oneOf.map(typeName).join(' or ');
  if (schema.type === 'array') return 'array of ' + typeName(schema.items);
  if (schema.format === 'binary') return 'binary';
  return Array.isArray(schema.type) ? schema.type.join(' or ') : schema.type || 'values';
}

function schemaNotes(schema) {
  const parts = [schema.description || ''];
  if (schema.enum) parts.push('Values ' + schema.enum.map(code).join(', ') + '.');
  if (schema.default !== undefined) parts.push('Default ' + code(schema.default) + '.');
  if (schema.minimum !== undefined && schema.maximum !== undefined)
    parts.push('Range ' + code(schema.minimum) + ' to ' + code(schema.maximum) + '.');
  return parts.join(' ').trim();
}

function fieldRows(schema, parent = '') {
  const result = [];
  for (const [name, field] of Object.entries(schema.properties || {})) {
    const path = parent ? parent + '.' + name : name;
    const required = (schema.required || []).includes(name) ? 'yes' : 'no';
    const desc = schemaNotes(field) || (field.$ref ? 'See the linked fields.' : '');
    assert(desc, `Missing field purpose for ${path}`);
    result.push([code(path), typeName(field), required, desc]);
    if (field.properties) result.push(...fieldRows(field, path));
    if (field.items?.properties) result.push(...fieldRows(field.items, path + '[]'));
  }
  return result;
}

function table(headers, rows) {
  if (!rows.length) return '';
  return '\n' + [headers, headers.map(() => '---'), ...rows].map(row => '| ' + row.map(inline).join(' | ') + ' |').join('\n') + '\n';
}

function fields(schema) {
  return table(['Field', 'Type', 'Required in its object', 'Meaning'], fieldRows(schema));
}

function collectRefs(schema, components, refs) {
  if (!schema || typeof schema !== 'object') return;
  const ref = relativeRef(schema);
  if (ref && !refs.has(ref)) {
    assert(components[ref], `Unknown schema ${ref}`);
    refs.add(ref);
    collectRefs(components[ref], components, refs);
  }
  for (const value of Object.values(schema)) collectRefs(value, components, refs);
}

function validateExamples(spec) {
  const ajv = new Ajv2020({strict: false, validateFormats: false});
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      for (const message of [op.requestBody, ...Object.values(op.responses)]) {
        for (const media of Object.values(message?.content || {})) {
          const examples = Object.values(media.examples || {}).map(example => example.value);
          if (media.example !== undefined) examples.push(media.example);
          if (!examples.length) continue;
          const validate = ajv.compile({...media.schema, components: spec.components});
          for (const example of examples)
            assert(validate(example), method + ' ' + path + ': ' + ajv.errorsText(validate.errors));
        }
      }
    }
  }
}

function bodyExample(media, example) {
  return media.includes('json') ? block('json', JSON.stringify(example, null, 2)) : block('text', example);
}

function renderOperation(method, path, op) {
  let md = `\n## ${op.summary} {#${slug(op.operationId)}}\n\n${code(method.toUpperCase() + ' ' + path)}\n\n${op.description}\n`;
  if (op.parameters?.length) {
    md += table(['Parameter', 'Location', 'Required', 'Meaning'], op.parameters.map(p => [code(p.name), p.in, p.required ? 'yes' : 'no', p.description]));
  }
  const request = op.requestBody?.content?.['application/json'];
  if (request) {
    md += `\n**Request body** · ${typeName(request.schema)}\n`;
    md += fields(request.schema);
    if (request.example !== undefined) md += bodyExample('application/json', request.example);
  }
  if (op['x-request-example']) md += block('bash', op['x-request-example']);
  const responses = Object.entries(op.responses);
  md += table(['HTTP status', 'Response body', 'Meaning'], responses.map(([status, r]) => {
    const media = Object.entries(r.content || {});
    const body = media.map(([kind, data]) => typeName(data.schema) + ' (' + code(kind) + ')').join(', ');
    return [code(status), body || 'See outcome', r.description];
  }));
  for (const [status, response] of responses) {
    const entries = Object.entries(response.content || {});
    const headers = Object.entries(response.headers || {});
    if (headers.length) md += table([status + ' response header', 'Meaning'], headers.map(([name, h]) => [code(name), h.description]));
    for (const [media, body] of entries) {
      if (body.schema?.properties) md += fields(body.schema);
      for (const entry of Object.values(body.examples || {})) {
        md += '\n**' + status + ' · ' + entry.summary + '**\n' + bodyExample(media, entry.value);
      }
      if (body.example !== undefined) md += '\n**' + status + ' response example**\n' + bodyExample(media, body.example);
    }
  }
  return md;
}

function renderGroup(spec, tag, file) {
  const refs = new Set();
  const components = spec.components.schemas;
  const release = spec.info['x-release'];
  const preview = release.installedRelease;
  const note = preview
    ? `Source revision ${code(release.commit.slice(0, 12))}. The pinned component release is ${code(preview)}.`
    : `Component release ${code(release.tag)}. Source revision ${code(release.commit.slice(0, 12))}.`;
  let md = header(tag['x-title'], tag.name) + '\n' + tag.description + '\n';
  if (tag['x-release-note']) md += '\n' + tag['x-release-note'] + '\n';
  md += '\n' + note;
  if (preview) {
    const pinned = release.component + '-' + preview + '.json';
    md += ' [Release OpenAPI contract](/openapi/' + pinned + ') · [Source preview OpenAPI contract](/openapi/' + file + ')\n';
  } else {
    md += ' [OpenAPI contract](/openapi/' + file + ')\n';
  }
  const operations = [];
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      if (!op.tags.includes(tag.name)) continue;
      assert(!operationIds.has(op.operationId), 'Duplicate operation ID ' + op.operationId);
      operationIds.add(op.operationId);
      collectRefs(op, components, refs);
      operations.push([method, path, op]);
    }
  }
  assert(operations.length, 'Empty group ' + tag.name);
  md += table(['Method and path', 'Purpose'], operations.map(([method, path, op]) => [code(method.toUpperCase() + ' ' + path), `[${op.summary}](#${slug(op.operationId)})`]));
  for (const [method, path, op] of operations) md += renderOperation(method, path, op);
  if (tag['x-metric-gauges']) {
    md += '\n## Exported gauges\n\nMetric names below use the prefix `prokrust_license_operator_`. Read each HELP line for its definition at the installed version.\n';
    md += table(['Name after the prefix', 'Observation'], Object.entries(tag['x-metric-gauges']).map(([name, meaning]) => [code(name), meaning]));
  }
  if (tag['x-metric-counters']) {
    md += '\n## Exported counters\n\nCounter values accumulate during the lifetime of each replica. Admission samples include the outcome and dry_run labels. Startup samples include the outcome label.\n';
    md += table(['Name after the prefix', 'Observation'], Object.entries(tag['x-metric-counters']).map(([name, meaning]) => [code(name), meaning]));
  }
  for (const [title, description] of tag['x-payload-notes'] || []) md += '\n## ' + title + '\n\n' + description + '\n';
  if (refs.size) md += '\n## Shared message fields\n';
  for (const name of [...refs].sort()) {
    const schema = components[name];
    md += `\n### ${name} {#type-${slug(name)}}\n\n${schema.description}\n` + fields(schema);
  }
  return md.trimEnd() + '\n';
}

for (const file of (await readdir(inputs)).filter(f => f.endsWith('.json')).sort()) {
  const data = await readFile(join(inputs, file), 'utf8');
  const spec = JSON.parse(data);
  assert.equal(spec.openapi, '3.1.0');
  assert.match(spec.info['x-release'].commit, /^[0-9a-f]{40}$/);
  validateExamples(spec);
  const release = spec.info['x-release'];
  if (release.installedRelease) {
    const name = release.component + '-' + release.installedRelease + '.json';
    const pinnedData = await readFile(join(inputs, 'releases', name), 'utf8');
    const pinned = JSON.parse(pinnedData);
    assert.equal(pinned.info['x-release'].commit, release.installedCommit);
    assert.equal(pinned.info['x-release'].tag, release.installedRelease);
    validateExamples(pinned);
    await emit(join(root, 'static/openapi', name), pinnedData);
  }
  const tags = new Set(spec.tags.map(t => t.name));
  for (const methods of Object.values(spec.paths)) {
    for (const op of Object.values(methods)) {
      assert.equal(op.tags.length, 1);
      assert(tags.has(op.tags[0]), `Operation ${op.operationId} has no group`);
      assert(op.summary && op.description && op.responses, 'Incomplete operation ' + op.operationId);
    }
  }
  await emit(join(root, 'static/openapi', file), data);
  for (const tag of spec.tags) {
    assert(!groups.has(tag.name), 'Duplicate HTTP group ' + tag.name);
    groups.set(tag.name, tag['x-title']);
    await emit(join(output, tag.name + '.md'), renderGroup(spec, tag, file));
  }
}

const ordering = ['web-session', 'performance', 'inference', 'web-health', 'operator-metrics'];
assert.deepEqual([...groups.keys()].sort(), ordering.slice().sort(), 'Review HTTP group inventory');
let index = header('HTTP APIs', '') + '\nChoose the listener for the operation you need. Browser sessions and performance capture share the installed Web API origin. Online prediction uses the selected inference endpoint. The license metrics service is available to the monitoring clients authorized by the installation.\n';
index += table(['Reference', 'Listener'], ordering.map((id, i) => [`[${groups.get(id)}](/reference/api/http/${id}/)`, ['Web API', 'Web API', 'Inference endpoint', 'Web API', 'Operator metrics service'][i]]));
index += '\nThe system chart also configures kubelet probes on controller pods, Kubernetes admission webhooks, and a private workload startup-authorization listener. Kubernetes and installed components call these endpoints. License-server management belongs to the vendor deployment. Workspace users perform the corresponding operations through the public control API or the Kubernetes resources.\n';
await emit(join(output, 'index.md'), index);
if (checking) {
  assert.deepEqual((await readdir(output)).filter(f => f.endsWith('.md')).sort(),
    ['index', ...ordering].map(x => x + '.md').sort(), 'Obsolete HTTP reference pages');
}
