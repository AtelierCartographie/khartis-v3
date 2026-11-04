#!/usr/bin/env python3
"""Analyse la distribution d'une colonne pour choisir sa discrétisation dans Khartis.

Le script lit un tableau CSV, TSV ou TXT sur le poste, sans réseau, et ne modifie
rien. Il calcule les bornes de chaque méthode de Khartis avec les mêmes
algorithmes que ses macros DuckDB (quantiles, Q6, intervalles égaux, moyennes
emboîtées, head/tail, k-means), y compris l'arrondi des bornes. Il mesure la
qualité de chaque découpage par l'indice de Jenks (GVF) et recommande une
méthode et un nombre de classes.

Usage :
  python3 analyser_distribution.py tableau.csv "Taux de chômage (%)"
  python3 analyser_distribution.py tableau.csv taux_de_chomage --classes 5
  python3 analyser_distribution.py tableau.csv taux --sans-valeurs
  python3 analyser_distribution.py tableau.csv taux --json

--sans-valeurs n'affiche aucune valeur tirée des données (ni bornes, ni
minimum, ni moyenne) : seulement la forme de la distribution et la qualité des
découpages. À utiliser quand le rapport part chez un assistant en ligne.
"""

import argparse
import json
import math
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # pas de cache Python laissé dans le dossier du skill
sys.path.insert(0, str(Path(__file__).resolve().parent))  # aussi sous python -I
from commun import KHARTIS_NULL_TOKENS, khartis_column_name, parse_number, read_table  # noqa: E402

# Règles par défaut de Khartis (suggestClassificationDefaults).
KHARTIS_DEFAULT_CLASSES = 4
KHARTIS_HEAD_TAIL_SKEWNESS = 3
KHARTIS_QUANTILES_SKEWNESS = 1.5
KHARTIS_ROWS_PER_CLASS = 3
HEAD_TAIL_THRESHOLD = 0.4
KMEANS_MAX_ITER = 30
HEAD_TAIL_LADDER = 12

LABELS = {
    "quantiles": "Quantiles",
    "q6": "Q6",
    "equal_interval": "Intervalles égaux",
    "nested_means": "Moyennes emboîtées",
    "head_tail": "Head/Tail",
    "kmeans": "K-means (seuils naturels)",
}


# ---------------------------------------------------------------- lecture


def read_values(cells):
    values, missing, invalid = [], 0, []
    for cell in cells:
        if cell.strip() in KHARTIS_NULL_TOKENS:
            missing += 1
            continue
        value = parse_number(cell)
        if value is None:
            invalid.append(cell.strip())
        else:
            values.append(value)
    return values, missing, invalid


# ---------------------------------------------------------- statistiques


def quantile_disc(sorted_values, q):
    """quantile_disc de DuckDB : la valeur observée de rang ceil(n·q)."""
    n = len(sorted_values)
    rn = n * q
    index = max(1, n - math.floor(n - rn)) - 1
    return sorted_values[min(index, n - 1)]


def describe(values):
    n = len(values)
    ordered = sorted(values)
    mean = sum(values) / n
    m2 = sum((v - mean) ** 2 for v in values) / n
    m3 = sum((v - mean) ** 3 for v in values) / n
    # Coefficient d'asymétrie G1, celui de la fonction skewness de DuckDB.
    skewness = None
    if n > 2 and m2 > 0:
        skewness = math.sqrt(n * (n - 1)) / (n - 2) * m3 / m2 ** 1.5
    q1, q3 = quantile_disc(ordered, 0.25), quantile_disc(ordered, 0.75)
    iqr = q3 - q1
    low_fence, high_fence = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    return {
        "n": n,
        "distinct": len(set(values)),
        "min": ordered[0],
        "max": ordered[-1],
        "mean": mean,
        "median": quantile_disc(ordered, 0.5),
        "std": math.sqrt(m2),
        "cv": math.sqrt(m2) / abs(mean) if mean else None,
        "skewness": skewness,
        "outliers_low": sum(1 for v in values if v < low_fence),
        "outliers_high": sum(1 for v in values if v > high_fence),
        "crosses_zero": ordered[0] < 0 < ordered[-1],
    }


# ------------------------------------------- méthodes de Khartis (DuckDB)


def breaks_quantiles(values, k):
    ordered = sorted(values)
    return [quantile_disc(ordered, i / k) for i in range(1, k)]


