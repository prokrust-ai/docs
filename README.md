# Prokrust documentation

Docusaurus source for `docs.prokrust.ai`. Includes the operator and user guides, Kubernetes resources generated from the pinned public CRD chart, the synthetic provider schemas, and the public RPC and HTTP reference.

## Local development

Use Node.js 22.13 or newer and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm start
```

`pnpm build` regenerates the Kubernetes pages, checks the example against the CRD and provider schemas, validates internal links, and builds the static site and local search index. Use `pnpm serve` to preview the production build with search. These checks run without a cluster.

## Update contract inputs

`contracts/releases.json` pins the Kubernetes chart source and provider schemas independently. The versions identify the inputs used to build this reference.

- **Kubernetes.** Copy the selected public `prokrust-crds` chart's complete `files/` into `contracts/kubernetes/` when changing the pin. The reference uses every served core kind and every connector in the chart's lock. The refresh checks their validation schemas against the selected producers. [Public charts](https://github.com/prokrust-ai/helm-charts/tree/main/charts/prokrust-crds)
- **Connector configuration.** Keep each published version's schemas under `contracts/<connector>/<release>/`. Add a release page below the provider in the sidebar. Bind the page to those versioned files. When the quickstart moves to a new release, update its pin and schema digests in `contracts/releases.json`. Keep previous release pages and schema files available. The synthetic walkthrough generates its per-resource YAML and Connect request bodies from the same validated example under `static/examples/`.
- **Public APIs.** The RPC bundle comes from the owning protobuf descriptors and leading comments. HTTP operations use their producing service’s OpenAPI contract. See [Generate the public API reference](#generate-the-public-api-reference).

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

## Generate the public API reference

The production build uses checked-in public inputs in `contracts/rpc-reference.json` and `contracts/http/`. The API reference describes the imported source revision. A client calling an older installation must use the methods and fields available in that installation. HTTP pages identify version-specific behavior.

For an RPC change, check out the three owning schema modules and install Buf. Use the module roots that contain `buf.yaml`. Build the public bundle and verify that it is reproducible.

```sh
pnpm refresh:api --control "$CONTROL_PROTO" --protocol "$CONNECTOR_PROTOCOL" --license "$LICENSE_PROTO"
pnpm refresh:api --control "$CONTROL_PROTO" --protocol "$CONNECTOR_PROTOCOL" --license "$LICENSE_PROTO" --check
pnpm build
```

The importer reads each service’s required `@audience` directive in the three modules and follows the types reachable from public RPCs. Buf decodes each request and successful response example against the method signature. Reachable field and enum descriptions, method examples and service classifications are required. The bundle records SHA-256 fingerprints of the public projections and contains only reachable public types. Build the site to review links, field tables and streaming examples.

HTTP-only operations come from the Web API, serving, and operator producers. Their exporters check the mounted routes against the public OpenAPI definitions. The Web API exporter also reads the pinned release from Git history to reproduce its contract. Use full producer checkouts for this refresh.

```sh
pnpm refresh:http --web-api "$WEB_API" --serving "$SERVING" --operator "$OPERATOR_REPO"
pnpm refresh:http --web-api "$WEB_API" --serving "$SERVING" --operator "$OPERATOR_REPO" --check
pnpm build
```
