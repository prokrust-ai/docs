import assert from 'node:assert/strict';
import test from 'node:test';
import {checkPublicBundle, publicProjection} from './rpc-reference.mjs';

const message = {name:'public.Record', fields:[{name:'next', type:'public.Record'}]};
const service = {name:'public.Catalog', methods:[{name:'Get', input:message.name, output:message.name}]};
function bundle() {
  const types = new Map([[message.name, message]]);
  const {sha256} = publicProjection([service], types);
  return {formatVersion:1, sources:[{module:'test', services:[service.name], sha256}], services:[service], types:[message]};
}

test('recursive types are included once', () => checkPublicBundle(bundle()));
test('a type unreachable from every published method is rejected', () => {
  const data = bundle();
  data.types.push({name:'internal.Record', fields:[]});
  assert.throws(() => checkPublicBundle(data), /Unreferenced/);
});
test('editing a field explanation without refreshing the source fails verification', () => {
  const data = structuredClone(bundle());
  data.types[0].fields[0].description = 'New description';
  assert.throws(() => checkPublicBundle(data), /digest differs/);
});
