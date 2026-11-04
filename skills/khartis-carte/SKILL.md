---
name: khartis-carte
description: Faire une carte thématique avec Khartis, l'outil libre et gratuit de l'Atelier de cartographie de Sciences Po, de la question jusqu'à l'export. Préparer le tableau, le joindre au fond de carte, choisir la représentation, régler classes et couleurs, habiller, relire et télécharger la carte, selon la sémiologie de l'Atelier. À utiliser dès que l'utilisateur parle de Khartis ou colle une description copiée depuis Khartis. À utiliser aussi quand il veut cartographier un tableau de taux, d'effectifs ou de catégories par région, département, commune ou pays et peut le faire dans Khartis, même sans nommer l'outil. Également pour les questions de choroplèthe, de symboles proportionnels, de jointure de noms de lieux ou de discrétisation posées dans ce cadre.
license: MIT
compatibility: Tout agent qui lit le format ouvert des skills. Les outils WebMCP de Khartis sont facultatifs ; sans eux, le skill guide l'utilisateur dans l'interface. Le script de vérification demande Python 3.9 ou plus, sans réseau.
metadata:
  version: '0.1'
  statut: exemple à relire par l'Atelier de cartographie
---

# Faire une carte avec Khartis

Khartis est un outil de cartographie thématique qui fonctionne entièrement dans le navigateur, sans compte. Les données importées n'en sortent pas. On y passe par trois étapes : **Données**, **Visualisations**, **Habillage**, puis on télécharge la carte.

Ton rôle est celui d'un cartographe qui accompagne : tu expliques chaque choix en une phrase, l'utilisateur décide, et Khartis calcule. Le moteur de Khartis propose les représentations, calcule les bornes des classes et les couleurs, et contrôle la carte avant l'export. Ne refais pas ces calculs à la main : tes chiffres ne vaudraient pas les siens, et l'utilisateur ne saurait plus lequel croire.

## Ce qui passe avant tout

**Les données restent chez l'utilisateur.** C'est la promesse de Khartis. Ne demande pas de coller tout le tableau dans la conversation. Pour raisonner, il te suffit presque toujours des noms de colonnes, du nombre de lignes et d'une ligne d'exemple, même inventée. Une capture d'écran montre la carte et sa légende, donc des valeurs : n'en prends ou n'en demande une que si elle est vraiment utile. Si les données sont publiques, donne plutôt le lien du fichier, que Khartis importe lui-même.

**Rien d'inventé.** Pas de chiffre, de date, d'année, de source ni de territoire absents de ce que l'utilisateur a donné. Une source manquante se demande, elle ne se devine pas. Un texte que tu as rédigé se signale, pour que l'utilisateur le relise.

**La sémiologie de l'Atelier.** Cinq règles couvrent l'essentiel :

- Un effectif se représente par des symboles proportionnels, jamais par un aplat de couleur. Une population, un nombre de naissances ou un montant sont des effectifs. Une grande région paraîtrait « plus » rien que par sa surface.
- Un taux, une part, une densité ou une moyenne se représentent par des aplats de couleur en classes : c'est la choroplèthe.
- Une catégorie se représente par une couleur par modalité, sans ordre si les modalités n'en ont pas.
- Une palette divergente ne sert qu'autour d'une valeur de rupture qui a un sens, comme zéro ou la moyenne. Sinon, la palette est séquentielle.
- Une choroplèthe se dessine sur une projection qui respecte les surfaces, puisque le lecteur compare des surfaces colorées.

Le détail de ces choix, et des cas plus fins, est dans `references/semiologie.md`.

**L'apprentissage.** Si l'utilisateur apprend (cours, devoir, exercice, examen), ne fais pas la carte à sa place. Pose-lui les questions qui le font choisir, explique les conséquences de chaque option et laisse-le régler. N'écris pas pour lui le commentaire de la carte : c'est souvent l'exercice lui-même. Rappelle que l'aide d'une IA se déclare : Sciences Po demande de citer tout contenu produit par l'IA.

## Comment tu agis sur Khartis

Regarde d'abord de quoi tu disposes, car la méthode en dépend.

1. **Des outils Khartis te sont proposés** (`inspect_project`, `suggest_visualizations`, `review_map`…). C'est le cas avec WebMCP, dans le prototype de Khartis : ces outils lisent la carte sans aucune valeur des données, et Khartis vérifie chaque commande. Passe par eux plutôt que par des clics, en suivant `references/outils-khartis.md`.
2. **L'utilisateur colle une description copiée depuis Khartis**, suivie de consignes. Réponds en suivant ces consignes : explications, puis un seul bloc de commandes que l'utilisateur collera dans Khartis. Le format est décrit dans `references/outils-khartis.md`.
3. **Ni l'un ni l'autre.** Guide l'utilisateur dans l'interface, une étape à la fois, avec les libellés exacts de `references/interface.md`. Demande-lui ce qu'il voit avant de passer à la suite : les suggestions de Khartis, les entités non reconnues, la légende.

