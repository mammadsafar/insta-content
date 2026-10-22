# Graphify project map

The project map is generated using the installed `graphifyy` distribution, not a replacement graph tool. The installed Codex skill is actually named `skill-codex.md` (there is no adjacent `SKILL.md` in this package):

`/Users/roodin/.local/share/uv/tools/graphifyy/lib/python3.14/site-packages/graphify/skill-codex.md`

Its extraction prompt is under `graphify/skills/codex/references/extraction-spec.md`. Both were read before initial extraction. The package's documented detect, AST extraction, semantic cache, graph construction, clustering, diagnostics, reporting, JSON export, and HTML export are used.

## Outputs

- [Interactive graph](../graphify-out/graph.html).
- [Generated audit report](../graphify-out/GRAPH_REPORT.md), including raw cohesion and graph health.
- [Graph data](../graphify-out/graph.json), compatible with Graphify queries.
- [Exact source coverage and hashes](../graphify-out/coverage.json).
- [Integrity diagnostics](../graphify-out/health.json).
- [Reviewed semantic extraction](../graphify-out/semantic-reviewed.json), with document hashes and extraction provenance.

The initial map was generated during implementation, with 33 allowlisted source/document files, 227 nodes, 516 edges, and 14 communities. Later snapshots supersede these counts; consult `coverage.json` and the report for the current map. Its initial semantic review covered the approved specification, decisions, API contract, plan, and initial progress record.

## Safe rebuild

From the repository root, using this environment's installed interpreter:

```sh
rtk proxy /Users/roodin/.local/share/uv/tools/graphifyy/bin/python scripts/graphify-project.py
rtk proxy /Users/roodin/.local/bin/graphify export html
```

The script uses an explicit source/document allowlist and copies only those files into a temporary staging directory before calling `graphify.detect.detect`. Environment files, hidden configuration directories, private attachments, media, database volumes, dumps, dependency trees, and generated graph outputs are never inputs. Staging paths are normalized back to repository source paths in the graph. There is no network extraction or paid API call.

The script uses Graphify's documented Python library functions; its HTML command is the installed skill's supported `graphify export html`. Keep the Python interpreter paired with the installed package. Other machines may install the package differently; follow that installation's actual skill/interpreter discovery instructions.

If source deletion deliberately reduces the node count, inspect the change and use the script's documented `--force` flag. Ordinary refreshes retain Graphify's shrink guard.

## Semantic review and limitations

Code is extracted with Graphify's deterministic AST extractor. Documentation concepts and relationships are extracted by a delegated host agent following the installed extraction prompt; the Python script only replays that reviewed JSON. It does not infer documentation semantics or call another model. `EXTRACTED`, `INFERRED`, and `AMBIGUOUS` confidence fields preserve provenance. Requirements in the graph describe intended behavior and must not be interpreted as passing tests.

Changed documents must be reviewed again and have their semantic JSON and hashes updated by a host agent. The rebuild excludes stale semantic entries and lists unreviewed documents in the report, so an old review cannot silently stand in for new content. Review semantic extraction after architectural milestones and before final delivery, then regenerate JSON, report, and HTML together.

The installed SQL parser dependency `tree_sitter_sql` is absent. SQL migration files are in the source manifest, but no SQL symbols were extracted in the initial run. CSS/HTML support is also extractor dependent. This map is useful for navigation and requirements, but cannot claim exhaustive SQL, data-flow, or dynamic-route analysis.

Graphify diagnostics reported dangling AST endpoints and several same-endpoint relationship collapses in the initial snapshot. These are reported in `health.json` and the audit report; retain that warning when discussing graph completeness. External symbols and files still being written can contribute unresolved endpoints. Never repair these by inventing relationships.

No external extraction API tokens were used. The runtime does not expose per-agent input/output usage, so report counters of zero mean no provider extraction calls, not zero host-agent token cost.

## Query the existing map

```sh
rtk proxy /Users/roodin/.local/bin/graphify query "How do approval, publication and analytics reminders connect?"
rtk proxy /Users/roodin/.local/bin/graphify query "Which modules enforce page permissions?"
```

Use the source locations returned by Graphify to inspect the current implementation. Rebuild when `coverage.json` hashes no longer match source files. Written architecture, permission, data-model, acceptance, and operations documents remain authoritative for product rules and verification status.
