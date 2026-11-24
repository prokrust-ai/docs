import {byName, checkPublicBundle, publicProjection} from './rpc-reference.mjs';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {parseArgs} from 'node:util';

const {values} = parseArgs({options: {
  control: {type: 'string'}, protocol: {type: 'string'}, license: {type: 'string'}, check: {type: 'boolean'},
}});
const audiences = new Set(['installation', 'provider', 'licensing', 'private']);
const sources = [];
const publicTypes = new Map();
const catalog = [];
const target = new URL('../contracts/rpc-reference.json', import.meta.url);
const work = mkdtempSync(path.join(tmpdir(), 'prokrust-rpc-'));

function requireText(value, name) {
  if (!value) throw Error('Missing public documentation for ' + name);
  return value;
}
function extractComments(raw) {
  const tags = {};
  const prose = [];
  for (const line of (raw ?? '').trim().split('\n').map(line => line.trim())) {
    if (!line.startsWith('@')) { prose.push(line); continue; }
    const match = line.match(/^@(request|response|unimplemented|error|example|audience)(?:\s+(.*))?$/);
    if (!match || Object.hasOwn(tags, match[1])) throw Error('Invalid or duplicate RPC comment directive: ' + line);
    const [, key, data] = match;
    if (key === 'audience' && audiences.has(data)) tags[key] = data;
    else if (key === 'unimplemented' && !data) tags[key] = true;
    else tags[key] = JSON.parse(data);
  }
  return {description: prose.join('\n').trim(), tags};
}
function exportModule(label, repo) {
  if (!repo) throw Error('Supply --control, --protocol and --license with their protobuf source directories.');
  const image = path.join(work, label + '.json');
  execFileSync('buf', ['build', '--as-file-descriptor-set', '-o', image], {cwd: repo});
  const descriptors = JSON.parse(readFileSync(image)).file;
  const types = new Map();
  const start = catalog.length;
  for (const file of descriptors) {
    const comments = new Map((file.sourceCodeInfo?.location ?? []).map(loc => [String(loc.path), loc.leadingComments]));
    const comment = pos => extractComments(comments.get(String(pos)));
    function index(nodes, parent, pos, kind) {
      for (const [i, node] of (nodes ?? []).entries()) {
        const name = parent + '.' + node.name;
        const at = [...pos, i];
        types.set(name, {node, at, comment, kind});
        index(node.nestedType, name, [...at, 3], 'message');
        index(node.enumType, name, [...at, 4], 'enum');
      }
    }
    index(file.messageType, file.package, [4], 'message');
    index(file.enumType, file.package, [5], 'enum');
  }
  function visit(name) {
    if (name.startsWith('google.protobuf.') || publicTypes.has(name)) return;
    const {node, at, comment, kind} = types.get(name);
    const description = requireText(comment(at).description, name);
    const result = {name, description, kind};
    publicTypes.set(name, result);
    if (kind === 'enum') {
      result.values = node.value.map((value, i) => ({name: value.name, number: value.number ?? 0,
        description: requireText(comment([...at, 2, i]).description, name + '.' + value.name)}));
      return;
    }
    result.fields = (node.field ?? []).map((field, i) => {
      function fieldType(f) { return f.typeName?.slice(1) ?? f.type.slice(5).toLowerCase(); }
      const type = fieldType(field);
      const entry = types.get(type)?.node;
      const docs = comment([...at, 2, i]);
      const description = requireText(docs.description, name + '.' + field.name);
      const out = {name: field.jsonName, protoName: field.name, number: field.number, description, ...(Object.hasOwn(docs.tags, 'example') && {example: docs.tags.example})};
      if (entry?.options?.mapEntry) {
        out.mapKey = fieldType(entry.field[0]); out.type = fieldType(entry.field[1]);
      } else {
        out.type = type;
        if (field.label === 'LABEL_REPEATED') out.repeated = true;
        if (field.proto3Optional) out.optional = true;
        if (!field.proto3Optional && field.oneofIndex !== undefined) out.oneof = node.oneofDecl[field.oneofIndex].name;
      }
      if (out.type.includes('.')) visit(out.type);
      return out;
    });
  }
  for (const file of descriptors) {
    const comments = new Map((file.sourceCodeInfo?.location ?? []).map(loc => [String(loc.path), loc.leadingComments]));
    for (const [i, service] of (file.service ?? []).entries()) {
      const name = file.package + '.' + service.name;
      if (!file.package.startsWith('prokrust.')) continue;
      const docs = extractComments(comments.get(String([6,i])));
      const audience = docs.tags.audience;
      if (!audiences.has(audience)) throw Error('Missing @audience for ' + name);
      if (audience === 'private') continue;
      const description = requireText(docs.description, name);
      const methods = service.method.map((m, j) => {
        const id = name + '/' + m.name;
        const {description, tags} = extractComments(comments.get(String([6,i,2,j])));
        requireText(description, id);
        const input = m.inputType.slice(1), output = m.outputType.slice(1);
        visit(input); visit(output);
        const examples = {request: tags.request};
        if (tags.unimplemented) {
          if (tags.error?.code !== 'unimplemented' || !tags.error.message || tags.response !== undefined) throw Error('Expected only an unimplemented error for ' + id);
          examples.error = tags.error;
        } else {
          examples.response = tags.response;
          if (tags.error) examples.error = tags.error;
        }
        for (const key of ['request', ...(tags.unimplemented ? [] : ['response'])]) {
          if (examples[key] === undefined) throw Error('Missing @' + key + ' for ' + id);
          try {
            execFileSync('buf', ['convert', image, '--type', key === 'request' ? input : output, '--from', '-#format=json', '--to', '-#format=binpb'],
              {input: JSON.stringify(examples[key]), stdio: ['pipe', 'ignore', 'pipe']});
          } catch (err) { throw Error(id + ' @' + key + ': ' + err.stderr); }
        }
        return {name: m.name, description, input, output, ...(m.clientStreaming && {clientStreaming:true}),
          ...(m.serverStreaming && {serverStreaming:true}), ...(tags.unimplemented && {unimplemented:true}), examples};
      });
      catalog.push({name, audience, description, methods});
    }
  }
  if (catalog.length === start) throw Error('No public services found in ' + label);
  const group = catalog.slice(start);
  const {sha256} = publicProjection(group, publicTypes);
  sources.push({module: label, services: group.map(service => service.name).sort(), sha256});
}
try {
  for (const key of ['control','protocol','license']) exportModule(key, values[key]);
  const data = {formatVersion: 1, sources, services: catalog.sort(byName), types: [...publicTypes.values()].sort(byName)};
  checkPublicBundle(data);
  const bundle = JSON.stringify(data, null, 2) + '\n';
  if (values.check) {
    if (bundle !== readFileSync(target, 'utf8')) throw Error('RPC reference differs from the protobuf sources. Run refresh:api.');
  } else writeFileSync(target, bundle);
  console.log('Verified ' + catalog.reduce((n,s) => n+s.methods.length, 0) + ' RPCs and ' + publicTypes.size + ' public types.');
} finally { rmSync(work, {recursive:true, force:true}); }
