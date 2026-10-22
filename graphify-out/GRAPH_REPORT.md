# Graph Report - insta-content  (2026-10-22)

## Corpus Check
- Corpus is ~16,787 words - fits in a single context window. You may not need a graph.

## Summary
- 227 nodes · 516 edges · 14 communities (9 shown, 2 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Product Rules and Architecture
- db.ts
- ContentEditor.tsx
- HttpError
- content.ts
- storage.ts
- schedule-plan.ts
- Path
- bootstrap.ts
- compose.test.ts
- Product Rules and Architecture

## God Nodes (most connected - your core abstractions)
1. `HttpError` - 36 edges
2. `registerContent()` - 23 edges
3. `Content Operations Platform` - 23 edges
4. `query()` - 17 edges
5. `registerAnalytics()` - 17 edges
6. `requireUser()` - 14 edges
7. `transaction()` - 13 edges
8. `audit()` - 13 edges
9. `one()` - 12 edges
10. `registerAuth()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `bootstrapOwner()` --calls--> `hashPassword()`  [EXTRACTED]
  scripts/bootstrap.ts → server/core/security.ts
- `storagePath()` --calls--> `HttpError`  [EXTRACTED]
  server/core/storage.ts → server/core/security.ts
- `parseRange()` --calls--> `HttpError`  [EXTRACTED]
  server/core/storage.ts → server/core/security.ts
- `storeUpload()` --calls--> `HttpError`  [EXTRACTED]
  server/core/storage.ts → server/core/security.ts
- `publishedContent()` --calls--> `one()`  [EXTRACTED]
  server/modules/analytics.ts → server/core/db.ts

## Import Cycles
- None detected.

## Communities (14 total, 2 thin omitted)

### Community 0 - "Product Rules and Architecture"
Cohesion: 0.07
Nodes (51): Versioned Analytics Routes, API Contract, Revision Approval Publication Routes, Private Streaming and Downloads, Preview and Apply Schedule Routes, Server Authorization Boundary, Weekly Report Routes, Publication Job Contract (+43 more)

### Community 1 - "db.ts"
Cohesion: 0.15
Nodes (28): one(), pool, query(), transaction(), audit(), authorize(), can(), fastify (+20 more)

### Community 2 - "ContentEditor.tsx"
Cohesion: 0.11
Nodes (23): ContentEditor(), DatePicker(), fromJalali(), months, Action(), addDays(), api(), dateLabel() (+15 more)

### Community 3 - "HttpError"
Cohesion: 0.15
Nodes (23): HttpError, addDays(), iranInstant(), localDate(), nextDayReminder(), weeklyPeriod(), completeAnalytics(), completeWeekly() (+15 more)

### Community 4 - "content.ts"
Cohesion: 0.17
Nodes (24): assignPackage(), checkRevision(), dateSchema, idSchema, invalidatePackage(), isStory(), lockContent(), lockPage() (+16 more)

### Community 5 - "storage.ts"
Cohesion: 0.18
Nodes (15): allowedPurpose(), AssetPurpose, audioTypes, contentDisposition(), imageTypes, normalizedMime(), parseRange(), removeStoredFiles() (+7 more)

### Community 6 - "schedule-plan.ts"
Cohesion: 0.33
Nodes (7): key(), nextDate(), order(), planSchedule(), ScheduleRequest, ScheduleRule, Slot

### Community 7 - "Path"
Cohesion: 0.57
Nodes (6): Path, allowed_files(), dump(), host_semantics(), main(), Only replay agent-reviewed content with matching source hashes.

### Community 8 - "bootstrap.ts"
Cohesion: 0.48
Nodes (6): bootstrapOwner(), hiddenPassword(), main(), passwordFromStdin(), hashPassword(), scrypt

## Knowledge Gaps
- **50 isolated node(s):** `Permission`, `fastify`, `FastifyRequest`, `AssetPurpose`, `StoredFile` (+45 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 70 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `Permission`, `fastify`, `FastifyRequest` to the rest of the system?**
  _50 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Product Rules and Architecture` be split into smaller, more focused modules?**
  _Cohesion score 0.06745098039215686 - nodes in this community are weakly interconnected._
- **Should `ContentEditor.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.11051693404634581 - nodes in this community are weakly interconnected._
- **Should `HttpError` be split into smaller, more focused modules?**
  _Cohesion score 0.14814814814814814 - nodes in this community are weakly interconnected._

## Extraction provenance and coverage

Generated with the installed Graphify library. Code uses its deterministic AST extractor; documentation semantics were reviewed by a delegated host agent. No paid provider calls were made. Host-agent token usage is unavailable from this runtime; the zero API token counters above mean no external extraction API usage, not zero agent cost.

Allowlisted input files: 33. Detected: 33. Reviewed current documents: 5. Unreviewed/stale documents: 1.

Unreviewed documents: `web/index.html`.

SQL, CSS, and HTML may not produce symbols in the installed AST extractor. The graph maps source relationships and requirements; it is not proof that features work.

### Graph health

```text
[graphify] MultiDiGraph edge-collapse diagnostic
input: <in-memory>
input_stage: provided JSON (normal graph.json is post-build)
effective_directed: <direct-call>
nodes: 227
unverified_code_nodes: 0
raw_edges: 610
valid_candidate_edges: 520
missing_endpoint_edges: 0
dangling_endpoint_edges: 90
self_loop_edges: 0
exact_duplicate_edges: 0
directed_unique_endpoint_pairs: 516
directed_same_endpoint_collapsed_edges: 4
undirected_unique_endpoint_pairs: 516
undirected_same_endpoint_collapsed_edges: 4
same_endpoint_group_count: 4
relation_variant_groups: 4
source_file_variant_groups: 0
source_location_variant_groups: 0
context_variant_groups: 0
post_build_graph_type: DiGraph
post_build_edges: 516
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
  - web_src_lib_useresource -> web_src_lib_useresource_refresh edges=2 relations=['calls', 'contains'] locations=['L32'] contexts=['', 'call']
  - web_src_lib_upload -> web_src_lib_upload_transfer edges=2 relations=['calls', 'contains'] locations=['L38', 'L39'] contexts=['', 'call']
note: normal graph.json is post-build; raw producer loss must be measured earlier.
```
