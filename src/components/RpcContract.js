import React from 'react';
import descriptor from '@site/contracts/control/get-table.json';

const service = descriptor.service[0];
const method = service.method[0];
const messages = descriptor.messageType;

function jsonType(field, message) {
  const nested = message.nestedType?.find(m => field.typeName?.endsWith('.' + m.name));
  if (nested?.options?.mapEntry) return 'map of string to string';
  if (field.typeName === '.google.protobuf.Struct') return 'JSON object';
  if (field.type === 'TYPE_INT64') return 'int64 (decimal string in JSON)';
  return field.type.replace('TYPE_', '').toLowerCase();
}
export function RpcPath() {
  return <pre><code>POST /{descriptor.package}.{service.name}/{method.name}</code></pre>;
}
export function RpcFields({direction, descriptions}) {
  const type = direction === 'request' ? method.inputType : method.outputType;
  const message = messages.find(m => type === '.' + descriptor.package + '.' + m.name);
  return (
    <>
      <p><code>{message.name}</code></p>
      <table>
        <thead>
          <tr><th>JSON field</th><th>Type</th><th>Purpose</th></tr>
        </thead>
        <tbody>
          {message.field.map(field => (
            <tr key={field.number}>
              <td><code>{field.jsonName}</code></td>
              <td>{jsonType(field, message)}</td>
              <td>{descriptions[field.jsonName]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
