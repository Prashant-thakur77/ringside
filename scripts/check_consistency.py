"""Checks that README.md, docs/submission.md, docs/video.md and the site say the same numbers as
eval/results/results.json:
  1. each generated file equals a fresh render of its template (no hand-edited numbers);
  2. nothing is left PENDING;
  3. every measured number in the templates is a placeholder (no literal decimals outside them
     except the documented design constants);
  4. the site reads its proof numbers from results.json (the deployed copy matches the source).
Exit code 0 only if all pass."""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from render_docs import PAT, ROOT, TARGETS, render  # noqa: E402

# Design constants (not measurements) that may appear as literals in prose.
CONSTANTS = {"95", "10,000", "1.0", "100", "90", "15", "10", "2", "1", "5", "8", "0.5", "12", "25", "40", "4", "6", "1.5", "3", "16", "1024", "64", "32", "200,000", "70", "60", "0.01", "0.99", "2000", "1200", "1232", "10,240", "4,744", "30"}

ok = True
rendered = render()
for target, text in rendered.items():
    disk = target.read_text() if target.exists() else ""
    if disk != text:
        print(f"FAIL {target.relative_to(ROOT)} differs from its template render (run scripts/render_docs.py)")
        ok = False
    n = text.count("PENDING")
    if n:
        print(f"FAIL {target.relative_to(ROOT)} has {n} PENDING values")
        ok = False
for tmpl in TARGETS:
    raw = PAT.sub("", (ROOT / "docs/templates" / tmpl).read_text())
    raw = re.sub(r"`[^`]*`", "", raw)  # code spans (addresses, commands) are not claims
    raw = re.sub(r"https?://\S+", "", raw)
    raw = re.sub(r"\b\d+:\d\d\b", "", raw)  # video timecodes
    if tmpl == "video.md.tmpl":  # shot numbers and durations are editing choices, not measurements
        raw = "\n".join(l for l in raw.splitlines() if not l.startswith("|"))
    for num in re.findall(r"(?<![\w.])\d[\d,]*(?:\.\d+)?(?![\w])", raw):
        if num not in CONSTANTS and not re.fullmatch(r"20\d\d", num):
            print(f"FAIL literal number {num!r} in docs/templates/{tmpl}: make it a placeholder or a documented constant")
            ok = False
src = (ROOT / "eval/results/results.json").read_text()
site = ROOT / "apps/web/public/results.json"
if not site.exists() or json.loads(site.read_text()) != json.loads(src):
    print("FAIL apps/web/public/results.json is not a copy of eval/results/results.json (run eval/make_report.py)")
    ok = False
print("consistency: OK" if ok else "consistency: FAILED")
sys.exit(0 if ok else 1)
