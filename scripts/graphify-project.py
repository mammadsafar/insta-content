#!/usr/bin/env python3
"""Build a source-only Graphify map; semantic input is reviewed by a host agent.

Run using Graphify's interpreter, documented in docs/GRAPHIFY.md. This program
does not call an LLM or claim to extract documentation semantics automatically.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile
from datetime import datetime, timezone

from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.build import build_from_json
from graphify.cache import check_semantic_cache, save_semantic_cache
from graphify.cluster import cluster, score_all
from graphify.detect import detect, save_manifest
from graphify.diagnostics import diagnose_extraction, format_diagnostic_report
from graphify.export import to_json
from graphify.extract import extract
from graphify.report import generate

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "graphify-out"
SOURCE_DIRS = ("server", "web", "tests", "db", "scripts", "docs")
EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".sql", ".md", ".css", ".html"}
EXCLUDED_PARTS = {"node_modules", ".git", ".aws", ".codex", ".agents", "coverage", "dist", "uploads", "media", "data", "__pycache__"}
ROOT_FILES = ("README.md", "vite.config.ts")


def dump(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def allowed_files() -> list[Path]:
    files = [ROOT / name for name in ROOT_FILES if (ROOT / name).is_file()]
    for directory in SOURCE_DIRS:
        base = ROOT / directory
        if base.exists():
            files += [p for p in base.rglob("*") if p.is_file() and not p.is_symlink()
                      and p.suffix.lower() in EXTENSIONS
                      and not (set(p.relative_to(ROOT).parts) & EXCLUDED_PARTS)
                      and not any(part.startswith(".") for part in p.relative_to(ROOT).parts)]
    return sorted(set(files))


def host_semantics(detection: dict, spec: Path) -> tuple[dict, list[str], list[str]]:
    """Only replay agent-reviewed content with matching source hashes."""
    review_path = OUT / "semantic-reviewed.json"
    review = json.loads(review_path.read_text()) if review_path.exists() else {}
    documented = {str(Path(f).relative_to(ROOT)) for f in detection["files"].get("document", [])}
    valid = {name for name, digest in review.get("source_hashes", {}).items()
             if name in documented and hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == digest}
    valid_paths = {str(ROOT / name) for name in valid}
    nodes = [n for n in review.get("nodes", []) if n.get("source_file") in valid_paths]
    ids = {n["id"] for n in nodes}
    edges = [e for e in review.get("edges", []) if e.get("source_file") in valid_paths
             and e["source"] in ids and e["target"] in ids]
    hyperedges = [h for h in review.get("hyperedges", []) if h.get("source_file") in valid_paths
                  and all(node in ids for node in h["nodes"])]
    # Read/write Graphify's documented cache using the actual packaged prompt.
    check_semantic_cache(sorted(valid_paths), root=ROOT, prompt_file=spec)
    save_semantic_cache(nodes, edges, hyperedges, root=ROOT,
                        allowed_source_files=sorted(valid_paths), prompt_file=spec)
    return {"nodes": nodes, "edges": edges, "hyperedges": hyperedges,
            "input_tokens": 0, "output_tokens": 0}, sorted(valid), sorted(documented - valid)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="Allow an intentional graph shrink after deleting source")
    args = parser.parse_args()
    OUT.mkdir(exist_ok=True)
    skill_dir = Path(__import__("graphify").__file__).resolve().parent
    spec = skill_dir / "skills/codex/references/extraction-spec.md"
    if not spec.is_file():
        raise SystemExit(f"Installed extraction prompt missing: {spec}")
    (OUT / ".graphify_python").write_text(sys.executable, encoding="utf-8")
    (OUT / ".graphify_root").write_text(str(ROOT), encoding="utf-8")
    files = allowed_files()
    # Detect only copies of explicit source/doc inputs. No private volumes,
    # environment files, configuration directories, media, or attachments enter.
    with tempfile.TemporaryDirectory(prefix="insta-content-graphify-") as temporary:
        stage = Path(temporary).resolve()
        for source in files:
            target = stage / source.relative_to(ROOT)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
        detection = detect(stage)
        ast = extract([Path(f) for f in detection["files"].get("code", [])], cache_root=stage, root=stage)
        # Restore stable source paths before graph construction and manifesting.
        for item in ast.get("nodes", []) + ast.get("edges", []):
            source = item.get("source_file")
            if source:
                path = Path(source)
                relative = path.relative_to(stage) if path.is_absolute() else path
                item["source_file"] = str(ROOT / relative)
        detection["files"] = {kind: [str(ROOT / Path(f).relative_to(stage)) for f in paths]
                              for kind, paths in detection["files"].items()}
        detection["scan_root"] = str(ROOT)
    if detection["total_files"] > 500 or detection["total_words"] > 2_000_000:
        raise SystemExit("Corpus exceeds skill limit: narrow the source allowlist before rebuilding")
    semantic, reviewed, unreviewed = host_semantics(detection, spec)
    ast_ids = {node["id"] for node in ast["nodes"]}
    extraction = {"nodes": ast["nodes"] + [node for node in semantic["nodes"] if node["id"] not in ast_ids],
                  "edges": ast["edges"] + semantic["edges"], "hyperedges": semantic["hyperedges"],
                  "input_tokens": 0, "output_tokens": 0}
    graph = build_from_json(extraction, root=str(ROOT), directed=True)
    if not graph.number_of_nodes():
        raise SystemExit("Empty extraction; existing graph preserved")
    communities = cluster(graph)
    cohesion = score_all(graph, communities)
    # Provisional names are refined in .graphify_labels.json by the host agent.
    curated_path = OUT / "community-labels-reviewed.json"
    curated = json.loads(curated_path.read_text()) if curated_path.exists() else {}
    labels = {}
    for number, members in communities.items():
        common_files = [str(graph.nodes[node].get("source_file", "")) for node in members]
        if members and all("docs/" in source for source in common_files):
            labels[number] = "Product Rules and Architecture"
        else:
            label = graph.nodes[members[0]].get("label", "Project") if members else "Project"
            labels[number] = curated.get(str(number), str(label)[:55])
    if not to_json(graph, communities, str(OUT / "graph.json"), force=args.force, community_labels=labels):
        raise SystemExit("Graphify shrink guard refused replacement; inspect deletion then use --force if intentional")
    gods = god_nodes(graph)
    surprises = surprising_connections(graph, communities)
    questions = suggest_questions(graph, communities, labels)
    report = generate(graph, communities, cohesion, labels, gods, surprises, detection,
                      {"input": 0, "output": 0}, str(ROOT), suggested_questions=questions)
    health = diagnose_extraction(extraction, directed=True, root=str(ROOT))
    health_text = format_diagnostic_report(health)
    sql_available = importlib.util.find_spec("tree_sitter_sql") is not None
    coverage = ("\n\n## Extraction provenance and coverage\n\n"
                "Generated with the installed Graphify library. Code uses its deterministic AST extractor; "
                "documentation semantics were reviewed by a delegated host agent. "
                "No paid provider calls were made. Host-agent token usage is unavailable from this runtime; "
                "the zero API token counters above mean no external extraction API usage, not zero agent cost.\n\n"
                f"Allowlisted input files: {len(files)}. Detected: {detection['total_files']}. "
                f"Reviewed current documents: {len(reviewed)}. Unreviewed/stale documents: {len(unreviewed)}.\n\n"
                "Unreviewed documents: " + (", ".join(f"`{name}`" for name in unreviewed) or "None") + ".\n\n"
                "SQL, CSS, and HTML may not produce symbols in the installed AST extractor. "
                + ("The SQL parser is available. " if sql_available else
                   "SQL parsing is unavailable: installed dependency `tree_sitter_sql` is missing; no installation was attempted. ") +
                "The graph maps source relationships and requirements; it is not proof that features work.\n\n"
                "### Graph health\n\n```text\n" + health_text + "\n```\n")
    (OUT / "GRAPH_REPORT.md").write_text(report + coverage, encoding="utf-8")
    dump(OUT / ".graphify_labels.json", {str(key): value for key, value in labels.items()})
    dump(OUT / ".graphify_analysis.json", {"communities": communities, "cohesion": cohesion,
                                           "gods": gods, "surprises": surprises, "questions": questions})
    dump(OUT / "health.json", health)
    dump(OUT / "coverage.json", {"generated_at": datetime.now(timezone.utc).isoformat(),
                                "inputs": [str(f.relative_to(ROOT)) for f in files],
                                "reviewed_documents": reviewed, "unreviewed_documents": unreviewed,
                                "ast_nodes": len(ast["nodes"]), "semantic_nodes": len(semantic["nodes"]),
                                "sql_parser_available": sql_available,
                                "source_hashes": {str(f.relative_to(ROOT)): hashlib.sha256(f.read_bytes()).hexdigest() for f in files},
                                "semantic_token_usage": "unavailable; no external provider calls"})
    # Keep only successful semantic documents stamped; stale ones must requeue.
    manifest_files = {kind: paths if kind == "code" else [f for f in paths if str(Path(f).relative_to(ROOT)) in reviewed]
                      for kind, paths in detection["files"].items()}
    save_manifest(manifest_files, str(OUT / "manifest.json"), root=ROOT,
                  scan_corpus={f for paths in detection["files"].values() for f in paths})
    costs = {"runs": [], "total_input_tokens": 0, "total_output_tokens": 0}
    if (OUT / "cost.json").exists():
        costs = json.loads((OUT / "cost.json").read_text())
    costs["runs"].append({"date": datetime.now(timezone.utc).isoformat(), "input_tokens": 0,
                           "output_tokens": 0, "files": detection["total_files"],
                           "note": "Host agent usage unavailable; no external API extraction calls"})
    dump(OUT / "cost.json", costs)
    print(f"Corpus: {detection['total_files']} files, ~{detection['total_words']} words")
    print(f"Graph: {graph.number_of_nodes()} nodes, {graph.number_of_edges()} edges, {len(communities)} communities")
    print(f"AST {len(ast['nodes'])}; semantic {len(semantic['nodes'])}; docs reviewed {len(reviewed)}; stale/unreviewed {len(unreviewed)}")
    print(health_text)
    print("Generate interactive HTML next with: graphify export html")


if __name__ == "__main__":
    main()
