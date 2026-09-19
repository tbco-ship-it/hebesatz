#!/usr/bin/env python3
"""Generate the static Hebesatz-Finder site into dist/ from data/gemeinden.json."""
import argparse
import datetime as dt
import hashlib
import json
import shutil
from collections import defaultdict
from pathlib import Path
from xml.sax.saxutils import escape

from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
SITE = "Hebesatz-Finder"


def de(n, dec=0):
    if n is None:
        return "–"
    s = f"{n:,.{dec}f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="/hebesatz/")
    ap.add_argument("--origin", default="https://tbco-ship-it.github.io")
    ap.add_argument("--cname", default="")
    ap.add_argument("--adsense-pub", default="pub-8425563704095379")
    args = ap.parse_args()
    base = args.base if args.base.endswith("/") else args.base + "/"
    origin = args.origin.rstrip("/")
    today = dt.date.today()

    d = json.loads((ROOT / "data/gemeinden.json").read_text())
    gem, source, modell = d["gemeinden"], d["source"], d["modell"]
    laender = {}
    for g in gem:
        g["path"] = f"{g['land_slug']}/{g['slug']}/"
        L = laender.setdefault(g["land_code"], {"code": g["land_code"], "name": g["land"], "slug": g["land_slug"], "path": f"{g['land_slug']}/", "gem": [], "modell": modell.get(g["land_code"], "Bundesmodell")})
        L["gem"].append(g)
    allb = sorted(g["b"] for g in gem)
    de_med = allb[len(allb) // 2]
    for L in laender.values():
        L["gem"].sort(key=lambda g: -g["b"])
        vals = sorted(g["b"] for g in L["gem"])
        L["med"] = vals[len(vals) // 2]
        L["min"], L["max"] = L["gem"][-1], L["gem"][0]
        L["n_changed"] = sum(1 for g in L["gem"] if g["changed_2025"])
        big = [g for g in L["gem"] if (g["ew"] or 0) >= 20000]
        L["big"] = big
        for i, g in enumerate(L["gem"]):
            g["rank_land"], g["n_land"] = i + 1, len(L["gem"])
        # pop-weighted mean for the Land
        pw = [(g["b"], g["ew"]) for g in L["gem"] if g["ew"]]
        L["pw"] = round(sum(b * p for b, p in pw) / max(1, sum(p for _, p in pw)))
    land_list = sorted(laender.values(), key=lambda L: L["name"])
    by_kreis = defaultdict(list)
    for g in gem:
        by_kreis[g["kreis"]].append(g)
    big_all = sorted([g for g in gem if (g["ew"] or 0) >= 20000], key=lambda g: -g["b"])
    cities100 = sorted([g for g in gem if (g["ew"] or 0) >= 100000], key=lambda g: -g["b"])
    lowest = sorted([g for g in gem if (g["ew"] or 0) >= 20000], key=lambda g: g["b"])[:100]
    changed = sorted([g for g in gem if g["changed_2025"] and g["b2024"]], key=lambda g: -(g["b2025"] - g["b2024"]))

    h = hashlib.md5()
    for f in sorted((ROOT / "static").glob("*")):
        h.update(f.read_bytes())
    h.update((ROOT / "data/gemeinden.json").read_bytes())
    v = h.hexdigest()[:8]
    env = Environment(loader=FileSystemLoader(ROOT / "templates"), autoescape=select_autoescape(["html"]))
    env.filters["de"] = de
    env.globals.update(site=SITE, base=base, origin=origin, today=today.isoformat(), v=v, adsense_pub=args.adsense_pub, source=source, laender=laender, land_list=land_list,
                       n_gem=len(gem), de_med=de_med, n_changed=sum(1 for g in gem if g["changed_2025"]))

    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()
    shutil.copytree(ROOT / "static", DIST / "static")
    items = [[g["name"], g["land_code"], g["slug"], g["b"], g["b2024"], g["ew"], 1 if g["changed_2025"] else 0, g["gew2025"] or g["gew2022"]] for g in gem]
    (DIST / "static/index.json").write_text(json.dumps({"laender": {L["code"]: [L["name"], L["slug"], L["med"]] for L in laender.values()}, "de_med": de_med, "items": items}, ensure_ascii=False, separators=(",", ":")))

    urls = []

    def write(path, template, **ctx):
        out = DIST / path
        out.mkdir(parents=True, exist_ok=True)
        (out / "index.html").write_text(env.get_template(template).render(path=path, **ctx))
        urls.append(path)

    write("", "index.html", top=cities100[:8], low=lowest[:8], up=changed[:8])
    for page in ("impressum", "datenschutz", "methodik", "kontakt"):
        write(f"{page}/", f"{page}.html")
    write("bundeslaender/", "laender.html")
    write("ranking/grossstaedte/", "ranking.html", title="Grundsteuer B Hebesatz 2025 in den Großstädten (ab 100.000 Einwohner)", rows=cities100, kind="cities")
    write("ranking/hoechste/", "ranking.html", title="Die höchsten Grundsteuer-B-Hebesätze Deutschlands (Gemeinden ab 20.000 Einwohner)", rows=big_all[:100], kind="high")
    write("ranking/niedrigste/", "ranking.html", title="Die niedrigsten Grundsteuer-B-Hebesätze Deutschlands (Gemeinden ab 20.000 Einwohner)", rows=lowest, kind="low")
    write("ranking/erhoehungen-2025/", "ranking.html", title="Die stärksten Hebesatz-Erhöhungen zur Grundsteuerreform 2025", rows=changed[:100], kind="up")
    write("ratgeber/grundsteuerreform-2025/", "guide_reform.html")
    write("ratgeber/grundsteuer-berechnen/", "guide_calc.html")
    write("ratgeber/einspruch/", "guide_einspruch.html")
    for L in land_list:
        write(L["path"], "land.html", L=L)
        for g in L["gem"]:
            near = sorted([x for x in by_kreis[g["kreis"]] if x is not g], key=lambda x: -(x["ew"] or 0))[:10]
            write(g["path"], "gemeinde.html", g=g, L=L, near=near)

    (DIST / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "\n".join(f"<url><loc>{escape(origin + base + u)}</loc></url>" for u in urls) + "\n</urlset>")
    (DIST / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {origin}{base}sitemap.xml\n")
    (DIST / "404.html").write_text(env.get_template("404.html").render(path="404"))
    (DIST / ".nojekyll").write_text("")
    key = (ROOT / "static/indexnow-key.txt").read_text().strip()
    (DIST / f"{key}.txt").write_text(key + "\n")
    if args.adsense_pub:
        (DIST / "ads.txt").write_text(f"google.com, {args.adsense_pub}, DIRECT, f08c47fec0942fa0\n")
    if args.cname:
        (DIST / "CNAME").write_text(args.cname + "\n")
    print(f"built {len(urls)} pages ({len(gem)} Gemeinden, {len(laender)} Länder) -> {DIST}")


if __name__ == "__main__":
    main()
