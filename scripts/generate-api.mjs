import fs from 'node:fs';
import {byName, checkPublicBundle} from './rpc-reference.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

const {values} = parseArgs({options:{check:{type:'boolean'}}});
const root = fileURLToPath(new URL('../', import.meta.url));
const input = JSON.parse(fs.readFileSync(path.join(root, 'contracts/rpc-reference.json')));
checkPublicBundle(input);
const crds = Object.values(JSON.parse(fs.readFileSync(path.join(root,'docs/reference/kubernetes/inventory.json')))).flat();
const summary = text => text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z])/)[0];
const output = path.join(root, 'docs/reference/api/rpc');
const files = new Map();
const names = new Map(input.types.map(t => [t.name, t]));
const last = name => name.split('.').at(-1);
const kebab = name => name.replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const code = s => String.fromCharCode(96) + s + String.fromCharCode(96);
const fence = String.fromCharCode(96).repeat(3);
const block = (lang, s) => [fence + lang, s, fence].join('\n');
const inline = s => s.replace(/\s+/g, ' ').trim().replaceAll('|', '\\|');
const pretty = o => JSON.stringify(o, null, 2);
const origin = '/reference/api/';
const serviceUrl = s => origin + kebab(last(s.name)) + '/';
const methodUrl = (s,m) => s.name === 'prokrust.api.v1alpha1.CatalogService' && m.name === 'GetTable' ? origin + 'get-table/' : serviceUrl(s) + kebab(m.name) + '/';
const methodLinks = new Map(input.services.flatMap(service => service.methods.map(method =>
  [last(service.name) + '/' + method.name, methodUrl(service, method)])));
function linkMethods(description) {
  return description.replace(/\b[A-Z]\w*Service\/[A-Z]\w*\b/g, name =>
    methodLinks.has(name) ? '[' + code(name) + '](' + methodLinks.get(name) + ')' : name);
}
const typeUrl = t => origin + 'types/' + t.toLowerCase().replaceAll('.', '/') + '/';
const wellKnown = {'google.protobuf.Struct':'JSON object', 'google.protobuf.Timestamp':'RFC 3339 timestamp', 'google.protobuf.Duration':'duration in seconds',
  'google.protobuf.Value':'JSON value', 'google.protobuf.Empty':'empty object'};
