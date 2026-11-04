#!/usr/bin/env python3
"""Vérifie un tableau avant de l'importer dans Khartis.

Le script lit un fichier CSV, TSV ou TXT sur le poste, sans réseau, et ne
modifie rien. Il signale ce qui empêcherait la jointure ou fausserait la carte :
lignes de total et leur écart à la somme des territoires, codes qui ont perdu
leur zéro de tête, nombres écrits avec une unité, valeurs manquantes que Khartis
ne reconnaît pas, lignes répétées, anciennes régions.

Usage :
  python3 verifier_tableau.py tableau.csv
  python3 verifier_tableau.py tableau.csv --sans-exemples

--sans-exemples n'affiche aucun contenu de cellule, seulement des comptes.
"""

import argparse
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # pas de cache Python laissé dans le dossier du skill
sys.path.insert(0, str(Path(__file__).resolve().parent))  # aussi sous python -I
from commun import KHARTIS_NULL_TOKENS, plain, read_table  # noqa: E402
from regrouper_regions import OLD_NAMES, OLD_TO_NEW, region_key  # noqa: E402

# Anciennes régions absentes du fond actuel : fusionnées en 2016, ou renommée (Centre).
OBSOLETE_REGIONS = {name for name, code in OLD_NAMES.items() if OLD_TO_NEW[code] != code} | {"centre"}
SECRET_TOKENS = {"s", "nd", "n.d.", "n.d", "nc", "c", "secret", "x", "*"}
TOTAL_WORDS = re.compile(
    r"^(total|sous total|ensemble|france entiere|france metropolitaine|france hors mayotte|moyenne|somme)\b"
)
# Mots que Khartis lit dans les noms de colonnes (semio-detector).
RATIO_WORDS = {
    "ratio", "rate", "taux", "tx", "percent", "pct", "pour", "part", "share",
    "proportion", "indice", "densite", "density", "per", "capita", "habitant",
    "habitants", "moyenne", "mean", "avg", "median", "mediane", "esperance",
}
RATIO_MARKS = ("%", "‰", "/")
STOCK_WORDS = {
    "population", "pop", "nombre", "nb", "count", "total", "effectif",
    "effectifs", "superficie", "surface", "area", "montant", "somme", "sum",
}
GEO_WORDS = {"code", "insee", "iso", "iso3", "nuts", "siren", "dep", "reg", "com", "codgeo"}
UNSUPPORTED = {".xlsx", ".xls", ".ods", ".numbers"}
DELIMITER_NAMES = {",": "virgule", ";": "point-virgule", "\t": "tabulation", "|": "barre verticale"}
MAX_BYTES = 200 * 1024 * 1024
MAX_ROWS = 1_000_000
UNIT = "unité dans la cellule"
THOUSANDS = "séparateur de milliers"


def classify(cell):
    """Nombre écrit comme Khartis le lit sans réglage, ou le défaut qui l'en empêche."""
    text = cell.strip()
    if re.fullmatch(r"[+-]?\d+([.,]\d+)?([eE][+-]?\d+)?", text):
        return float(text.replace(",", ".")), None
    if re.fullmatch(r"[+-]?\d{1,3}([   ]\d{3})+([.,]\d+)?", text):
        return None, THOUSANDS
    if re.fullmatch(r"[+-]?\d+([.,]\d+)?\s*(%|‰|€|\$|hab\.?|km²|km2|ha)", text, re.I):
        return None, UNIT
    return None, None


def is_ratio(header):
    return bool(set(plain(header).split()) & RATIO_WORDS) or any(m in header for m in RATIO_MARKS)


def total_label(row):
    """Le libellé qui fait d'une ligne une ligne de total, ou None."""
    for cell in row:
        text = cell.strip()
        # Un nombre ou un code ne peut pas être un libellé de total.
        if text and not text.lstrip("+-")[:1].isdigit() and TOTAL_WORDS.match(plain(text)):
            return text
    return None


class Report:
    """Les constats, rangés par gravité ; les exemples de cellules sont facultatifs."""

    def __init__(self, with_examples):
        self.with_examples = with_examples
        self.fix, self.check, self.ok = [], [], []

    def example(self, cells):
        if not self.with_examples or not cells:
            return ""
        shown = ", ".join(f"« {c} »" for c in sorted(set(cells))[:3])
        return f" (par exemple {shown})"

    def print(self):
        print("À corriger avant l'import")
        print("\n".join(f"  - {line}" for line in self.fix) if self.fix else "  rien")
        print("\nÀ vérifier")
        print("\n".join(f"  - {line}" for line in self.check) if self.check else "  rien")
        print("\nCe que Khartis devrait reconnaître")
        print("\n".join(f"  - {line}" for line in self.ok))


