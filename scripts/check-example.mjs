import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import Ajv from 'ajv';
import {parse, parseAllDocuments} from 'yaml';

const read = (path) => readFileSync(path, 'utf8');
const exampleDocs = parseAllDocuments(read('static/examples/synthetic-table.yaml'));
assert.equal(exampleDocs.length, 2);
const [connection, table] = exampleDocs.map(d => {
  assert.deepEqual(d.errors, []);
  return d.toJS();
});
const ajv = new Ajv({strict: false, validateFormats: false, allErrors: true});
function check(schema, object, label) {
  const valid = ajv.compile(schema);
  assert.ok(valid(object), label + ': ' + ajv.errorsText(valid.errors));
}
for (const [file, object] of [
  ['connectors/synthetic/syntheticconnections.sources.prokrust.ai.yaml', connection],
  ['crds/data.prokrust.ai_tables.yaml', table],
]) {
  const {spec} = parse(read('contracts/kubernetes/' + file));
  const version = spec.versions.find(v => v.served && object.apiVersion === spec.group + '/' + v.name);
  assert.ok(version, object.apiVersion);
  assert.equal(object.kind, spec.names.kind);
  check(version.schema.openAPIV3Schema, object, object.kind);
}
const {version, schemas} = JSON.parse(read('contracts/releases.json')).synthetic;
for (const [file, object] of [
  ['connection-v1.json', connection.spec],
  ['selector-v1.json', table.spec.source.selector.config],
]) {
  const raw = read('contracts/synthetic/' + version + '/' + file);
  assert.equal(createHash('sha256').update(raw).digest('hex'), schemas[file]);
  check(JSON.parse(raw), object, file);
}
assert.deepEqual(table.spec.source.connectionRef, {apiVersion: connection.apiVersion, kind: connection.kind, name: connection.metadata.name});
assert.equal(table.spec.source.selector.schemaVersion, 'v1');
const generated = JSON.parse(read('static/examples/generated/requests.json'));
assert.deepEqual(JSON.parse(Buffer.from(generated.fixture.specJson, 'base64').toString()), connection.spec);
assert.deepEqual(generated.events.spec, table.spec);

const template = parse(read('docs/user/_table-template.yaml'));
const createRequest = JSON.parse(read('static/examples/generated/create-table-template.json'));
assert.deepEqual(createRequest, {namespace: '<workspace>', name: template.metadata.name, spec: template.spec});

console.log('The quickstart matches the pinned schemas. Kubernetes and curl examples use the same table specs.');
