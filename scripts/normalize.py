#!/usr/bin/env python3
"""Regionaldatenbank Deutschland (GENESIS) scrapes -> data/gemeinden.json
 - hebesatz_B_20241231.json : table 71231-03-01-5, Grundsteuer B Hebesatz, Stand 31.12.2024, all Gemeinden
 - hebesatz_changes_20250630.json : table 71231-02-01-5, Hebesätze changed in H1 2025 (A, B, C, Gewerbe), Stand 30.06.2025
 - hebesaetze-realsteuern.xlsx : Destatis 2022 publication, used only for population (30.06.2022) and 2022 rates
Current B = H1-2025 change if present else 31.12.2024 value."""
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data/raw"
LAENDER = {"01": ("Schleswig-Holstein", "SH"), "02": ("Hamburg", "HH"), "03": ("Niedersachsen", "NI"), "04": ("Bremen", "HB"), "05": ("Nordrhein-Westfalen", "NW"), "06": ("Hessen", "HE"), "07": ("Rheinland-Pfalz", "RP"), "08": ("Baden-Württemberg", "BW"), "09": ("Bayern", "BY"), "10": ("Saarland", "SL"), "11": ("Berlin", "BE"), "12": ("Brandenburg", "BB"), "13": ("Mecklenburg-Vorpommern", "MV"), "14": ("Sachsen", "SN"), "15": ("Sachsen-Anhalt", "ST"), "16": ("Thüringen", "TH")}
# Grundsteuer model per Land after the 2025 reform (Bundesmodell vs. Ländermodelle)
MODELL = {"BW": "Modifiziertes Bodenwertmodell", "BY": "Flächenmodell", "HH": "Wohnlagenmodell", "HE": "Flächen-Faktor-Modell", "NI": "Flächen-Lage-Modell", "SL": "Bundesmodell mit abweichenden Steuermesszahlen", "SN": "Bundesmodell mit abweichenden Steuermesszahlen"}


def num(v):
    v = (v or "").strip().replace(" ", "").replace(" ", "")
    return int(v) if re.fullmatch(r"\d+", v) else None


def slug(s):
    s = s.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss").replace("Ä", "Ae").replace("Ö", "Oe").replace("Ü", "Ue")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s.lower())).strip("-")


def clean_name(n):
    """'Kiel, kreisfreie Stadt, Landeshauptstadt' -> ('Kiel', 'kreisfreie Stadt, Landeshauptstadt')"""
    parts = [x.strip() for x in n.split(",")]
    return parts[0], ", ".join(parts[1:])


def main():
    base = json.loads((RAW / "hebesatz_B_20241231.json").read_text())
    changes = {}
    cp = RAW / "hebesatz_changes_20250630.json"
    if cp.exists():
        for r in json.loads(cp.read_text()):
            changes[r[1]] = {"a": num(r[3]), "b": num(r[4]), "c": num(r[5]), "gew": num(r[6])}
    pop, old = {}, {}
    wb = openpyxl.load_workbook(RAW / "hebesaetze-realsteuern.xlsx", read_only=True)
    for ws in wb.worksheets:
        if not ws.title.startswith("Land "):
            continue
        for row in ws.iter_rows(values_only=True):
            ags = str(row[3] or "").strip()
            if re.fullmatch(r"\d{8}", ags):
                p = str(row[5] or "").replace(" ", "")
                pop[ags] = int(p) if p.isdigit() else None
                old[ags] = {"a": row[6] if isinstance(row[6], (int, float)) else None, "b": row[7] if isinstance(row[7], (int, float)) else None, "gew": row[8] if isinstance(row[8], (int, float)) else None}
    gem = []
    seen = defaultdict(int)
    for code, name, val, note in base:
        b24 = num(val)
        ch = changes.get(code)
        if b24 is None and not (ch and ch.get("b")):
            continue  # gemeindefreies Gebiet / no rate
        short, suffix = clean_name(name)
        land = LAENDER[code[:2]]
        s = slug(short)
        seen[(code[:2], s)] += 1
        if seen[(code[:2], s)] > 1:
            s = f"{s}-{seen[(code[:2], s)]}"
        o = old.get(code, {})
        gem.append({"ags": code, "name": short, "suffix": suffix, "land": land[0], "land_code": land[1], "land_slug": slug(land[0]), "slug": s, "kreis": code[:5],
                    "b2024": b24, "b2025": ch["b"] if ch and ch.get("b") else None, "a2025": ch["a"] if ch else None, "c2025": ch["c"] if ch else None, "gew2025": ch["gew"] if ch else None,
                    "b2022": int(o["b"]) if o.get("b") is not None else None, "a2022": int(o["a"]) if o.get("a") is not None else None, "gew2022": int(o["gew"]) if o.get("gew") is not None else None,
                    "ew": pop.get(code), "changed_2025": bool(ch and ch.get("b"))})
    for g in gem:
        g["b"] = g["b2025"] if g["b2025"] is not None else g["b2024"]
        g["stand"] = "30.06.2025" if g["b2025"] is not None else "31.12.2024"
    out = {"source": {"name": "Regionaldatenbank Deutschland (Statistische Ämter des Bundes und der Länder), Tabellen 71231-03-01-5 und 71231-02-01-5; Destatis Hebesätze der Realsteuern 2022 (Bevölkerung)",
                      "url": "https://www.regionalstatistik.de/genesis/online?operation=table&code=71231-03-01-5", "fetched": "2026-09-19", "license": "Datenlizenz Deutschland – Namensnennung – Version 2.0"},
           "modell": MODELL, "gemeinden": gem}
    (ROOT / "data/gemeinden.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(gem)} Gemeinden, {sum(1 for g in gem if g['changed_2025'])} changed in H1 2025, {sum(1 for g in gem if g['ew'])} with population")


if __name__ == "__main__":
    main()