def breaks_q6(values, _k):
    ordered = sorted(values)
    return [quantile_disc(ordered, q) for q in (0.05, 0.275, 0.5, 0.725, 0.95)]


def breaks_equal_interval(values, k):
    low, high = min(values), max(values)
    if all(float(v).is_integer() for v in values):
        # Colonne d'entiers : DuckDB calcule des bornes entières.
        return [low + math.floor((high - low) * i / k) for i in range(1, k)]
    step = (high - low) / k
    return [low + step * i for i in range(1, k)]


def breaks_nested_means(values, k):
    breaks = [min(values), sum(values) / len(values), max(values)]
    iteration = 1
    while iteration < math.log(k) / math.log(2):
        new = []
        for low, high in zip(breaks, breaks[1:]):
            inside = [v for v in values if low <= v <= high]
            if inside:
                new.append(sum(inside) / len(inside))
        breaks = sorted(breaks + new)
        iteration += 1
    return breaks[1:-1]


def breaks_head_tail(values, k):
    breaks = [sum(values) / len(values)]
    previous_count, head_shares = len(values), []
    while True:
        head = [v for v in values if v > breaks[-1]]
        if len(head) <= 1:
            break
        shares = head_shares + [len(head) / previous_count]
        if sum(shares) / len(shares) > HEAD_TAIL_THRESHOLD:
            break
        breaks.append(sum(head) / len(head))
        previous_count, head_shares = len(head), shares
    return breaks[: max(k, HEAD_TAIL_LADDER) - 1]


def breaks_kmeans(values, k):
    counts = {}
    for v in values:
        counts[v] = counts.get(v, 0) + 1
    distinct = sorted(counts)
    seeds = sorted({quantile_disc(distinct, (2 * i + 1) / (2 * k)) for i in range(k)})

    def nearest(value, centroids):
        return min(centroids, key=lambda c: (abs(value - c), c))

    centroids = seeds
    for _ in range(KMEANS_MAX_ITER):
        sums, weights = {}, {}
        for value in distinct:
            c = nearest(value, centroids)
            sums[c] = sums.get(c, 0.0) + value * counts[value]
            weights[c] = weights.get(c, 0) + counts[value]
        updated = sorted(sums[c] / weights[c] for c in sums)
        if updated == centroids:
            break
        centroids = updated
    bounds = {}
    for value in distinct:
        c = nearest(value, centroids)
        low, high = bounds.get(c, (value, value))
        bounds[c] = (min(low, value), max(high, value))
    ordered = [bounds[c] for c in sorted(bounds)]
    return [(a[1] + b[0]) / 2 for a, b in zip(ordered, ordered[1:])]


COMPUTE = {
    "quantiles": breaks_quantiles,
    "q6": breaks_q6,
    "equal_interval": breaks_equal_interval,
    "nested_means": breaks_nested_means,
    "head_tail": breaks_head_tail,
    "kmeans": breaks_kmeans,
}
METHODS = list(COMPUTE)


def sanitize(breaks, low, high):
    """sanitizeBreaks : bornes finies, strictement entre le minimum et le maximum."""
    return sorted({b for b in breaks if math.isfinite(b) and low < b < high})


def std_round(x):
    """std::round de C++ : la demi-valeur s'arrondit loin de zéro."""
    a = abs(x)
    whole = math.floor(a)
    return math.copysign(whole + (1 if a - whole >= 0.5 else 0), x)


def duckdb_round(x, digits):
    """round de DuckDB, à `digits` décimales (négatif : dizaines, centaines…)."""
    if digits >= 0:
        factor = 10.0 ** digits
        return std_round(x * factor) / factor
    factor = 10.0 ** (-digits)
    return std_round(x / factor) * factor


def roundings(n):
    """generate_roundings : du plus grossier au plus fin."""
    if n == 0:
        return [0.0]
    left, digits = [], 0
    while True:
        rounded = duckdb_round(n, digits)
        if rounded == 0:
            break
        left.append(rounded)
        digits -= 1
    right, digits = [], 1
    while True:
        rounded = duckdb_round(n, digits)
        if rounded != 0:
            right.append(rounded)
        if rounded == n or digits > 15:
            break
        digits += 1
    return list(reversed(left)) + right


