"""Lecture des tableaux et des nombres, partagée par les scripts du skill.

Python 3 seul, sans réseau. Les scripts l'importent depuis leur dossier, y
compris sous python -I.
"""

import csv
import io
import math
import re
import unicodedata
from pathlib import Path

# Valeurs que Khartis lit comme manquantes (NULL_VALUE_TOKENS).
KHARTIS_NULL_TOKENS = {
    "", ":", "-", "...", "null", "NULL", "NA", "N/A", "n/a", "#N/A", "NaN",
    "nil", "NIL", "none", "NONE", "None",
}


def plain(text):
    """Texte sans accents, en minuscules, réduit à ses mots séparés d'une espace."""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    return " ".join(re.findall(r"[a-z0-9]+", text))


def khartis_column_name(header):
    """Nom de colonne tel que Khartis l'affiche : sans accents, minuscules,
    apostrophes retirées, autres signes remplacés par « _ »."""
    text = unicodedata.normalize("NFKD", header)
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    text = re.sub(r"['’]", "", text)
    return re.sub(r"[^a-z0-9]+", "_", text).strip("_")


def read_table(path, column=None):
    """En-têtes, lignes non vides, séparateur, et si le fichier est bien en UTF-8.

    Avec `column`, chaque ligne ne garde que la cellule de cette colonne : un
    fichier de centaines de colonnes tient alors en mémoire.
    """
    raw = Path(path).read_bytes()
    try:
        text, utf8 = raw.decode("utf-8-sig"), True
    except UnicodeDecodeError:
        text, utf8 = raw.decode("latin-1"), False
    del raw
    sample = text[:20000]
    try:
        delimiter = csv.Sniffer().sniff(sample, delimiters=";,\t|").delimiter
    except csv.Error:
        delimiter = ";" if sample.count(";") >= sample.count(",") else ","
    # Comme DuckDB, un texte entre guillemets peut tenir sur plusieurs lignes.
    reader = csv.reader(io.StringIO(text, newline=""), delimiter=delimiter)
    rows = (r for r in reader if any(c.strip() for c in r))
    headers = next(rows, None)
    if headers is None:
        raise SystemExit("Le fichier est vide.")
    if column is None:
        return headers, list(rows), delimiter, utf8
    index = column_index(headers, column)
    return [headers[index]], [[r[index] if index < len(r) else ""] for r in rows], delimiter, utf8


def parse_number(cell):
    """Nombre écrit à la française ou à l'anglaise (`12 395,5`, `12,395.5`), ou None."""
    text = cell.strip().replace(" ", "").replace(" ", "").replace(" ", "")
    if re.fullmatch(r"[+-]?\d{1,3}(\.\d{3})+(,\d+)?", text):
        text = text.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"[+-]?\d{1,3}(,\d{3})+(\.\d+)?", text):
        text = text.replace(",", "")
    else:
        text = text.replace(",", ".")
    try:
        value = float(text)
    except ValueError:
        return None
    return value if math.isfinite(value) else None


def column_index(headers, wanted):
    """Index d'une colonne désignée par son en-tête, au mot près."""
    for index, header in enumerate(headers):
        if header.strip() == wanted.strip():
            return index
    for index, header in enumerate(headers):
        if plain(header) == plain(wanted) or khartis_column_name(header) == khartis_column_name(wanted):
            return index
    names = ", ".join(f"« {h} »" for h in headers)
    raise SystemExit(f"Colonne « {wanted} » introuvable. Colonnes : {names}.")
