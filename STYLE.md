# Prokrust documentation style guide

## Organize by the reader's task

- Use **User guide → Core concepts** to explain what an object represents and how it relates to other objects. Use **How-to Guides** for tasks. Title a task with a verb and an object, such as **Create a table**.
- Start each how-to with the result and its prerequisites. Use the reader's own workspace, names, connections, and data. Keep a concrete dataset in a named quickstart. Explain why the quickstart needs that dataset.
- Put installation, permissions, and workspace enrollment in the operator guide. Link to these prerequisites from the user guide.
- Put provider settings under **Reference Doc → Connectors → provider → release**. Link to the release and section that define the field. Distinguish the connector release, Kubernetes API version, and selector schema version.

## Write instructions in plain technical English

Use ASD-STE100 as the model for about 80% of authored prose. This is an editorial target. Preserve exact field names, commands, control labels, and terms that carry technical meaning. [ASD-STE100, issue 9](https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf)

- Give one instruction per sentence. Start with a verb. Put a condition first when it changes the action. Aim for 20 words or fewer in instructions.
- Use one term for one thing. Explain a new term where the reader first needs it. Use “table” for the concept, `Table` for the Kubernetes kind, and **Create Table** for the button.
- Remove words that add no decision or fact. “Choose an unused table name in this workspace” states the constraint.
- Prefer a precise sentence over an arbitrary word count. Keep complete articles and units. Avoid unexplained shorthand.

## Explain the fields in an example

For every configuration key in a published example, put an explanation directly below the example or link there to a specific field or section. Apply this rule to both YAML and JSON. One shared explanation can serve equivalent tabs.

- Name the key by its full path when the same word occurs in two places. Cover nested objects and their children. Say **what it controls**, **why this example needs it**, and **when the reader would choose another value**. Group fields that express one decision.
- Explain where the reader gets a value that must match another object, column, or schema. For an optional setting, describe the effect of omission when it matters. For a fixed constant, state who defines it and which change would require another value. Identify read-only fields as observations and explain when to inspect them.
- Use a concrete change to explain boundaries. A connection can grant access to several source objects. To select a different object through that connection, change `spec.source.selector.config`. To use a different connection, change `spec.source.connectionRef`. A field type, an enum list, or a link to a reference landing page alone does not explain that choice.
- Remove optional settings that teach nothing in the example. Use the pinned contract and implementation to verify behavior. Distinguish schema defaults from controller behavior. Keep upstream descriptions and schema constraints in the CRD reference. Give every named field under `spec` a decision or a source for its value. For controller-created resources, explain how to use that field when inspecting the object.

## Explain controller status

- Start a resource reference with the question a reader can answer from its status. For a condition, name the condition type the released controller publishes. Explain what the result means, give the reason the reader will see, and identify what to inspect next.
- Trace condition types and reasons to the code that writes status. The CRD defines the shape of a condition. A printer column or a list of allowed phases cannot establish which conditions the controller emits.
- Explain when a result can be absent or stale. Use one actual failure combination to show how a reader can distinguish a bad definition from a dependency or publication problem.
- Keep Kubernetes types, defaults, limits, and validation expressions in a separate schema disclosure. A purpose column requires a plain-language explanation.

## Show equivalent ways to perform an action

- Use **Web**, **Kubernetes**, and **curl**, in that order. Put shared decisions before the tabs and one observable result after them. Keep the selected method across actions and pages.
- Use controls in the installed Prokrust app for Web procedures. Name any external console used for cluster administration. Show only supported methods. Explain an unavailable method at the point of choice. Add SDK tabs when that SDK supports the action.
- Make each tab usable on its own. Show connection and authentication inputs where the method needs them. Keep the resource, inputs, and expected result consistent across tabs.
- Give manifests and requests a copy button and the correct language tag. Mark template values clearly. Use separate blocks for input and output. Omit download links that duplicate a snippet.
- End each procedure with a check that tests its stated result. Reading back a table definition verifies the configuration. A separate operation reads the source rows.

## Review a page

Read the page using only one method tab. Follow the link under each example. Check whether a reader could change the source, inputs, or scope without guessing which key to edit. Compare the other tabs against the same inputs. Build the site and check the links, example schemas, tab selection, and YAML highlighting.
