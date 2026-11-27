import {createHash} from 'node:crypto';

export function byName(a, b) {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

// Project each source through its public signatures. A type can be shared by services.
export function publicProjection(services, types) {
  const reachable = new Map();
  function visit(name) {
    if (reachable.has(name) || name.startsWith('google.protobuf.')) return;
    const type = types.get(name);
    if (!type) throw Error('Unknown public RPC type ' + name);
    reachable.set(name, type);
    for (const field of type.fields ?? []) {
      if (field.type.includes('.')) visit(field.type);
    }
  }
  for (const service of services) {
    for (const method of service.methods) {
      visit(method.input);
      visit(method.output);
    }
  }
  const projection = {services: [...services].sort(byName), types: [...reachable.values()].sort(byName)};
  const sha256 = createHash('sha256').update(JSON.stringify(projection)).digest('hex');
  return {sha256, reachable};
}

export function checkPublicBundle(bundle) {
  if (bundle.formatVersion !== 1) throw Error('Unsupported RPC bundle format');
  const types = new Map(bundle.types.map(type => [type.name, type]));
  const services = new Map(bundle.services.map(service => [service.name, service]));
  if (types.size !== bundle.types.length || services.size !== bundle.services.length) throw Error('Duplicate public definition');
  const covered = new Set();
  const reachable = new Set();
  for (const source of bundle.sources) {
    const group = source.services.map(name => {
      if (covered.has(name) || !services.has(name)) throw Error('Invalid source for service ' + name);
      covered.add(name);
      return services.get(name);
    });
    const result = publicProjection(group, types);
    if (result.sha256 !== source.sha256) throw Error('Public contract digest differs for ' + source.module);
    for (const name of result.reachable.keys()) reachable.add(name);
  }
  if (covered.size !== services.size || reachable.size !== types.size) throw Error('Unreferenced service or type in RPC bundle');
}
