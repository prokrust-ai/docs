import React, {Children} from 'react';
import Tabs from '@theme/Tabs';

const methods = [
  {value: 'ui', label: 'Web'},
  {value: 'k8s', label: 'Kubernetes'},
  {value: 'curl', label: 'curl'},
];

export default function ActionTabs({children}) {
  const available = Children.toArray(children).map(child => child.props?.value);
  return <Tabs groupId="action-method" values={methods.filter(({value}) => available.includes(value))}>
    {children}
  </Tabs>;
}
