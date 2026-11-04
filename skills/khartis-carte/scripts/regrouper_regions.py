#!/usr/bin/env python3
"""Regroupe un tableau des anciennes régions françaises (avant 2016) dans les
régions actuelles, pour le joindre au fond de carte des régions de Khartis.

Les effectifs s'additionnent. Un taux ne s'additionne pas et ne se moyenne pas :
il se recalcule à partir des effectifs regroupés, que l'on décrit avec --taux.
La réforme de 2016 a fusionné des régions entières, sans en couper aucune : le
regroupement est donc exact, à condition que toutes les anciennes régions d'une
région actuelle soient dans le tableau.

Le script lit et écrit sur le poste, sans réseau.

Usage :
  python3 regrouper_regions.py anciennes.csv --colonne Région \\
      --somme naissances,population \\
      --taux "taux_natalite=naissances/population*1000" \\
      --sortie regions-2016.csv

--colonne    colonne des régions : code INSEE d'avant 2016 (82) ou nom (Rhône-Alpes)
--somme      colonnes d'effectifs à additionner
--taux       taux à recalculer, de la forme nom=numérateur/dénominateur*facteur
--comparer   colonne du taux d'origine : affiche, pour chaque région regroupée,
             l'écart entre le taux recalculé et la moyenne simple des anciens taux
--sans-valeurs  n'affiche aucune valeur tirée des données : le tableau va seulement
             dans le fichier de --sortie, et la comparaison ne donne que des écarts en %
"""

import argparse
import csv
import math
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # pas de cache Python laissé dans le dossier du skill
sys.path.insert(0, str(Path(__file__).resolve().parent))  # aussi sous python -I
from commun import column_index, parse_number, plain, read_table  # noqa: E402

# Code INSEE d'avant 2016 : code de la région actuelle.
OLD_TO_NEW = {
    "11": "11", "21": "44", "22": "32", "23": "28", "24": "24", "25": "28",
    "26": "27", "31": "32", "41": "44", "42": "44", "43": "27", "52": "52",
    "53": "53", "54": "75", "72": "75", "73": "76", "74": "75", "82": "84",
    "83": "84", "91": "76", "93": "93", "94": "94",
    "01": "01", "02": "02", "03": "03", "04": "04", "06": "06",
}
OLD_LABELS = {
    "11": "Île-de-France", "21": "Champagne-Ardenne", "22": "Picardie", "23": "Haute-Normandie",
    "24": "Centre", "25": "Basse-Normandie", "26": "Bourgogne", "31": "Nord-Pas-de-Calais",
    "41": "Lorraine", "42": "Alsace", "43": "Franche-Comté", "52": "Pays de la Loire",
    "53": "Bretagne", "54": "Poitou-Charentes", "72": "Aquitaine", "73": "Midi-Pyrénées",
    "74": "Limousin", "82": "Rhône-Alpes", "83": "Auvergne", "91": "Languedoc-Roussillon",
    "93": "Provence-Alpes-Côte d'Azur", "94": "Corse", "01": "Guadeloupe", "02": "Martinique",
    "03": "Guyane", "04": "La Réunion", "06": "Mayotte",
}
# Nom d'une ancienne région, réduit à ses mots, ou sigle : son code.
OLD_NAMES = {plain(label): code for code, label in OLD_LABELS.items()} | {"idf": "11", "paca": "93", "reunion": "04"}
NEW_NAMES = {
    "11": "Île-de-France", "24": "Centre-Val de Loire", "27": "Bourgogne-Franche-Comté",
    "28": "Normandie", "32": "Hauts-de-France", "44": "Grand Est", "52": "Pays de la Loire",
    "53": "Bretagne", "75": "Nouvelle-Aquitaine", "76": "Occitanie",
    "84": "Auvergne-Rhône-Alpes", "93": "Provence-Alpes-Côte d'Azur", "94": "Corse",
    "01": "Guadeloupe", "02": "Martinique", "03": "Guyane", "04": "La Réunion",
    "06": "Mayotte",
}
# Une région actuelle déjà présente sous son nom actuel passe telle quelle.
CURRENT_NAMES = {
    "centre val de loire": "24", "bourgogne franche comte": "27", "normandie": "28",
    "hauts de france": "32", "grand est": "44", "nouvelle aquitaine": "75",
    "occitanie": "76", "auvergne rhone alpes": "84",
}
RATE = re.compile(r"^\s*([^=]+?)\s*=\s*([^/]+?)\s*/\s*([^*]+?)\s*(?:\*\s*([0-9.,]+))?\s*$")


