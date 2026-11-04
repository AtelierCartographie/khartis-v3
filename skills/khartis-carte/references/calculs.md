# Calculer un indicateur pour la carte

Une choroplèthe montre un rapport : un taux, une part, une densité, un écart. Quand le tableau n'a que des effectifs, on construit ce rapport avec la calculatrice de Khartis (étape Données), qui accepte les expressions de DuckDB. Ce fichier donne les formules justes, les expressions à copier et les pièges qui produisent une carte fausse sans le moindre message d'erreur.

## Sommaire

- Écrire une expression dans la calculatrice
- Les indicateurs courants
- Comparer au territoire de référence
- Les pièges
- Les petits effectifs
- Un exemple complet

## Écrire une expression dans la calculatrice

- Les colonnes s'écrivent entre guillemets doubles, avec le nom que Khartis affiche : sans accents, en minuscules, les espaces remplacés par `_`. `Demandeurs d'emploi` devient `"demandeurs_demploi"`.
- La division donne un nombre décimal ; `round(x, 1)` arrondit à une décimale. Arrondis seulement le résultat final, jamais les étapes.
- `sum("x") OVER ()` vaut la somme de la colonne sur tout le tableau. Elle sert à calculer une moyenne de référence ligne par ligne.
- Khartis teste l'expression sur la première ligne avant de l'ajouter. Vérifie le résultat sur un territoire dont tu connais l'ordre de grandeur.

## Les indicateurs courants

| Indicateur                      | Formule                                  | Expression dans Khartis                               | Unité    |
| ------------------------------- | ---------------------------------------- | ----------------------------------------------------- | -------- |
| Part                            | sous-effectif ÷ effectif × 100           | `"cadres" / "actifs" * 100`                           | %        |
| Taux pour mille                 | événements ÷ population × 1 000          | `"naissances" / "population" * 1000`                  | ‰        |
| Densité                         | population ÷ superficie                  | `"population" / "superficie_km2"`                     | hab./km² |
| Évolution d'un taux             | taux final − taux initial                | `"taux_2024" - "taux_2019"`                           | points   |
| Taux de variation d'un effectif | (final − initial) ÷ initial × 100        | `("pop_2024" - "pop_2019") / "pop_2019" * 100`        | %        |
| Taux de croissance annuel moyen | ((final ÷ initial)^(1/années) − 1) × 100 | `(power("pop_2024" / "pop_2019", 1.0 / 5) - 1) * 100` | % par an |
| Indice base 100                 | final ÷ initial × 100                    | `"valeur_2024" / "valeur_2019" * 100`                 | base 100 |

- Une densité demande la superficie dans le tableau, en km². Khartis ne la tire pas du fond de carte.
- Pour le taux de croissance annuel moyen, l'exposant est un sur le nombre d'années écoulées : 5 de 2019 à 2024, pas 6.
- L'évolution d'un taux se dit en points : un taux qui passe de 40 % à 45 % gagne 5 points. En pourcentage, il gagne 12,5 %. Ce ne sont pas les mêmes cartes ; le titre de la légende doit dire laquelle.

## Comparer au territoire de référence

Pour montrer où un taux est au-dessus ou en dessous de la moyenne nationale, il faut la moyenne pondérée, celle de l'ensemble du pays. Ce n'est pas la moyenne des taux des territoires : une région de 300 000 habitants pèserait autant qu'une région de 12 millions.

| Indicateur                                       | Expression dans Khartis                                                                           | Valeur de rupture |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ----------------- |
| Taux de référence (pondéré)                      | `sum("chomeurs") OVER () / sum("actifs") OVER () * 100`                                           | sans objet        |
| Écart au taux de référence, en points            | `"chomeurs" / "actifs" * 100 - sum("chomeurs") OVER () / sum("actifs") OVER () * 100`             | 0                 |
| Indice de spécificité (quotient de localisation) | `("emplois_industrie" / "emplois") / (sum("emplois_industrie") OVER () / sum("emplois") OVER ())` | 1                 |

- L'écart se cartographie en aplats avec une palette divergente et une valeur de rupture à 0 : une teinte pour « au-dessus », une pour « en dessous ».
- L'indice de spécificité vaut 1 quand le territoire ressemble au pays, 2 quand l'activité y est deux fois plus présente. Sa valeur de rupture est 1.
- Le taux de référence doit couvrir le même champ que les territoires cartographiés. La France métropolitaine n'est pas la France entière : si les départements d'outre-mer sont dans le tableau, ils entrent dans la somme.

## Les pièges

- **Moyenner des taux.** Pour regrouper des territoires ou calculer une référence, on additionne les effectifs, puis on divise. La moyenne des taux est fausse dès que les tailles diffèrent. Une région de 1 million d'habitants à 8 ‰ et une région de 6 millions à 12 ‰ ont pour moyenne des taux 10 ‰, mais leur taux réel est (8 000 + 72 000) ÷ 7 000 000 = 11,4 ‰. Le script `scripts/regrouper_regions.py` fait ce calcul pour les anciennes régions.
- **Une ligne de total dans le tableau.** `sum(...) OVER ()` l'additionnerait aux territoires et doublerait la référence. Retirer les lignes « Total » ou « France entière » avant le calcul.
- **Multiplier deux fois par 100.** Une colonne déjà en pourcentage (`7,1`) ne se multiplie pas par 100 dans une évolution : `"taux_2024" - "taux_2019"` donne des points. Un assistant qui écrit `("taux_2024" - "taux_2019") * 100` transforme 0,5 point en 50.
- **Une part dans le total national.** `"x" / sum("x") OVER () * 100` dépend de la taille du territoire, comme un effectif. Elle se représente en symboles proportionnels, pas en aplats.
- **Diviser par zéro.** Un dénominateur nul donne une valeur vide ou infinie : la vérifier dans le tableau avant la carte.

## Les petits effectifs

Un taux calculé sur un petit dénominateur varie beaucoup par hasard. Une commune de 80 habitants avec deux naissances affiche un taux de natalité de 25 ‰, une autre en a zéro. Une carte des communes peut alors montrer surtout le bruit des petites communes. Quelques réponses :

- passer à un niveau plus agrégé (intercommunalité, département) ;
- regrouper plusieurs années au numérateur et au dénominateur ;
- signaler ou filtrer les territoires sous un seuil de population, avec le filtre de la visualisation, et le dire en note de légende ;
- pour les données de l'Insee, respecter le secret statistique, qui masque déjà les plus petits effectifs.

## Un exemple complet

Un tableau des régions donne `Demandeurs d'emploi` et `Population active`, et l'utilisateur veut savoir où le chômage est plus fort que la moyenne.

1. Calculer le taux : `"demandeurs_demploi" / "population_active" * 100`, nommé `taux_de_chomage`.
2. Calculer l'écart à la référence : `"demandeurs_demploi" / "population_active" * 100 - sum("demandeurs_demploi") OVER () / sum("population_active") OVER () * 100`, nommé `ecart_au_taux_national`.
3. Cartographier `ecart_au_taux_national` en aplats, avec une valeur de rupture à 0, une palette divergente adaptée aux daltoniens, comme « Bleu / Rouge (Tol) », et une légende titrée « Écart au taux national, en points ».
4. Écrire la référence dans la note de légende : « Taux national : … % ». Lis-le dans Khartis plutôt que de le calculer de tête.
5. Pour choisir les classes, lancer `scripts/analyser_distribution.py` sur la colonne exportée, si le tableau est sur le poste. Sinon, suivre `references/semiologie.md`.
