# Public documentation

Follow [STYLE.md](STYLE.md) for language, navigation, examples, and action tabs.

## Kubernetes resource references

- Use the full API group, served version, and kind to identify a resource. The public inventory comes from the pinned CRD chart and its connector lock.
- Edit configuration guidance in the producer. Core resources use Rust API comments. Connector resources use the provider’s Helm CRD. Give each named field a purpose, a source for its value, and a reason to set or inspect it. Document the shape of an opaque object in the component that owns it and tell the reader where to find that schema.
- Edit condition meanings, reason guidance, and examples at the controller or shared SDK that writes status. Name the observation and the next check. A tested example should contain stable fields from the writer. Describe forwarded or provider-defined reasons by their source. For resources that report a state without conditions, show that state. For a resource without status, explain where to observe its effect.
- Run the refresh, the drift check, and the production build. Review the resulting page with its configuration guidance, status example, and field anchors. The public build must work with its saved inputs and without access to private repositories.
- When adding a resource or serving another version, supply its schema and controller contract in the same change to the release inputs. The build checks for missing, duplicate, and unexpected resources. [Refresh workflow](README.md#generate-the-kubernetes-reference)