def region_key(text):
    """Nom de région réduit à ses mots, sans le mot « région » devant."""
    return re.sub(r"^region ", "", plain(text))


def source_code(cell):
    """Code d'avant 2016, ou d'une région actuelle, à partir d'un code ou d'un nom."""
    text = cell.strip()
    if re.fullmatch(r"\d{1,2}", text):
        code = text.zfill(2)
        if code in OLD_TO_NEW:
            return code, OLD_TO_NEW[code]
    name = region_key(text)
    if name in OLD_NAMES:
        code = OLD_NAMES[name]
        return code, OLD_TO_NEW[code]
    if name in CURRENT_NAMES:
        return None, CURRENT_NAMES[name]
    return None, None


def decimal(x, significant=4):
    """Nombre en notation décimale française, sans notation scientifique."""
    if float(x).is_integer():
        return str(int(x))
    digits = max(0, significant - 1 - math.floor(math.log10(abs(x)))) if x else 0
    return f"{x:.{digits}f}".replace(".", ",")


def parse_rates(specs, sums):
    """Les taux à recalculer ; leurs numérateurs et dénominateurs rejoignent les sommes."""
    rates = []
    for spec in specs:
        match = RATE.match(spec)
        if not match:
            raise SystemExit(f"Taux illisible : « {spec} ». Forme attendue : nom=numérateur/dénominateur*facteur")
        name, num, den, factor = match.groups()
        rates.append((name, num, den, float((factor or "1").replace(",", "."))))
        sums.extend(needed for needed in (num, den) if needed not in sums)
    return rates


def aggregate(rows, region_index, sum_index, compare_index):
    """Sommes par région actuelle, anciennes régions vues, anciens taux, problèmes."""
    totals, members, old_rates, problems = {}, {}, {}, []
    for row in rows:
        cell = row[region_index] if region_index < len(row) else ""
        old, new = source_code(cell)
        if new is None:
            problems.append(f"« {cell} » : région inconnue, ligne ignorée (ligne de total ?)")
            continue
        bucket = totals.setdefault(new, {name: 0.0 for name in sum_index})
        members.setdefault(new, []).append(old or new)
        if compare_index is not None and compare_index < len(row):
            rate = parse_number(row[compare_index])
            if rate is not None:
                old_rates.setdefault(new, []).append(rate)
        for name, index in sum_index.items():
            value = parse_number(row[index]) if index < len(row) else None
            if value is None:
                problems.append(f"« {cell} » : « {name} » vide ou non numérique ; la région {NEW_NAMES[new]} sera incomplète")
                bucket[name] = None
            elif bucket[name] is not None:
                bucket[name] += value
    return totals, members, old_rates, problems


def find_incomplete(members, problems):
    """Régions actuelles dont une ancienne région manque : leurs sommes seraient fausses."""
    expected = {}
    for old, new in OLD_TO_NEW.items():
        expected.setdefault(new, set()).add(old)
    incomplete = set()
    for new, got in members.items():
        if got == [new] and new in CURRENT_NAMES.values():
            continue
        missing = expected[new] - set(got)
        if missing:
            incomplete.add(new)
            problems.append(
                f"{NEW_NAMES[new]} : il manque {', '.join(OLD_LABELS[c] for c in sorted(missing))} ; ses valeurs seraient fausses, elles sont laissées vides"
            )
    return incomplete


