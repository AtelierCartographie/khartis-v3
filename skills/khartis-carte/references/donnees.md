# Préparer les données pour Khartis

La plupart des cartes ratées le sont dès le tableau : une ligne de total cartographiée comme un territoire, un code `1` qui ne retrouve pas le département `01`, un `7,1 %` lu comme du texte. Ce fichier sert à repérer ces problèmes avant l'import, et à les expliquer à l'utilisateur.

## Sommaire

- Ce que Khartis accepte
- La forme du tableau
- Les colonnes géographiques et les codes officiels
- Les valeurs : nombres, unités, valeurs manquantes
- Une ligne par territoire et par année
- Les territoires qui ont changé : millésimes et fusions
- Trouver des données publiques
- Ce qui se règle dans Khartis après l'import

## Ce que Khartis accepte

- Tableaux : CSV, TSV, TXT et Parquet. On peut aussi coller un tableau copié depuis un tableur, ou donner le lien d'un fichier en ligne.
- Fichiers géographiques : GeoJSON (ou JSON), Shapefile (`.shp` avec ses `.shx` et `.dbf`), GeoPackage, GeoParquet, KML ou KMZ, GPX, et ZIP qui les contient.
- Pas de fichier Excel (`.xlsx`, `.xls`) ni OpenDocument (`.ods`) : les enregistrer en CSV (UTF-8) depuis le tableur, ou copier les cellules et les coller dans Khartis.
- Limites : 200 Mo au total, 20 fichiers, un million de lignes.

Un fichier mal décodé (accents remplacés par des symboles) a été enregistré dans un autre encodage que UTF-8 : le réenregistrer en UTF-8.

## La forme du tableau

Khartis attend un tableau simple :

- une ligne d'en-têtes, puis une ligne par territoire ;
- pas de cellules fusionnées, de titres au-dessus du tableau, de notes en dessous ;
- pas de ligne « Total », « Ensemble », « France entière » ou « France métropolitaine » : Khartis la prendrait pour un territoire inconnu, ou fausserait les classes ;
- des noms de colonnes courts et explicites, l'unité entre parenthèses : `Taux de chômage (%)`, `Nombre de demandeurs d'emploi`.

Les mots du nom de colonne aident Khartis à reconnaître ce qu'elle mesure. « Taux », « part », « pour », « %», « densité », « moyenne », « médiane » ou « indice » signalent un taux. « Nombre », « nb », « population », « total », « effectif », « montant » ou « superficie » signalent un effectif. Un nom ambigu, comme `valeur` ou `2024`, laisse le moteur deviner d'après les chiffres seuls.

## Les colonnes géographiques et les codes officiels

Khartis relie le tableau à un fond de carte par une colonne de noms ou de codes. Les codes sont plus sûrs que les noms : ils ne dépendent ni de l'orthographe, ni des accents, ni de la langue.

| Niveau              | Code conseillé                                                          | Piège fréquent                                                    |
| ------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Régions françaises  | code INSEE sur deux chiffres (`84`, `11`, `01` à `06` pour l'outre-mer) | anciennes régions d'avant 2016                                    |
| Départements        | code INSEE (`01`, `2A`, `2B`, `971` à `976`)                            | zéro de tête perdu (`1` au lieu de `01`), Corse en `20`           |
| Communes            | code INSEE sur cinq caractères (`01001`, `2A004`)                       | zéro de tête perdu (`1001`), code postal à la place du code INSEE |
| EPCI                | numéro SIREN sur neuf chiffres                                          | nom de l'intercommunalité qui change                              |
| Pays                | code ISO 3166 à trois lettres (`FRA`, `DEU`)                            | anciens États (URSS, Yougoslavie), sans équivalent actuel         |
| Régions européennes | code NUTS (`FRK2`, `DE21`) de la bonne version                          | NUTS 2021 et NUTS 2024 diffèrent                                  |

Un tableur supprime les zéros de tête quand il lit une colonne de codes comme des nombres. Il faut alors formater la colonne en texte avant de saisir ou d'importer les codes.

Quand il n'y a que des noms, Khartis les rapproche malgré les accents, la casse et les fautes légères. Il connaît aussi les noms des pays en quatre langues et leurs codes. Restent non reconnus les sigles (`PACA`, `IDF`), les noms dans d'autres alphabets et les anciennes entités.

Pour des points (adresses, établissements), Khartis lit des colonnes de latitude et de longitude en degrés décimaux : `48.8566`, `2.3522`. Il ne géocode pas les adresses. Un service public comme la Base adresse nationale le fait ; un modèle de langue le fait mal.

## Les valeurs : nombres, unités, valeurs manquantes

- Un nombre par cellule, sans unité, sans espace ni point de milliers : `12395000` et non `12 395 000` ou `12.395.000`.
- Virgule ou point décimal, mais le même partout. Khartis le détecte, et les « Options CSV » permettent de le corriger.
- Pour une valeur manquante, une cellule vide. Khartis reconnaît aussi `NA`, `N/A`, `#N/A`, `-`, `:` ou `...`, mais pas `s` (secret statistique), `nd`, `n.d.`, `c` ou `secret`. Avec l'une de ces valeurs, la colonne entière est lue comme du texte.
- Un pourcentage se note `7,1` dans une colonne `(%)`, ou `0,071` dans une colonne de part : jamais `7,1 %`.

