import {themes} from 'prism-react-renderer';

export default {
  title: 'Prokrust documentation',
  tagline: 'Run predictive workloads on Kubernetes',
  url: 'https://docs.prokrust.ai',
  baseUrl: '/',
  trailingSlash: true,
  favicon: 'img/favicon.png',
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  markdown: {format: 'detect', hooks: {onBrokenMarkdownLinks: 'throw'}},
  presets: [['classic', {
    docs: {routeBasePath: '/', sidebarPath: './sidebars.js'},
    blog: false,
    theme: {customCss: './src/css/docs.css'},
  }]],
  themes: [['@easyops-cn/docusaurus-search-local', {
    hashed: true, indexBlog: false, docsRouteBasePath: '/', highlightSearchTermsOnTargetPage: true,
  }]],
  themeConfig: {
    colorMode: {respectPrefersColorScheme: true},
    navbar: {
      logo: {alt: 'Prokrust', src: 'img/prokrust-light.png', srcDark: 'img/prokrust-dark.png', href: '/', target: '_self'},
      items: [
        {to: '/operator/workspaces/', label: 'Operator guide', position: 'left'},
        {to: '/user/', label: 'User guide', position: 'left'},
        {to: '/reference/', label: 'Reference Doc', position: 'left'},
      ],
    },
    prism: {theme: themes.github, darkTheme: themes.dracula, additionalLanguages: ['bash', 'protobuf', 'yaml']},
  },
};
