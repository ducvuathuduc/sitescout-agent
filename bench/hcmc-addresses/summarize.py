#!/usr/bin/env python3
"""Summarise results.jsonl into RESULTS.md (tables) — no network."""
import json, collections, statistics, pathlib
here = pathlib.Path(__file__).parent
rows = [json.loads(l) for l in open(here / "results.jsonl")]
items = {x["id"]: x for x in json.load(open(here / "addresses.json"))["items"]}
rows.sort(key=lambda r: list(items).index(r["id"]))
v11p = here / "results-sitescout-v1.1.jsonl"
if v11p.exists():
    v11 = {json.loads(l)["id"]: json.loads(l)["sitescout"] for l in open(v11p)}
    for r in rows:
        r["sitescout_v11"] = v11.get(r["id"], {"error": "missing"})
S = ["search", "autocomplete", "sitescout"] + (["sitescout_v11"] if v11p.exists() else [])
groups = ["landmark-formal", "informal-no-diacritics", "address-old-ward", "address-new-ward"]
def pct(a, b): return f"{a}/{b} ({100*a/b:.0f}%)" if b else "–"
out = ["# HCMC geocoding benchmark — results", "",
       f"Run: {rows[0]['ts'][:10]} · {len(rows)} queries · {sum(r.get('credits',0) for r in rows)} credits · reference = Wikidata P625 (independent of Geoapify/OSM geocoding).", "",
       "Strategies: **search** = `/v1/geocode/search`, **autocomplete** = `/v1/geocode/autocomplete` (both `lang=vi`, `filter=countrycode:vn`, `bias=proximity:HCMC`, top-1), **sitescout** = `resolvePlace()` v1.0 (autocomplete-first chain with token-overlap check, `src/engine/scout.ts`), **sitescout_v11** = the same after this benchmark: pre-2025 units (`Phường 12`, `Quận 5`, `TP Thủ Đức`) are dropped from the query and the score, and tokens match as whole words (re-run the same day).", "",
       "## Within tolerance of the reference point (300 m for buildings, 1.5 km for parks/airport/areas)", "",
       "| Group | n | " + " | ".join(S) + " |", "|---|---|" + "---|" * len(S)]
for g in groups + ["ALL"]:
    rs = [r for r in rows if g == "ALL" or r["group"] == g]
    out.append(f"| {g} | {len(rs)} | " + " | ".join(pct(sum(1 for r in rs if r[s].get("withinTolerance")), len(rs)) for s in S) + " |")
out += ["", "## Median distance to reference (found results only)", "", "| Group | " + " | ".join(S) + " |", "|---|" + "---|" * len(S)]
for g in groups:
    rs = [r for r in rows if r["group"] == g]
    cells = []
    for s in S:
        ds = [r[s]["distanceM"] for r in rs if r[s].get("found")]
        cells.append(f"{statistics.median(ds):,.0f} m" if ds else "–")
    out.append(f"| {g} | " + " | ".join(cells) + " |")
out += ["", "## Administrative labels (2025 reform: 2-tier city→ward, Thủ Đức city and districts abolished 1/7/2025)", "",
        "| Check | " + " | ".join(S) + " |", "|---|" + "---|" * len(S)]
for key, title in [("cityMislabelledThuDuc", "'Thủ Đức' in label for a place outside old Thủ Đức"), ("containsPre2025Name", "label still contains a pre-2025 unit (Quận N, Phường N, Bến Nghé, …)")]:
    cells = []
    for s in S:
        rs = [r for r in rows if r[s].get("found")]
        cells.append(pct(sum(1 for r in rs if r[s].get(key)), len(rs)))
    out.append(f"| {title} | " + " | ".join(cells) + " |")
pair = [r for r in rows if r["group"] == "address-new-ward"]
cells = [pct(sum(1 for r in pair if r[s].get("expectedNewWardInLabel")), len(pair)) for s in S]
out.append("| new-ward query → expected new ward named in result | " + " | ".join(cells) + " |")
out += ["", "## Old vs new ward name for the same street address", "", "| Address | old-ward query (sitescout v1.0) | old-ward query (v1.1) | new-ward query (v1.0) |", "|---|---|---|---|"]
olds = [r for r in rows if r["group"] == "address-old-ward"]
news = [r for r in rows if r["group"] == "address-new-ward"]
for o, n in zip(olds, news):
    f = lambda r, k="sitescout": (f"{r[k]['distanceM']:,} m {'✓' if r[k].get('withinTolerance') else '✗'}" if r.get(k, {}).get("found") else "not found")
    out.append(f"| {items[o['id']]['query'].split(',')[0]} ({items[o['id']]['landmark']}) | {f(o)} | {f(o, 'sitescout_v11')} | {f(n)} |")
out += ["", "## Every query", "", "| id | query | " + " | ".join(S) + " | sitescout label |", "|---|---|" + "---|" * (len(S) + 1)]
for r in rows:
    def c(s):
        x = r[s]
        if "error" in x: return "error"
        if not x.get("found"): return "—"
        return f"{x['distanceM']:,} m {'✓' if x['withinTolerance'] else '✗'}"
    lab = (r["sitescout"].get("formatted") or "").replace("|", "/")
    out.append(f"| {r['id']} | {r['query']} | " + " | ".join(c(s) for s in S) + f" | {lab} |")
(here / "RESULTS.md").write_text("\n".join(out) + "\n")
print("\n".join(out[:40]))