def check_layout(headers, body, delimiter, report):
    report.ok.append(f"{len(body)} lignes et {len(headers)} colonnes, séparées par des {DELIMITER_NAMES[delimiter]}s.")
    if len(body) > MAX_ROWS:
        report.fix.append("Plus d'un million de lignes, la limite de Khartis.")
    if all(classify(h)[0] is not None for h in headers if h.strip()):
        report.fix.append("La première ligne ressemble à des données, pas à des en-têtes : ajouter une ligne de noms de colonnes.")
    seen = set()
    for header in headers:
        key = plain(header)
        if not key:
            report.fix.append("Une colonne n'a pas de nom : lui en donner un.")
        elif key in seen:
            report.fix.append(f"Deux colonnes portent le même nom{report.example([header])} : les distinguer.")
        seen.add(key)
    ragged = sum(1 for r in body if len(r) != len(headers))
    if ragged:
        report.check.append(f"{ragged} ligne(s) n'ont pas autant de cellules que l'en-tête : cellules fusionnées, ou séparateur présent dans un texte ?")


def check_total(headers, total, columns, report):
    """Une ligne de total doit valoir la somme des territoires : un écart signale
    des territoires manquants ou en double, ou un total d'un autre champ."""
    for index, header in enumerate(headers):
        # Un taux ne s'additionne pas : seuls les effectifs se comparent au total.
        if is_ratio(header) or index >= len(total) or index >= len(columns):
            continue
        expected = classify(total[index])[0]
        values = [classify(c)[0] for c in columns[index]]
        if not expected or not values or None in values:
            continue
        gap = (sum(values) - expected) / expected
        if abs(gap) > 0.005:
            amounts = "" if not report.with_examples else f" ({sum(values):,.0f} contre {expected:,.0f})".replace(",", " ")
            percent = f"{abs(gap) * 100:.1f}".replace(".", ",")
            report.check.append(
                f"« {header} » : la somme des lignes diffère de la ligne de total de {percent} %{amounts}. "
                "Des territoires manquent ou sont en double, ou le total couvre un autre champ : à vérifier avant de citer un chiffre."
            )


def check_codes(header, filled, report):
    digit_codes = [c for c in filled if c.isdigit()]
    if digit_codes:
        lengths = [len(c) for c in digit_codes]
        usual = max(set(lengths), key=lengths.count)
        short = [c for c in digit_codes if len(c) < usual]
        if short:
            report.fix.append(
                f"« {header} » : {len(short)} code(s) plus courts que les autres{report.example(short)}. "
                "Un tableur a sans doute retiré les zéros de tête : `1` au lieu de `01`. Formater la colonne en texte et rétablir les codes."
            )
    duplicates = len(filled) - len(set(filled))
    if duplicates:
        report.fix.append(
            f"« {header} » : {duplicates} code(s) répétés. Une ligne par territoire et par année ? Khartis ne garderait que la première : "
            "passer à une colonne par année, ou filtrer une année."
        )
    report.ok.append(f"« {header} » ressemble à une colonne de codes géographiques : la jointure s'y fera sans ambiguïté.")


def check_numbers(header, unit, thousands, secret, other, report):
    if unit:
        report.fix.append(f"« {header} » : {len(unit)} nombre(s) écrits avec une unité{report.example(unit)}. Retirer l'unité des cellules et la mettre dans le nom de la colonne.")
    if thousands:
        report.fix.append(f"« {header} » : {len(thousands)} nombre(s) avec un séparateur de milliers{report.example(thousands)}. Le retirer, ou choisir « Espace » dans les Options CSV de Khartis.")
    if secret:
        report.fix.append(
            f"« {header} » : {len(secret)} cellule(s) codées comme secret ou non disponible{report.example(secret)}. Khartis ne les reconnaît pas comme manquantes "
            "et lirait toute la colonne comme du texte : les vider."
        )
    if other:
        report.check.append(f"« {header} » : {len(other)} cellule(s) non numériques{report.example(other)}.")
    if is_ratio(header):
        report.ok.append(f"« {header} » : Khartis devrait la lire comme un ratio (taux, part, moyenne), à représenter en aplats de couleur.")
    elif set(plain(header).split()) & STOCK_WORDS:
        report.ok.append(f"« {header} » : Khartis devrait la lire comme un effectif, à représenter en symboles proportionnels.")
    elif re.fullmatch(r"\d{4}", plain(header)):
        report.ok.append(f"« {header} » : une colonne par année, prête pour une collection de cartes.")
    else:
        report.check.append(
            f"« {header} » : rien dans le nom ne dit si c'est un taux ou un effectif. Le préciser, par exemple « Taux de … (%) » ou « Nombre de … »."
        )


