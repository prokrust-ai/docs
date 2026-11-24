import React from 'react';
import MDXDetails from '@theme-original/MDXComponents/Details';

export default function Details(props) {
  // Native disclosures open when a fragment link targets a field inside them.
  if (props.className === 'crd-disclosure') return <details {...props} />;
  return <MDXDetails {...props} />;
}