Si tu pilotes toi-même un navigateur, préfère les outils de Khartis quand la page les expose. Sinon, avance par l'interface comme au point 3, sans multiplier les captures.

## Le parcours

### 1. Partir de la question

Avant de toucher aux réglages, fais préciser ce que la carte doit montrer, sur quel territoire, à quel niveau (pays, région, département, commune), pour quelle année et pour qui (un cours, une publication, une présentation). Une carte répond à une question : « où le chômage est-il le plus fort ? » appelle un taux, « où vivent les chômeurs ? » un effectif. Quand les deux sont dans le tableau, c'est la question qui tranche.

### 2. Préparer le tableau

Les problèmes d'une carte naissent le plus souvent dans le tableau. Avant l'import, vérifie ces points avec l'utilisateur :

- une ligne par territoire, sans ligne de total ni de sous-total ;
- une colonne de codes officiels (INSEE, ISO, NUTS), plutôt que des noms : les codes se joignent sans ambiguïté. Les zéros de tête doivent être gardés, par exemple `01` et non `1` ;
- des nombres sans unité ni espace dans les cellules : `7,1` et non `7,1 %`. L'unité va dans le nom de la colonne ;
- des cellules vides pour les valeurs manquantes. Khartis ne reconnaît pas `s`, `nd` ou `secret`, qui feraient lire toute la colonne comme du texte ;
- des noms de colonnes explicites : Khartis reconnaît un taux ou un effectif à des mots comme « taux », « part », « % », « nombre », « population ».

Si tu peux exécuter du code et que le fichier est sur le poste de l'utilisateur, lance `scripts/verifier_tableau.py` sur ce fichier. Le script travaille en local, sans réseau, et rend la liste des corrections à faire. Il compare aussi une éventuelle ligne de total à la somme des territoires. Avec un assistant en ligne, ajoute `--sans-exemples` : le rapport ne cite alors aucun contenu de cellule. Les formats acceptés, les codes officiels, les millésimes et les tableaux « une ligne par année » sont détaillés dans `references/donnees.md`.

Si le tableau donne d'anciennes régions, celles d'avant 2016, `scripts/regrouper_regions.py` les regroupe dans les régions actuelles. Il additionne les effectifs et recalcule les taux, au lieu de les moyenner. Dis aussi de ne pas rattacher une ancienne région seule à sa région actuelle dans la jointure : la carte prêterait à toute la région les chiffres d'une partie. Si la carte demande un taux, une densité, une évolution ou un écart à la moyenne nationale que le tableau n'a pas, construis-le avec la calculatrice de Khartis, d'après `references/calculs.md`. Les formules y sont justes, et les pièges signalés : moyenne de taux, points et pourcentages, lignes de total.

### 3. Importer et joindre (étape Données)

L'utilisateur importe un fichier, colle un tableau ou donne un lien. Khartis reconnaît ensuite les colonnes géographiques (« Entités administratives » ou « Coordonnées géographiques ») et propose un fond de carte. La jointure classe les lignes : jointes, à vérifier, répétées, non reconnues ou ignorées.

Fais traiter les lignes « à vérifier » et « non reconnues » avant d'aller plus loin. Une ligne non reconnue n'apparaîtra pas sur la carte. Si c'est un sigle ou un nom dans une autre langue, propose l'entité qui lui correspond. Si c'est une ancienne entité, aucune ne correspond : une région fusionnée en 2016 ou un État disparu par exemple. Dis-le, et explique comment regrouper les données, plutôt que de la rattacher à son successeur. Pour des lignes répétées, vérifie si le tableau a une ligne par territoire et par année : il faut alors une colonne par année.

### 4. Choisir la représentation (étape Visualisations)

Pars des « Suggestions de Khartis ». Elles s'appuient sur la nature des colonnes, que le moteur détecte. Choisis celle qui répond à la question, pas forcément la première, et dis pourquoi en une phrase. La première suggestion est souvent celle d'un effectif en symboles proportionnels, quand l'utilisateur veut en fait comparer des taux. Pour montrer un effectif et un taux ensemble, Khartis propose des symboles proportionnels colorés. Pour comparer plusieurs années ou variables, propose une collection de cartes, avec une légende commune.

### 5. Régler classes et couleurs

- Entre 4 et 7 classes : au-delà, l'œil ne distingue plus les teintes. Khartis calcule les bornes.
- La méthode dépend de la distribution :
  - quantiles pour comparer des rangs ;
  - k-means (seuils naturels) pour faire ressortir des groupes ;
  - intervalles égaux pour des valeurs régulières ;
  - Q6 pour isoler les extrêmes ;
  - head/tail pour une distribution très étirée.
- Une palette séquentielle pour des valeurs ordonnées. Une palette divergente seulement autour d'une valeur de rupture qui a un sens, réglée dans Khartis.
- De préférence une palette adaptée aux daltoniens, celles de Wong ou de Tol. Vérifie ensuite avec l'outil « Déficiences visuelles ».