def check_text(header, filled, report):
    obsolete = [c for c in filled if region_key(c) in OBSOLETE_REGIONS]
    if obsolete:
        report.fix.append(
            f"« {header} » : {len(obsolete)} ancienne(s) région(s) d'avant 2016{report.example(obsolete)}. Le fond de carte de Khartis n'a que les régions actuelles : "
            "regrouper le tableau avec scripts/regrouper_regions.py, qui additionne les effectifs et recalcule les taux."
        )
    duplicates = len(filled) - len(set(filled))
    if duplicates and len(set(filled)) > 0.5 * len(filled):
        report.check.append(f"« {header} » : {duplicates} valeur(s) répétées. Si c'est la colonne des territoires, une ligne par territoire et par année ?")


def check_column(header, cells, report):
    filled = [c.strip() for c in cells if c.strip() not in KHARTIS_NULL_TOKENS]
    if not filled:
        report.check.append(f"La colonne « {header} » est vide.")
        return
    numbers, unit, thousands, secret, other = [], [], [], [], []
    for c in filled:
        value, problem = classify(c)
        if value is not None:
            numbers.append(value)
        elif problem == UNIT:
            unit.append(c)
        elif problem == THOUSANDS:
            thousands.append(c)
        elif c.lower() in SECRET_TOKENS:
            secret.append(c)
        else:
            other.append(c)
    numeric_like = len(numbers) + len(unit) + len(thousands)
    code_like = all(re.fullmatch(r"\d{1,2}[AB]?\d{0,3}|[A-Z]{2,3}|[A-Z]{2}[0-9A-Z]{1,3}", c) for c in filled)
    if code_like and (set(plain(header).split()) & GEO_WORDS or numeric_like != len(filled)):
        check_codes(header, filled, report)
    elif numeric_like >= 0.5 * len(filled):
        check_numbers(header, unit, thousands, secret, other, report)
    else:
        check_text(header, filled, report)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("fichier")
    parser.add_argument("--sans-exemples", action="store_true", help="n'affiche aucun contenu de cellule")
    args = parser.parse_args()
    path = Path(args.fichier)
    report = Report(with_examples=not args.sans_exemples)

    if path.suffix.lower() in UNSUPPORTED:
        print(f"Khartis n'importe pas les fichiers {path.suffix} : les enregistrer en CSV (UTF-8) depuis le tableur, ou copier les cellules et les coller dans Khartis.")
        return
    if path.stat().st_size > MAX_BYTES:
        report.fix.append("Le fichier dépasse 200 Mo, la limite de Khartis : filtrer les lignes ou les colonnes utiles.")
    headers, body, delimiter, utf8 = read_table(path)
    if not utf8:
        report.fix.append("Le fichier n'est pas en UTF-8 : les accents s'afficheraient mal. Le réenregistrer en CSV UTF-8.")
    if not body:
        print("Le tableau a moins de deux lignes : rien à cartographier.")
        return

    check_layout(headers, body, delimiter, report)
    labels = [total_label(r) for r in body]
    totals = [r for r, label in zip(body, labels) if label]
    if totals:
        report.fix.append(
            f"{len(totals)} ligne(s) de total{report.example([l for l in labels if l])} : les retirer, Khartis les prendrait pour des territoires."
        )
        body = [r for r, label in zip(body, labels) if not label]
    columns = [[r[i] if i < len(r) else "" for r in body] for i in range(len(headers))]
    if totals:
        check_total(headers, totals[0], columns, report)
    for index, header in enumerate(headers):
        check_column(header, columns[index] if index < len(columns) else [], report)
    report.print()


if __name__ == "__main__":
    main()
