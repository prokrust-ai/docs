import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';

const sections = [
  {title: 'Operator guide', to: '/operator/workspaces/', description: 'Prepare a workspace and verify connector access in your Kubernetes cluster.'},
  {title: 'User guide', to: '/user/', description: 'Learn how tables use source connections. Choose a guide to register your own data or try a synthetic source.'},
  {title: 'Reference Doc', to: '/reference/', description: 'Look up Kubernetes resource fields, connector settings and control API requests.'},
];

export default function Home() {
  return <Layout title="Documentation" description="Operator and user guides and API reference for Prokrust on Kubernetes.">
    <main className="docs-home">
      <h1>Prokrust documentation</h1>
      <p className="intro">Prokrust runs in your Kubernetes cluster. Connect source tables, describe their relationships, and use predictive queries to train models and make predictions.</p>
      <div className="sections">{sections.map(({title, to, description}) => <article key={to}>
        <h2><Link to={to}>{title}</Link></h2><p>{description}</p>
      </article>)}</div>
    </main>
  </Layout>;
}