const typeLink = t => {
  if (names.has(t)) return '[' + code(last(t)) + '](' + typeUrl(t) + ')';
  if (wellKnown[t]) return wellKnown[t];
  if (t.includes('.')) throw Error('Unknown referenced type ' + t);
  return code(t);
};
function fields(t) {
  if (!names.has(t)) return 'Uses the protobuf representation for ' + typeLink(t) + '.';
  const type = names.get(t);
  if (!type.fields.length) return 'This message has no fields. Its JSON representation is ' + code('{}') + '.';
  const rows = type.fields.map(f => {
    let shape = typeLink(f.type);
    if (f.mapKey) shape = 'map from ' + code(f.mapKey) + ' to ' + shape;
    if (f.repeated) shape = 'list of ' + shape;
    if (f.optional) shape += ' (explicit presence)';
    if (f.oneof) shape += ' (one of ' + code(f.oneof) + ')';
    return '| ' + code(f.name) + ' | ' + shape + ' | ' + inline(f.description) + (Object.hasOwn(f,'example') ? ' Example: '+code(inline(JSON.stringify(f.example)))+'.' : '') + ' |';
  });
  return ['| JSON field | Type | Meaning |','| --- | --- | --- |',...rows].join('\n');
}
const urls = new Set();
function page(file,title,slug,sections,label) {
  if (urls.has(slug) || files.has(file)) throw Error('Duplicate generated route ' + slug);
  urls.add(slug);
  const front = '---\ntitle: '+JSON.stringify(title)+'\nslug: '+slug.slice(0,-1)+'\n'+(label?'sidebar_label: '+JSON.stringify(label)+'\n':'')+'---';
  files.set(file, [front,...sections.filter(Boolean)].join('\n\n')+'\n');
}
const sidebar = [];
const audience = {
  installation:'Installed Web API. Use the HTTPS origin of your Prokrust installation and credentials authorized for this operation.',
  provider:'Connector runtime API for provider implementers. The platform calls the provider runtime using its authenticated workload transport.',
  licensing:'Vendor licensing runtime. The installation operator calls the configured licensing endpoint over TLS with its installation identity.',
};
for (const s of input.services) {
  const methods = [...s.methods].sort(byName);
  const dir = kebab(last(s.name));
  const prefix = 'reference/api/rpc/' + dir + '/';
  sidebar.push({type: 'category', label: last(s.name), link: {type: 'doc', id: prefix + 'index'},
    items: methods.map(m => prefix + kebab(m.name))});
  const rows = methods.map(m => '| ['+code(m.name)+']('+ methodUrl(s,m)+') | '+inline(summary(m.description))+' |');
  page(dir+'/index.md',last(s.name),serviceUrl(s),[s.description,audience[s.audience],'## Methods',
    ['| Method | Purpose |','| --- | --- |',...rows].join('\n')]);
  for (const m of s.methods) {
    const rpc = '/' + s.name + '/' + m.name;
    const streaming = m.serverStreaming || m.clientStreaming;
    const headers = s.audience === 'installation' && !streaming;
    const sections = [linkMethods(m.description), '['+last(s.name)+']('+serviceUrl(s)+') · '+audience[s.audience],block('text','POST '+rpc)];
    if (headers) sections.push('## Request headers',
      '| Header | Value and purpose |\n| --- | --- |\n| '+code('Authorization')+' | Use '+code('Bearer $PROKRUST_TOKEN')+' for a Kubernetes caller authorized for this operation. Browser calls use the signed-in session. |\n| '+code('Content-Type')+' | '+code('application/json')+' selects ProtoJSON for this unary request. |\n| '+code('Connect-Protocol-Version')+' | '+code('1')+' selects version 1 of the Connect protocol. |');
    if (streaming) sections.push('This RPC uses '+(m.serverStreaming?'a response stream':'a request stream')+'. The example shows one message. Use a streaming Connect client for the sequence.');
    sections.push('## Request fields',typeLink(m.input),fields(m.input),'## Example request');
    if (headers) {
      sections.push('Set '+code('PROKRUST_URL')+' to the installation’s HTTPS origin and '+code('PROKRUST_TOKEN')+' to your caller token. Replace the sample values with values from your installation.',
        block('bash',["curl --fail-with-body --silent --show-error \\",
          '  -H "Authorization: Bearer $PROKRUST_TOKEN" \\',
          "  -H 'Content-Type: application/json' \\","  -H 'Connect-Protocol-Version: 1' \\",
          '  "$PROKRUST_URL'+rpc+'" \\',"  --data-binary @- <<'JSON'",pretty(m.examples.request),'JSON'].join('\n')));
    } else sections.push(block('json',pretty(m.examples.request)));
    if (m.unimplemented) sections.push('## Returned error',block('json',pretty(m.examples.error)));
    else {
      sections.push('## Response fields',typeLink(m.output),fields(m.output),
        m.serverStreaming?'## Example response message':'## Example response',block('json',pretty(m.examples.response)));
      if (m.examples.error) sections.push('## Example error',block('json',pretty(m.examples.error)));
    }
    if (m.errors) sections.push('## Errors', ['| Connect code | What to check |', '| --- | --- |',
      ...Object.entries(m.errors).map(([status, hint]) => '| ' + code(status) + ' | ' + inline(hint) + ' |')].join('\n'));
    if (s.audience === 'installation' && !m.unimplemented) {
      const match = /^(?:Create|Get|Update|List|Delete|Watch)([A-Z].*)$/.exec(m.name);
      const resources = match ? crds.filter(({kind}) => [kind,kind+'s',kind.replace(/y$/, 'ies')].includes(match[1])) : [];
      if (resources.length) sections.push('## Kubernetes reference', ...resources.map(({kind,url}) =>
        'See the ['+kind+' reference]('+url+') for the resource configuration and controller observations.'));
      else if ([m.input, m.output].some(t => ['Resource','CreateResourceRequest','UpdateResourceRequest'].includes(last(t)))) {
        sections.push('For the fields inside a resource definition or status, select the kind in the [Kubernetes reference](/reference/#kubernetes-resources).');
      }
    }
    page(dir+'/'+kebab(m.name)+'.md',last(s.name)+'.'+m.name,methodUrl(s,m),sections,m.name);
  }
}
for (const t of input.types) {
  const sections = [t.description,code(t.name)];
  if (t.kind === 'message') sections.push('## Fields',fields(t.name));
  else sections.push('## Values',['| Value | Number | Meaning |','| --- | --- | --- |',
    ...t.values.map(v => '| '+code(v.name)+' | '+v.number+' | '+inline(v.description)+' |')].join('\n'));
  page('types/'+t.name+'.md',last(t.name),typeUrl(t.name),sections);
}
const groups = [
  ['Installation API','installation'],['Provider API','provider'],['Operator licensing API','licensing'],
];
const listing = groups.flatMap(([heading,key]) => ['## '+heading,
  input.services.filter(s=>s.audience===key).map(s=>'- ['+last(s.name)+']('+serviceUrl(s)+') — '+inline(summary(s.description))).join('\n')]);
page('index.md','Public API',origin,['Choose the interface for the component you call. Each RPC page gives its fields, examples, and response or error. Available methods and fields depend on the component versions in your installation.',...listing]);
files.set('sidebar.json',pretty(sidebar)+'\n');
function existing(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?existing(path.join(dir,e.name)):[path.relative(output,path.join(dir,e.name))]);
}
for (const extra of existing(output).filter(f=>!files.has(f))) {
  if (values.check) throw Error('Stale RPC page ' + extra);
  fs.unlinkSync(path.join(output,extra));
}
for (const [file, contents] of files) {
  const dest = path.join(output,file);
  if (values.check) {
    if (fs.readFileSync(dest,'utf8') !== contents) throw Error('Stale RPC page ' + file);
  } else { fs.mkdirSync(path.dirname(dest),{recursive:true}); fs.writeFileSync(dest,contents); }
}
console.log('Verified ' + urls.size + ' RPC reference pages.');
