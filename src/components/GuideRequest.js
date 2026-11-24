import React from 'react';
import CodeBlock from '@theme/CodeBlock';

export default function GuideRequest({method, body}) {
  const command = [
    'curl --fail-with-body --silent --show-error \\',
    '  -H "Authorization: Bearer $PROKRUST_TOKEN" \\',
    "  -H 'Content-Type: application/json' \\",
    "  -H 'Connect-Protocol-Version: 1' \\",
    '  "$PROKRUST_URL/prokrust.api.v1alpha1.' + method + '" \\',
    '  --data-binary @- <<JSON',
    JSON.stringify(body, null, 2),
    'JSON',
  ].join('\n');
  return <CodeBlock language="bash">{command}</CodeBlock>;
}
