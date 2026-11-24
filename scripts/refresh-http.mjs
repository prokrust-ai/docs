import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

const {values} = parseArgs({options: {
  'web-api': {type: 'string'}, serving: {type: 'string'}, operator: {type: 'string'}, check: {type: 'boolean'},
}});
const root = fileURLToPath(new URL('../contracts/http/', import.meta.url));
const exports = new Map();
for (const [component, script] of Object.entries({
  'web-api': 'scripts/export-http-api.py',
  serving: 'scripts/export-http-api.py',
  operator: 'scripts/export-http-metrics.py',
})) {
  const cwd = values[component];
  if (!cwd) throw Error('Supply --web-api, --serving and --operator with the producer checkouts.');
  function exportContract(args) {
    const data = execFileSync('python3', [script, ...args], {cwd, encoding: 'utf8'});
    const spec = JSON.parse(data);
    if (spec.openapi !== '3.1.0' || !Object.keys(spec.paths).length) throw Error('Empty or invalid OpenAPI export from ' + component);
    return {spec, data};
  }
  const {spec, data} = exportContract([]);
  exports.set(component + '.json', data);
  const pinnedRelease = spec.info['x-release'].installedRelease;
  if (pinnedRelease) {
    if (!/^v[0-9][a-z0-9.-]*$/i.test(pinnedRelease)) throw Error('Invalid release identifier ' + pinnedRelease);
    exports.set(join('releases', component + '-' + pinnedRelease + '.json'), exportContract(['--installed']).data);
  }
}
for (const [name, data] of exports) {
  const dest = join(root, name);
  if (values.check) {
    if (readFileSync(dest, 'utf8') !== data) throw Error('Stale HTTP contract ' + name);
  } else {
    mkdirSync(dirname(dest), {recursive: true});
    writeFileSync(dest, data);
  }
}
console.log('Verified ' + exports.size + ' public OpenAPI contracts.');