def round_thresholds(breaks, values):
    """round_thresholds : chaque borne arrondie sans qu'une valeur change de classe."""
    rounded = []
    for i, b in enumerate(breaks):
        lower_gate = (b + breaks[i - 1]) / 2 if i > 0 else -math.inf
        upper_gate = (b + breaks[i + 1]) / 2 if i + 1 < len(breaks) else math.inf
        below = [v for v in values if v <= b]
        above = [v for v in values if v >= b]
        lower = max(max(below), lower_gate) if below else lower_gate
        upper = min(min(above), upper_gate) if above else upper_gate
        choice = next((r for r in roundings(b) if lower <= r <= upper), None)
        if choice is not None:
            rounded.append(choice)
    return sorted(rounded)


def requested_classes(method, k):
    """resolveRequestedClassCount : Q6 a toujours 6 classes, les moyennes
    emboîtées 2, 4, 8 ou 16."""
    if method == "q6":
        return 6
    if method == "nested_means":
        return min((2, 4, 8, 16), key=lambda c: (abs(c - k), c))
    return max(2, k)


def khartis_breaks(method, values, k):
    """Bornes affichées par Khartis pour une méthode et un nombre de classes."""
    k = requested_classes(method, k)
    low, high = min(values), max(values)
    distinct = len(set(values))
    if k <= 1 or distinct <= 1:
        return [], None
    if k >= distinct:
        k = max(2, distinct - 1)
        if method == "nested_means":
            k = 2 ** int(math.log2(k))
    raw = sanitize(COMPUTE[method](values, k), low, high)
    if not raw:
        return None, None
    rounded = sanitize(round_thresholds(raw, values), low, high)
    breaks = rounded if len(rounded) == len(raw) else raw
    natural = None
    if method == "head_tail":
        natural = len(breaks) + 1
        breaks = breaks[: max(1, k - 1)]
    return breaks, natural


def split_classes(values, breaks):
    """Les valeurs de chaque classe, comme Khartis les compte : [a, b[, la dernière fermée."""
    edges = [min(values)] + breaks + [max(values)]
    last = len(edges) - 2
    return [
        [v for v in values if edges[i] <= v and (v <= edges[i + 1] if i == last else v < edges[i + 1])]
        for i in range(len(edges) - 1)
    ]


def squared_deviations(group):
    mean = sum(group) / len(group)
    return sum((v - mean) ** 2 for v in group)


def gvf(values, classes):
    """Indice de Jenks (goodness of variance fit) : 1 = classes homogènes."""
    total = squared_deviations(values)
    if total == 0:
        return 1.0
    return 1 - sum(squared_deviations(c) for c in classes if c) / total


def build_table(values, k):
    """Bornes, effectifs et qualité de chaque méthode de Khartis."""
    table = []
    for method in METHODS:
        breaks, natural = khartis_breaks(method, values, k)
        if breaks is None:
            continue
        classes = split_classes(values, breaks)
        counts = [len(c) for c in classes]
        table.append({
            "method": method,
            "breaks": breaks,
            "counts": counts,
            "empty": counts.count(0),
            "gvf": gvf(values, classes),
            "natural_classes": natural,
        })
    return table


# --------------------------------------------------------- recommandation