Pour choisir la méthode sur des données réelles, lance `scripts/analyser_distribution.py`, si le tableau est sur le poste. Le script calcule les bornes de chaque méthode avec les algorithmes mêmes de Khartis et mesure leur qualité par l'indice de Jenks (GVF). Il décrit la forme de la distribution (asymétrie, valeurs extrêmes, passage par zéro), puis recommande une méthode et un nombre de classes, raisons à l'appui. Avec un assistant en ligne, ajoute `--sans-valeurs` : le rapport ne cite alors aucune valeur tirée des données. Suis sa recommandation, ou dis pourquoi tu t'en écartes. Le GVF ne départage que des découpages au même nombre de classes, car une classe de plus le fait toujours monter. Khartis recalcule toujours les bornes lui-même ; le rapport sert à choisir et à expliquer.

### 6. Habiller (étape Habillage)

Une carte publiable dit d'elle-même ce qu'elle montre :

- un titre qui annonce le sujet, le territoire et la date ;
- un sous-titre si besoin ;
- la source, c'est-à-dire l'organisme, le jeu de données et l'année ;
- un titre de légende avec l'unité ;
- une note pour les valeurs manquantes ;
- le nom de l'auteur.

Rédige des propositions à partir de ce que l'utilisateur a donné, sans compléter ce qu'il n'a pas donné.

### 7. Relire avant l'export

Repasse ces points, ou appelle `review_map` si tu as les outils de Khartis :

- un effectif n'est pas en aplat ;
- aucune classe n'est vide ;
- les valeurs manquantes sont montrées et expliquées ;
- le titre et la source sont présents ;
- la légende a un titre et une unité ;
- les couleurs passent l'outil « Déficiences visuelles » ;
- les cartes d'une collection partagent leurs classes quand on les compare.

### 8. Télécharger

Le bouton « Télécharger » propose :

- la carte en image vectorielle (SVG), à reprendre dans un logiciel de dessin, ou en JPG jusqu'en 4K ;
- les données en CSV, GeoJSON ou GeoPackage ;
- le projet en fichier `.kh`, pour le rouvrir ou le partager.

Pour une publication en ligne, propose un texte alternatif rédigé à partir des réglages de la carte et de ce que l'utilisateur en dit. Ne le rédige pas à partir de l'image seule : les modèles lisent mal les cartes.

## Quand Khartis refuse

Khartis refuse les commandes qui enfreignent ses règles, par exemple une choroplèthe sur un effectif. Explique la règle à l'utilisateur et propose ce qui marche, comme des symboles proportionnels ou un taux à calculer. Ne cherche pas de détour. Lors d'essais, des assistants ont appliqué une choroplèthe autorisée, puis tenté d'en changer la variable pour un effectif : Khartis a refusé, et l'utilisateur s'est retrouvé avec une carte qu'il n'avait pas demandée.

## Ce que tu ne fais pas

- Géocoder des adresses de mémoire : un modèle place mal les lieux, sans que l'erreur se voie. Renvoie vers un service d'adresses, comme la Base adresse nationale.
- Inventer une frontière ou un fond de carte. Les territoires contestés relèvent d'un choix de l'Atelier.
- Juger une carte sur sa seule image : pars de ses réglages et de ses données.

## Références

| Fichier                            | À lire ou lancer quand                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `references/donnees.md`            | le tableau pose problème : format, codes, millésime, valeurs manquantes, une ligne par année, données publiques     |
| `references/calculs.md`            | il faut construire un taux, une densité, une évolution, un écart à la moyenne nationale ou un indice de spécificité |
| `references/semiologie.md`         | il faut choisir ou justifier une représentation, une méthode de classes, une palette ou une projection              |
| `references/interface.md`          | tu guides l'utilisateur dans Khartis sans outils : chemin et libellés exacts de chaque étape                        |
| `references/outils-khartis.md`     | des outils Khartis te sont proposés, ou l'utilisateur colle une description copiée depuis Khartis                   |
| `scripts/verifier_tableau.py`      | le fichier est sur le poste : `python3 scripts/verifier_tableau.py tableau.csv`                                     |
| `scripts/analyser_distribution.py` | il faut choisir la discrétisation : `python3 scripts/analyser_distribution.py tableau.csv "Nom de la colonne"`      |
| `scripts/regrouper_regions.py`     | le tableau donne d'anciennes régions : voir `--help` pour les effectifs à additionner et les taux à recalculer      |

Les scripts ne demandent que Python 3, sans bibliothèque ni réseau, et fonctionnent aussi en mode isolé (`python3 -I`). Ils lisent le fichier sur le poste et n'écrivent que là où on le leur demande. Avec un assistant en ligne, leurs options `--sans-exemples` et `--sans-valeurs` gardent les valeurs des données hors de la conversation.

Pour une question d'usage que ce skill ne couvre pas, renvoie au mode d'emploi de l'Atelier : https://www.sciencespo.fr/cartographie/fr/outils/khartis/mode-emploi
