"""Renders README.md, docs/submission.md and docs/video.md from docs/templates/*.tmpl.

Every measured number is a placeholder resolved from eval/results/results.json, so the four
assets (README, site, video, form) cannot disagree. Links come from docs/links.json (written by the
devnet end-to-end run). Placeholder syntax: {{path.to.value}} or {{path.to.value:format}};
{{link:name}} for a URL. Unresolved values render as PENDING (and fail check_consistency.py).
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGETS = {"README.md.tmpl": ROOT / "README.md", "submission.md.tmpl": ROOT / "docs/submission.md", "video.md.tmpl": ROOT / "docs/video.md"}
PAT = re.compile(r"\{\{\s*([^}]+?)\s*\}\}")


def resolve(path, data):
    cur = data
    for part in path.split("."):
        if isinstance(cur, list):
            cur = cur[int(part)]
        elif isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return None
    return cur


def render_text(text, results, links):
    def sub(m):
        expr = m.group(1)
        if expr.startswith("bullets:"):
            # bullets:negative.detail → one "- " line per element of results["negative"]
            arr, _, field = expr[8:].partition(".")
            items = results.get(arr) or []
            return "\n".join(f"- {it.get(field, 'PENDING')}" for it in items) if items else "PENDING"
        if expr.startswith("link:"):
            v = links.get(expr[5:])
            return v if v else "PENDING"
        path, _, fmt = expr.partition(":")
        if path.startswith("delay."):
            # delay.<ms>.<field>: look up an E1 delay row by its delay
            _, ms, field = path.split(".", 2)
            row = next((d for d in (results.get("e1") or {}).get("delays", []) if str(d["delay_ms"]) == ms), None)
            v = resolve(field, row) if row else None
        else:
            v = resolve(path, results)
        if v is None:
            return "PENDING"
        if fmt == "pct":
            return f"{v * 100:.1f}%"
        if fmt == "s":
            return f"{v / 1000:g}"
        return format(v, fmt) if fmt else str(v)

    return PAT.sub(sub, text)


def render():
    results = json.loads((ROOT / "eval/results/results.json").read_text())
    lp = ROOT / "docs/links.json"
    links = json.loads(lp.read_text()) if lp.exists() else {}
    out = {}
    for tmpl, target in TARGETS.items():
        out[target] = render_text((ROOT / "docs/templates" / tmpl).read_text(), results, links)
    return out


if __name__ == "__main__":
    for target, text in render().items():
        target.write_text(text)
        print(f"rendered {target.relative_to(ROOT)} ({text.count('PENDING')} pending)")
    sys.exit(0)