def khartis_default(stats):
    method = "kmeans"
    if stats["skewness"] is not None:
        if stats["skewness"] >= KHARTIS_HEAD_TAIL_SKEWNESS:
            method = "head_tail"
        elif abs(stats["skewness"]) >= KHARTIS_QUANTILES_SKEWNESS:
            method = "quantiles"
    classes = min(KHARTIS_DEFAULT_CLASSES, max(2, stats["n"] // KHARTIS_ROWS_PER_CLASS))
    return method, classes


def advised_class_count(stats):
    """Règle de Huntsberger (1 + 3,3 log10 n), bornée de 4 à 7 et à n/3."""
    k = round(1 + 3.3 * math.log10(stats["n"]))
    k = min(max(k, 4), 7)
    return max(2, min(k, stats["n"] // KHARTIS_ROWS_PER_CLASS, stats["distinct"]))


def shape_verdict(stats):
    s = stats["skewness"]
    if s is None:
        return "indéterminée (trop peu de valeurs)"
    if abs(s) < 0.5:
        return "à peu près symétrique"
    side = "vers les fortes valeurs" if s > 0 else "vers les faibles valeurs"
    if abs(s) < 1:
        return f"légèrement étirée {side}"
    if abs(s) < KHARTIS_HEAD_TAIL_SKEWNESS:
        return f"nettement étirée {side}"
    return f"très étirée {side}, avec une longue traîne"


# À homogénéité égale, la méthode par défaut de Khartis, puis les plus simples à expliquer.
PREFERENCE = ["kmeans", "quantiles", "q6", "equal_interval", "head_tail", "nested_means"]


def recommend(stats, table, k):
    reasons = []
    by_gvf = sorted(
        (r for r in table if r["empty"] == 0),
        key=lambda r: (-round(r["gvf"], 6), PREFERENCE.index(r["method"])),
    )
    s = stats["skewness"] or 0
    if stats["crosses_zero"]:
        reasons.append(
            "Les valeurs passent par zéro : fixer une valeur de rupture à 0 et une palette divergente."
        )
    if stats["distinct"] <= 7:
        reasons.append(
            f"Seulement {stats['distinct']} valeurs distinctes : une couleur par valeur, ou autant de classes, se lit mieux qu'un découpage."
        )
    if s >= KHARTIS_HEAD_TAIL_SKEWNESS:
        choice = "head_tail"
        natural = next((r["natural_classes"] for r in table if r["method"] == "head_tail"), None)
        if natural and natural < k:
            k = natural
        reasons.append(
            f"La distribution est très étirée : Head/Tail isole la traîne des fortes valeurs, en {k} classes naturelles."
        )
    elif abs(s) >= KHARTIS_QUANTILES_SKEWNESS:
        choice = "quantiles"
        reasons.append(
            "La distribution est étirée : les quantiles gardent autant de territoires par classe, au lieu d'en tasser la plupart dans une seule."
        )
    else:
        choice = by_gvf[0]["method"] if by_gvf else "kmeans"
        reasons.append(
            f"L'asymétrie reste sous le seuil où Khartis passe aux quantiles (1,5) : "
            f"la méthode qui forme les classes les plus homogènes est « {LABELS[choice]} »."
        )
    if stats["outliers_high"] + stats["outliers_low"]:
        reasons.append(
            f"{stats['outliers_high'] + stats['outliers_low']} valeur(s) extrême(s) selon la règle de Tukey : Q6 les isole dans les classes du bout."
        )
    primary = next((r for r in table if r["method"] == choice), None)
    # Une classe de plus fait toujours monter le GVF : il ne se compare qu'à nombre de classes égal.
    others = [
        r for r in by_gvf
        if primary and r["method"] != choice and len(r["counts"]) == len(primary["counts"])
    ]
    if primary and others and others[0]["gvf"] >= primary["gvf"] + 0.1:
        best = others[0]
        reasons.append(
            f"Alternative : « {LABELS[best['method']]} » forme des classes nettement plus homogènes "
            f"(GVF {dec(best['gvf'])} contre {dec(primary['gvf'])}), en {len(best['counts'])} classes. "
            "À préférer pour montrer les écarts entre les valeurs plutôt que les rangs."
        )
    if abs(s) >= KHARTIS_QUANTILES_SKEWNESS:
        reasons.append(
            "Sur une distribution aussi étirée, le GVF récompense surtout l'isolement des valeurs extrêmes : "
            "le lire avec les effectifs par classe, et écarter les méthodes qui laissent des classes vides ou presque."
        )
    reasons.append(
        "Pour comparer des rangs (« le quart des territoires où… »), préférer les quantiles quelle que soit la forme."
    )
    return choice, k, reasons


# ------------------------------------------------------------------ rapport


def dec(x):
    return f"{x:.2f}".replace(".", ",")


def fmt(x):
    if x is None:
        return "–"
    if float(x).is_integer() and abs(x) < 1e15:
        return f"{int(x):,}".replace(",", " ")
    return f"{x:,.4g}".replace(",", " ").replace(".", ",")


def report_json(analysis, hide):
    stats, table = analysis["stats"], analysis["table"]
    return json.dumps({
        "colonne": analysis["header"],
        "nom_dans_khartis": khartis_column_name(analysis["header"]),
        "valeurs": stats["n"],
        "manquantes": analysis["missing"],
        "non_numeriques": len(analysis["invalid"]),
        "statistiques": None if hide else stats,
        "asymetrie": stats["skewness"],
        "forme": shape_verdict(stats),
        "classes_comparees": analysis["k"],
        "methodes": [{**row, "breaks": None if hide else row["breaks"]} for row in table],
        "defaut_khartis": {"methode": analysis["default"][0], "classes": analysis["default"][1]},
        "recommandation": {"methode": analysis["choice"], "classes": analysis["advised"], "raisons": analysis["reasons"]},
    }, ensure_ascii=False, indent=2)


def report_text(analysis, hide):
    stats, table, k, invalid = analysis["stats"], analysis["table"], analysis["k"], analysis["invalid"]
    header = analysis["header"]
    out = [
        f"Colonne « {header} » (dans Khartis : {khartis_column_name(header)})",
        f"{stats['n']} valeurs numériques, {analysis['missing']} manquante(s), {len(invalid)} non numérique(s).",
    ]
    if invalid:
        sample = "" if hide else " : " + ", ".join(f"« {v} »" for v in sorted(set(invalid))[:3])
        out.append(
            f"Attention, {len(invalid)} cellule(s) ne sont pas des nombres{sample}. Khartis lirait alors toute la colonne comme du texte : remplacer ces cellules par des cellules vides."
        )
    out += ["", "Forme de la distribution"]
    if not hide:
        out.append(
            f"  min {fmt(stats['min'])}, médiane {fmt(stats['median'])}, moyenne {fmt(stats['mean'])}, max {fmt(stats['max'])}, écart type {fmt(stats['std'])}"
        )
    skew = stats["skewness"]
    out.append(f"  asymétrie {fmt(skew) if skew is not None else '–'} : {shape_verdict(stats)}")
    if stats["cv"] is not None:
        out.append(f"  coefficient de variation {fmt(stats['cv'])}")
    out.append(f"  valeurs extrêmes (Tukey) : {stats['outliers_low']} en bas, {stats['outliers_high']} en haut")
    if stats["crosses_zero"]:
        out.append("  les valeurs passent par zéro")
    out += ["", f"Méthodes de Khartis, comparées à {k} classes (Q6 en a toujours 6, les moyennes emboîtées 2, 4 ou 8)"]
    for row in table:
        line = f"  {LABELS[row['method']]:<27} {len(row['counts'])} classes   GVF {dec(row['gvf'])}   effectifs {row['counts']}"
        if row["empty"]:
            line += f"   {row['empty']} classe(s) vide(s)"
        if row["natural_classes"] and row["natural_classes"] < k:
            line += f"   (seulement {row['natural_classes']} classes naturelles)"
        out.append(line)
        if not hide:
            out.append(f"  {'':<27} bornes {', '.join(fmt(b) for b in row['breaks'])}")
    default_method, default_classes = analysis["default"]
    out += [
        "",
        f"Par défaut, Khartis proposerait : {LABELS[default_method]}, {default_classes} classes.",
        f"Recommandation : {LABELS[analysis['choice']]}, {analysis['advised']} classes.",
    ]
    out += [f"  - {reason}" for reason in analysis["reasons"]]
    out += [
        "",
        "Le GVF (indice de Jenks) mesure l'homogénéité des classes, de 0 à 1 : plus il est proche de 1, mieux le découpage résume les valeurs. "
        "Il ne se compare qu'à nombre de classes égal, car une classe de plus le fait toujours monter. "
        "Khartis recalcule lui-même les bornes ; ce rapport sert à choisir la méthode.",
    ]
    return "\n".join(out)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("fichier")
    parser.add_argument("colonne")
    parser.add_argument("--classes", type=int, help="nombre de classes à comparer (par défaut : celui conseillé)")
    parser.add_argument("--sans-valeurs", action="store_true", help="n'affiche aucune valeur tirée des données")
    parser.add_argument("--json", action="store_true", help="rapport au format JSON")
    args = parser.parse_args()

    headers, rows, _, _ = read_table(args.fichier, args.colonne)
    values, missing, invalid = read_values(row[0] for row in rows)
    if len(values) < 3:
        raise SystemExit("Moins de trois valeurs numériques : rien à discrétiser.")

    stats = describe(values)
    k = args.classes or advised_class_count(stats)
    table = build_table(values, k)
    choice, advised, reasons = recommend(stats, table, k)
    if advised != k and not args.classes:
        # Head/Tail trouve moins de classes : les autres méthodes se comparent à ce nombre.
        k = advised
        table = build_table(values, k)
        choice, advised, reasons = recommend(stats, table, k)
    analysis = {
        "header": headers[0], "missing": missing, "invalid": invalid, "stats": stats, "k": k,
        "table": table, "choice": choice, "advised": advised, "reasons": reasons,
        "default": khartis_default(stats),
    }
    print(report_json(analysis, args.sans_valeurs) if args.json else report_text(analysis, args.sans_valeurs))


if __name__ == "__main__":
    main()