def build_rows(totals, sums, rates, incomplete):
    """Le tableau des régions actuelles et les taux recalculés."""
    computed = {}
    for name, num, den, factor in rates:
        for new, values in totals.items():
            n, d = values[num], values[den]
            if new not in incomplete and n is not None and d not in (None, 0):
                computed[(name, new)] = n / d * factor
    # Même nombre de décimales sur toute une colonne de taux : quatre chiffres
    # significatifs pour la plus grande valeur.
    decimals = {}
    for name, *_ in rates:
        largest = max((abs(v) for (n, _), v in computed.items() if n == name), default=0)
        decimals[name] = max(0, 3 - math.floor(math.log10(largest))) if largest else 0
    out_rows = []
    for new in sorted(totals):
        line = [new, NEW_NAMES[new]]
        for name in sums:
            v = None if new in incomplete else totals[new][name]
            line.append("" if v is None else decimal(v, 15))
        for name, *_ in rates:
            v = computed.get((name, new))
            line.append("" if v is None else f"{v:.{decimals[name]}f}".replace(".", ","))
        out_rows.append(line)
    return out_rows, computed


def print_comparison(regrouped, rates, computed, old_rates, without_values):
    name = rates[0][0]
    for new in sorted(regrouped):
        v = computed.get((name, new))
        if v is None or len(old_rates.get(new, [])) < 2:
            continue
        naive = sum(old_rates[new]) / len(old_rates[new])
        if without_values:
            gap = decimal(abs(naive - v) / v * 100, 2) if v else "?"
            message = f"{NEW_NAMES[new]} : la moyenne des anciens taux s'écarte de {gap} % du taux recalculé."
        else:
            message = f"{NEW_NAMES[new]} : {name} recalculé {decimal(v)}, contre {decimal(naive)} en moyennant les anciens taux."
        print(message, file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("fichier")
    parser.add_argument("--colonne", required=True)
    parser.add_argument("--somme", default="", help="colonnes d'effectifs, séparées par des virgules")
    parser.add_argument("--taux", action="append", default=[], help="nom=numérateur/dénominateur*facteur")
    parser.add_argument("--sortie", help="fichier CSV à écrire ; sans cette option, le tableau s'affiche")
    parser.add_argument("--comparer", help="colonne du taux d'origine, pour montrer l'erreur d'une moyenne simple")
    parser.add_argument("--sans-valeurs", action="store_true", help="n'affiche aucune valeur tirée des données")
    args = parser.parse_args()
    if args.sans_valeurs and not args.sortie:
        raise SystemExit("Avec --sans-valeurs, donner --sortie : le tableau va dans le fichier, pas à l'écran.")

    headers, rows, _, _ = read_table(args.fichier)
    sums = [s.strip() for s in args.somme.split(",") if s.strip()]
    rates = parse_rates(args.taux, sums)
    totals, members, old_rates, problems = aggregate(
        rows,
        column_index(headers, args.colonne),
        {name: column_index(headers, name) for name in sums},
        column_index(headers, args.comparer) if args.comparer else None,
    )
    incomplete = find_incomplete(members, problems)
    out_rows, computed = build_rows(totals, sums, rates, incomplete)

    out_headers = ["Code région", "Région"] + sums + [name for name, *_ in rates]
    if args.sortie:
        with open(args.sortie, "w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle, delimiter=";")
            writer.writerow(out_headers)
            writer.writerows(out_rows)
        print(f"{len(out_rows)} régions écrites dans {args.sortie}, à importer dans Khartis.")
    else:
        writer = csv.writer(sys.stdout, delimiter=";")
        writer.writerow(out_headers)
        writer.writerows(out_rows)
    regrouped = [c for c in members if len(members[c]) > 1]
    print(f"Régions regroupées : {', '.join(NEW_NAMES[c] for c in sorted(regrouped)) or 'aucune'}.", file=sys.stderr)
    if rates and old_rates:
        print_comparison(regrouped, rates, computed, old_rates, args.sans_valeurs)
    for problem in problems:
        print(f"Attention : {problem}", file=sys.stderr)
    if not rates and sums:
        print("Rappel : un taux du tableau d'origine ne se moyenne pas ; décrivez-le avec --taux pour le recalculer.", file=sys.stderr)


if __name__ == "__main__":
    main()
