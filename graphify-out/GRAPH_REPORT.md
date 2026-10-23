# Graph Report - insta-content  (2026-10-22)

## Corpus Check
- Corpus is ~23,860 words - fits in a single context window. You may not need a graph.

## Summary
- 268 nodes · 747 edges · 14 communities (9 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Product Rules and Architecture
- Database and Server Authorization
- Content UI and Jalali Picker
- Analytics Tasks and Tehran Time
- Content Revisions and Publication
- Private File Storage
- Transactional Schedule Planning
- Safe Graphify Generation
- Secure Owner Bootstrap
- Compose Configuration Verification
- Product Rules and Architecture

## God Nodes (most connected - your core abstractions)
1. `HttpError` - 45 edges
2. `query()` - 27 edges
3. `transaction()` - 23 edges
4. `registerContent()` - 23 edges
5. `Content Operations Platform` - 23 edges
6. `requireUser()` - 21 edges
7. `registerMedia()` - 18 edges
8. `one()` - 17 edges
9. `audit()` - 17 edges
10. `registerAnalytics()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `bootstrapOwner()` --calls--> `hashPassword()`  [EXTRACTED]
  scripts/bootstrap.ts → server/core/security.ts
- `storagePath()` --calls--> `HttpError`  [EXTRACTED]
  server/core/storage.ts → server/core/security.ts
- `parseRange()` --calls--> `HttpError`  [EXTRACTED]
  server/core/storage.ts → server/core/security.ts
- `storeUpload()` --calls--> `HttpError`  [EXTRACTED]
  server/core/storage.ts → server/core/security.ts
- `validateMetrics()` --calls--> `HttpError`  [EXTRACTED]
  server/modules/analytics.ts → server/core/security.ts

## Import Cycles
- None detected.

## Communities (14 total, 2 thin omitted)

### Community 0 - "Product Rules and Architecture"
Cohesion: 0.07
Nodes (51): Versioned Analytics Routes, API Contract, Revision Approval Publication Routes, Private Streaming and Downloads, Preview and Apply Schedule Routes, Server Authorization Boundary, Weekly Report Routes, Publication Job Contract (+43 more)

### Community 1 - "Database and Server Authorization"
Cohesion: 0.12
Nodes (32): Analytics(), metricLabels, weeklyKeys, WeeklyReport(), save(), ContentEditor(), DatePicker(), fromJalali() (+24 more)

### Community 2 - "Content UI and Jalali Picker"
Cohesion: 0.12
Nodes (33): bootstrapOwner(), hiddenPassword(), main(), passwordFromStdin(), one(), pool, query(), audit() (+25 more)

### Community 3 - "Analytics Tasks and Tehran Time"
Cohesion: 0.15
Nodes (32): authorize(), HttpError, assignPackage(), checkRevision(), dateSchema, idSchema, invalidatePackage(), isStory() (+24 more)

### Community 4 - "Content Revisions and Publication"
Cohesion: 0.16
Nodes (26): allowedPurpose(), AssetPurpose, audioTypes, contentDisposition(), fileMaxBytes(), imageTypes, normalizedMime(), parseRange() (+18 more)

### Community 5 - "Private File Storage"
Cohesion: 0.17
Nodes (17): completeAnalytics(), completeWeekly(), fieldsFor(), general, labels, metrics, publishedContent(), registerAnalytics() (+9 more)

### Community 6 - "Transactional Schedule Planning"
Cohesion: 0.35
Nodes (13): transaction(), addDays(), iranInstant(), localDate(), nextDayReminder(), weeklyPeriod(), analyticsJob(), processOneJob() (+5 more)

### Community 7 - "Safe Graphify Generation"
Cohesion: 0.33
Nodes (7): key(), nextDate(), order(), planSchedule(), ScheduleRequest, ScheduleRule, Slot

### Community 8 - "Secure Owner Bootstrap"
Cohesion: 0.57
Nodes (6): Path, allowed_files(), dump(), host_semantics(), main(), Only replay agent-reviewed content with matching source hashes.

## Knowledge Gaps
- **53 isolated node(s):** `Permission`, `fastify`, `FastifyRequest`, `AssetPurpose`, `imageTypes` (+48 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 72 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `Permission`, `fastify`, `FastifyRequest` to the rest of the system?**
  _53 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Product Rules and Architecture` be split into smaller, more focused modules?**
  _Cohesion score 0.06745098039215686 - nodes in this community are weakly interconnected._
- **Should `Database and Server Authorization` be split into smaller, more focused modules?**
  _Cohesion score 0.11690821256038647 - nodes in this community are weakly interconnected._
- **Should `Content UI and Jalali Picker` be split into smaller, more focused modules?**
  _Cohesion score 0.12156448202959831 - nodes in this community are weakly interconnected._
- **Should `Analytics Tasks and Tehran Time` be split into smaller, more focused modules?**
  _Cohesion score 0.14864864864864866 - nodes in this community are weakly interconnected._

## Extraction provenance and coverage

Generated with the installed Graphify library. Code uses its deterministic AST extractor; documentation semantics were reviewed by a delegated host agent. No paid provider calls were made. Host-agent token usage is unavailable from this runtime; the zero API token counters above mean no external extraction API usage, not zero agent cost.

Allowlisted input files: 48. Detected: 48. Reviewed current documents: 5. Unreviewed/stale documents: 8.

Unreviewed documents: `README.md`, `docs/API_OPERATIONS.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/GRAPHIFY.md`, `docs/PERMISSIONS.md`, `docs/SOURCES.md`, `web/index.html`.

SQL, CSS, and HTML may not produce symbols in the installed AST extractor. The graph maps source relationships and requirements; it is not proof that features work.

### Graph health

```text
[graphify] MultiDiGraph edge-collapse diagnostic
input: <in-memory>
input_stage: provided JSON (normal graph.json is post-build)
effective_directed: <direct-call>
nodes: 268
unverified_code_nodes: 0
raw_edges: 859
valid_candidate_edges: 752
missing_endpoint_edges: 0
dangling_endpoint_edges: 107
self_loop_edges: 0
exact_duplicate_edges: 0
directed_unique_endpoint_pairs: 747
directed_same_endpoint_collapsed_edges: 5
undirected_unique_endpoint_pairs: 747
undirected_same_endpoint_collapsed_edges: 5
same_endpoint_group_count: 5
relation_variant_groups: 5
source_file_variant_groups: 0
source_location_variant_groups: 0
context_variant_groups: 0
post_build_graph_type: DiGraph
post_build_edges: 747
producer_suppression_sites: 12
producer_suppression_examples:
  - L1204 seen_ids arity=unknown
  - L1520 seen_ids arity=unknown
  - L1522 seen_doc_refs arity=unknown
  - L1885 seen_ids arity=unknown
  - L2032 seen_ids arity=unknown
  - L2670 seen_keys arity=unknown
  - L2839 seen_keys arity=unknown
  - L4436 seen_ids arity=unknown
examples:
  - scripts_graphify_project_host_semantics -> path edges=2 relations=['calls', 'references'] locations=['L52', 'L56'] contexts=['call', 'parameter_type']
  - server_modules_analytics -> server_core_security edges=2 relations=['dynamic_import', 'imports_from'] locations=['', 'L5'] contexts=['', 'import']
  - web_src_analytics_weeklyreport -> web_src_analytics_weeklyreport_save edges=2 relations=['calls', 'contains'] locations=['L8'] contexts=['', 'call']
  - web_src_lib_useresource -> web_src_lib_useresource_refresh edges=2 relations=['calls', 'contains'] locations=['L32'] contexts=['', 'call']
  - web_src_lib_upload -> web_src_lib_upload_transfer edges=2 relations=['calls', 'contains'] locations=['L38', 'L39'] contexts=['', 'call']
note: normal graph.json is post-build; raw producer loss must be measured earlier.
```
