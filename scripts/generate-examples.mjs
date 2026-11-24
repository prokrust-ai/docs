import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {parse, parseAllDocuments} from 'yaml';

const dir = 'static/examples';
const [connection, table] = parseAllDocuments(readFileSync(dir + '/synthetic-table.yaml', 'utf8'));
const requests = {};
mkdirSync(dir + '/generated', {recursive: true});
for (const doc of [connection, table]) {
  if (doc.errors.length) throw doc.errors[0];
  const {apiVersion, kind, metadata, spec} = doc.toJS();
  const request = {namespace: '${WORKSPACE}', name: metadata.name};
  if (kind === 'SyntheticConnection') {
    request.type = {apiVersion, kind};
    request.specJson = Buffer.from(JSON.stringify(spec), 'utf8').toString('base64');
  } else if (kind === 'Table') {
    request.spec = spec;
  } else {
    throw Error('Unexpected resource kind: ' + kind);
  }
  writeFileSync(dir + '/generated/' + metadata.name + '.yaml', doc.toString().replace(/^---\n/, ''));
  requests[metadata.name] = request;
}
writeFileSync(dir + '/generated/requests.json', JSON.stringify(requests, null, 2) + '\n');

const template = parse(readFileSync('docs/user/_table-template.yaml', 'utf8'));
const createRequest = {namespace: '<workspace>', name: template.metadata.name, spec: template.spec};
writeFileSync(dir + '/generated/create-table-template.json', JSON.stringify(createRequest, null, 2) + '\n');
