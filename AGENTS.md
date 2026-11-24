# Public documentation

Follow [STYLE.md](STYLE.md) for language, navigation, examples, and action tabs.

## Kubernetes resource references

- Use the full API group, served version, and kind to identify a resource. The public inventory comes from the pinned CRD chart and its connector lock.
- Edit configuration guidance in the producer. Core resources use Rust API comments. Connector resources use the provider’s Helm CRD. Give each named field a purpose, a source for its value, and a reason to set or inspect it. Document the shape of an opaque object in the component that owns it and tell the reader where to find that schema.
- Edit condition meanings, reason guidance, and examples at the controller or shared SDK that writes status. Name the observation and the next check. A tested example should contain stable fields from the writer. Describe forwarded or provider-defined reasons by their source. For resources that report a state without conditions, show that state. For a resource without status, explain where to observe its effect.
- Run the refresh, the drift check, and the production build. Review the resulting page with its configuration guidance, status example, and field anchors. The public build must work with its saved inputs and without access to private repositories.
- When adding a resource or serving another version, supply its schema and controller contract in the same change to the release inputs. The build checks for missing, duplicate, and unexpected resources. [Refresh workflow](README.md#generate-the-kubernetes-reference)

## Public APIs

Classify services in their leading comments with `@audience installation`, `provider`, `licensing`, or `private`. Write the contract in the owning protobuf module. Use leading comments on each public service, RPC, reachable message, field, enum and enum value. Explain who calls it, what changes, how to choose a value, units, presence, and how the caller interprets results. Cover routing, authentication, streaming and retries where they affect the operation. Each RPC needs one-line `@request` and `@response` ProtoJSON examples. A routed compatibility stub uses `@request`, `@unimplemented` and the actual `@error` instead. Use examples from supported configurations and placeholders for caller-owned identifiers and credentials.

Run the source importer, its drift check and the offline site build. Review reachable types and nested field links. Changes to public HTTP routes belong in the owning HTTP contract. Check route inventories and decoded examples before importing them. Include only APIs available to the documented caller. An internal administration interface stays private.