## Une ligne par territoire et par année

Beaucoup de tableaux publics ont une ligne par territoire et par année : `Bretagne;2019;…` puis `Bretagne;2024;…`. Khartis classe alors ces lignes « répétées » et ne garde que la première. Deux solutions :

- **une colonne par année** (`Taux 2019`, `Taux 2024`), en passant par un tableau croisé dynamique du tableur. On peut alors cartographier une année, calculer l'évolution avec la calculatrice de Khartis, ou faire une collection de cartes, une par année ;
- **filtrer une seule année** avant l'import, si une seule compte.

## Les territoires qui ont changé : millésimes et fusions

Le fond de carte doit être du même millésime que les données.

- Régions françaises : un seul découpage, celui en vigueur depuis 2016. Les anciennes régions (Rhône-Alpes, Aquitaine, Languedoc-Roussillon, Nord-Pas-de-Calais…) n'y figurent pas.
- Communes : fonds 2023, 2024, 2025 et 2026. Des communes fusionnent chaque année : un tableau ancien sur un fond récent laisse des communes non reconnues.
- Régions européennes : NUTS 2021 et NUTS 2024.

Pour des données sur d'anciennes régions, on regroupe les lignes dans les régions actuelles avant l'import :

- les effectifs s'additionnent : naissances de l'Auvergne et de Rhône-Alpes pour Auvergne-Rhône-Alpes ;
- un taux ne s'additionne pas et ne se moyenne pas : on le recalcule à partir des effectifs regroupés. Par exemple, la somme des naissances divisée par la somme des populations. Une moyenne des taux donnerait le même poids à une petite région qu'à une grande ;
- si une ancienne région a été coupée entre deux régions actuelles, ce qui est rare, ou s'il manque les effectifs pour recalculer, dis-le plutôt que d'improviser.

Ne rattache jamais une ancienne région seule à sa région actuelle dans la jointure : la carte attribuerait à toute la région les chiffres d'une partie.

## Trouver des données publiques

- Privilégie les producteurs officiels : l'Insee pour la France, Eurostat pour l'Europe, la Banque mondiale ou les agences de l'ONU pour le monde. data.gouv.fr rassemble les données publiques françaises.
- Donne à l'utilisateur le lien du fichier (CSV) plutôt que de recopier les valeurs. Khartis l'importe par son champ « Lien vers un fichier stocké en ligne », et aucune valeur ne passe par toi.
- Vérifie avec lui le millésime, le niveau géographique, l'unité et la licence, et note la source exacte : organisme, nom du jeu de données, année.
- Si tu disposes du serveur MCP de data.gouv.fr, utilise-le pour chercher des jeux de données, en rappelant qu'il est expérimental. Ne recherche jamais avec les données de l'utilisateur.

## Ce qui se règle dans Khartis après l'import

À l'étape Données, Khartis permet aussi de :

- changer le type d'une colonne : en nombre, les valeurs non convertibles deviennent vides ;
- renommer, masquer ou supprimer une colonne, nettoyer la casse et les espaces ;
- rechercher et remplacer, filtrer ou supprimer des lignes, revenir aux données d'origine ;
- calculer une colonne avec la calculatrice, par exemple `"naissances" / "population" * 1000` pour un taux de natalité. Les noms de colonnes sont ceux que Khartis affiche, sans accents ni espaces, et le calcul se teste sur une ligne avant d'être ajouté.

Mieux vaut corriger le fichier source quand la carte sera refaite. Les corrections faites dans Khartis restent dans le projet, pas dans le fichier.
