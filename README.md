# Prokrust documentation

Docusaurus source for `docs.prokrust.ai`. Includes the operator and user guides, Kubernetes resources generated from the pinned public CRD chart, the synthetic provider schemas, and the GetTable control API reference.

## Local development

Use Node.js 22.13 or newer and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm start
```

`pnpm build` regenerates the Kubernetes pages, checks the example against the CRD and provider schemas, validates internal links, and builds the static site and local search index. Use `pnpm serve` to preview the production build with search. These checks run without a cluster.

## Update contract inputs

`contracts/releases.json` pins the Kubernetes chart source, provider schemas and control schema independently. The versions identify the inputs used to build this reference.

- **Kubernetes.** Copy the selected public `prokrust-crds` chart's complete `files/` into `contracts/kubernetes/` when changing the pin. The reference uses every served core kind and every connector in the chart's lock. The refresh checks their validation schemas against the selected producers. [Public charts](https://github.com/prokrust-ai/helm-charts/tree/main/charts/prokrust-crds)
- **Connector configuration.** Keep each published version's schemas under `contracts/<connector>/<release>/`. Add a release page below the provider in the sidebar. Bind the page to those versioned files. When the quickstart moves to a new release, update its pin and schema digests in `contracts/releases.json`. Keep previous release pages and schema files available. The synthetic walkthrough generates its per-resource YAML and Connect request bodies from the same validated example under `static/examples/`.
- **Control API.** The checked-in GetTable descriptor contains the method and its message fields. From the selected control schema, run `buf build --type prokrust.api.v1alpha1.CatalogService.GetTable --as-file-descriptor-set --exclude-source-info -o descriptor.json`. Copy the `file` entry for package `prokrust.api.v1alpha1` to `contracts/control/get-table.json`. Update the schema pin alongside the descriptor.

The default build consumes the checked-in inputs. Public API examples target the reader's installation and use copyable requests.

## Generate the Kubernetes reference

The public build combines the pinned Kubernetes schemas with `contracts/resource-reference.json`. The bundle contains field descriptions, the controller's condition catalog, and tested status examples. Each entry identifies its full API group, version, and kind. The saved input includes the pinned manifest’s byte digest and canonical JSON digests for the documented OpenAPI schema and controller export. Public builds can run without source checkouts, registry access, or a cluster.

From this repository, run the source workflow with local checkouts of the Rust API, operator, connector SDK and providers. `CONNECTORS_DIR` contains the `sdk` checkout alongside one checkout per provider. The producer tools use Cargo, Helm, and Python 3.11 or later. Cargo needs access to the dependencies pinned in the producer lockfiles.

```sh
pnpm refresh:reference --api "$API_REPO" --operator "$OPERATOR_REPO" --connectors "$CONNECTORS_DIR"
pnpm refresh:reference --api "$API_REPO" --operator "$OPERATOR_REPO" --connectors "$CONNECTORS_DIR" --check
pnpm build
```

The core API generates its CRDs from Rust. The operator exercises its status writers and exports one JSON document per kind into the system chart’s `files/reference/`. Each provider supplies its rendered connection CRD. The SDK exports the provider’s status contract into the runtime chart’s `files/reference/`. A change to a condition, reason, message in an example, or field explanation belongs in its producer.

To import packaged artifacts, extract the matching `prokrust-crds`, `prokrust-system`, and `connector-<provider>` charts into a common directory. Use chart versions that contain the reference exports. The local source workflow also supports previewing producer changes before their first release.

```sh
pnpm refresh:reference --charts "$CHARTS_DIR"
pnpm refresh:reference --charts "$CHARTS_DIR" --check
pnpm build
```

To refresh one existing resource, pass its producer CRD and controller JSON with `--crd FILE --controller FILE`. The importer checks the resource’s identity and validation schema against the pinned chart before replacing its entry. For Graph, the previous `refresh:graph` command uses this same bundle. Review changes in `contracts/resource-reference.json` before adopting a new pin.

## Authoring

See the [documentation style guide](STYLE.md) for page structure, action tabs, examples, and terminology.
