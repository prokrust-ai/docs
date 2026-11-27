import assert from 'node:assert/strict';
import test from 'node:test';
import {bundlePath, chartInventory, contractDigest, hydrateReference, readBundle, sameInventory} from './resource-reference.mjs';

const pins = chartInventory('contracts/kubernetes');
const refs = readBundle(bundlePath, pins);
function fixture(kind) {
  const pin = [...pins.values()].find(p => p.crd.spec.names.kind === kind);
  return [pin, structuredClone(refs.get(pin.id))];
}

test('every served version has one matching producer and valid public guidance', () => {
  for (const [id, pin] of pins) hydrateReference(pin, refs.get(id));
  const omitted = new Map(refs);
  omitted.delete(fixture('Graph')[0].id);
  assert.throws(() => sameInventory(pins, omitted, 'reference'), /Missing.*Graph/);
});

test('a missing nested config explanation names the actionable field', () => {
  const [pin, ref] = fixture('Graph');
  delete ref.descriptions['/properties/spec/properties/tables/additionalProperties/properties/tableRef/properties/name'];
  assert.throws(() => hydrateReference(pin, ref), /spec\.tables\[key\]\.tableRef\.name/);
});

test('a new example reason must belong to the finite catalog or a documented dynamic outcome', () => {
  const [pin, ref] = fixture('Graph');
  ref.controller.example.status.conditions[0].reason = 'NeverEmitted';
  assert.throws(() => hydrateReference(pin, ref), /Undeclared example outcome/);
  const [prep, dynamic] = fixture('SnapshotPreparation');
  const row = dynamic.controller.dynamicOutcomes[0];
  dynamic.controller.example.status.conditions = [{type: row.conditionType, status: row.status, reason: 'ForwardedDependencyReason'}];
  dynamic.inputs.controllerSha256 = contractDigest(dynamic.controller);
  hydrateReference(prep, dynamic);
});

test('a status-less binding and a state-based profile cannot declare conditions', () => {
  for (const kind of ['ProkrustAccessBinding', 'TableProfile']) {
    const [pin, ref] = fixture(kind);
    assert.deepEqual(ref.controller.conditions, []);
    ref.controller.conditions.push({type:'Ready', meaning:'Fabricated observation'});
    assert.throws(() => hydrateReference(pin, ref), /no conditions field/);
  }
});

test('a connector example must use fields from its own status schema', () => {
  const [pin, ref] = fixture('SyntheticConnection');
  ref.controller.example.status.runtime.nonexistent = 1;
  assert.throws(() => hydrateReference(pin, ref), /Unknown example field.*runtime.nonexistent/);
});
