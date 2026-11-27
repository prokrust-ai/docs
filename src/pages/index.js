import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';

const sections = [
  {title: 'Operator guide', to: '/operator/', description: 'Installation, configuration, and operations in your Kubernetes cluster.'},
  {title: 'User guide', to: '/user/', description: 'Core concepts and how-to guides for data, training, and predictions.'},
  {title: 'Reference Doc', to: '/reference/', description: 'Connector releases, Kubernetes resources, and public APIs.'},
];

export default function Home() {
  return <Layout title="Documentation" description="Operator and user guides and API reference for Prokrust on Kubernetes.">
    <main className="docs-home">
      <h1>Prokrust documentation</h1>
      <div className="sections">{sections.map(({title, to, description}) => <article key={to}>
        <h2><Link to={to}>{title}</Link></h2><p>{description}</p>
      </article>)}</div>
    </main>
  </Layout>;
}
