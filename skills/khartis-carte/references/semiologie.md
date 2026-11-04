# Sémiologie : choisir et régler la représentation

L'Atelier de cartographie de Sciences Po s'appuie sur la sémiologie graphique de Jacques Bertin : chaque variable visuelle (taille, valeur, couleur, forme) convient à un type de donnée, et une carte juste est une carte où le lecteur ne peut pas se tromper. Khartis applique ces règles dans ses suggestions ; ce fichier sert à les expliquer et à trancher les cas où plusieurs choix se défendent.

## Sommaire

- Quelle représentation pour quelle donnée
- Les classes : méthode et nombre
- Les couleurs
- La projection
- Comparer plusieurs cartes
- Les valeurs manquantes et les petits territoires

## Quelle représentation pour quelle donnée

| La colonne contient                                              | Représentation dans Khartis                                                          | Pourquoi                                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| un effectif ou un stock (population, naissances, emplois, euros) | symboles proportionnels, dont la surface suit la valeur                              | la taille dit « combien » ; un aplat ferait paraître plus fort ce qui est seulement plus grand |
| un taux, une part, une densité, une moyenne, un indice           | aplats en classes : la choroplèthe                                                   | la valeur (du clair au foncé) dit « plus ou moins », indépendamment de la surface              |
| une évolution ou un écart qui passe par zéro                     | aplats en classes avec une valeur de rupture à zéro, palette divergente              | les deux teintes séparent les hausses des baisses                                              |
| une catégorie sans ordre (type de commune, parti en tête)        | une couleur par modalité                                                             | la couleur distingue sans hiérarchiser                                                         |
| une catégorie ordonnée (petit, moyen, grand)                     | une palette ordonnée, du clair au foncé                                              | l'ordre doit se lire                                                                           |
| un effectif et un taux du même territoire                        | symboles proportionnels colorés : la taille pour l'effectif, la couleur pour le taux | deux variables visuelles différentes pour deux informations                                    |
| un effectif qu'on veut montrer réparti dans l'espace             | densité de points                                                                    | chaque point vaut une quantité fixe                                                            |
| des points (établissements, stations) avec une valeur            | symboles proportionnels ou en classes, sur fond OpenStreetMap si besoin              | même logique que pour les territoires                                                          |
| des lignes (routes, flux de comptage)                            | épaisseur proportionnelle, couleur en classes                                        | l'épaisseur dit la quantité                                                                    |

Quand la question porte sur un effectif mais que les territoires sont très inégaux, propose aussi le taux correspondant : « où vivent les chômeurs » et « où le chômage est le plus fort » ne donnent pas la même carte. Un taux se calcule avec la calculatrice de Khartis si le tableau a le numérateur et le dénominateur.

Les suggestions de Khartis sont rangées par score, mais le score ne connaît pas la question de l'utilisateur. Une carte de symboles proportionnels de la population arrive souvent en tête, alors que la question porte sur un taux. Choisis la suggestion qui répond à la question et dis pourquoi.

## Les classes : méthode et nombre

Une choroplèthe regroupe les valeurs en classes ; la méthode détermine où passent les bornes. Khartis les calcule ; ton rôle est de choisir la méthode et le nombre de classes avec l'utilisateur.

| Méthode dans Khartis      | Ce qu'elle fait                                | À choisir quand                                                                                               |
| ------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Quantiles                 | autant de territoires dans chaque classe       | on compare des rangs : « le quart des départements où le taux est le plus fort »                              |
| K-means (seuils naturels) | regroupe les valeurs proches                   | la distribution a des groupes ; c'est souvent le choix par défaut                                             |
| Intervalles égaux         | des classes de même amplitude                  | les valeurs sont réparties régulièrement, ou les bornes doivent être rondes                                   |
| Q6                        | des quantiles qui isolent les extrêmes         | on veut faire ressortir les valeurs les plus fortes et les plus faibles                                       |
| Moyennes emboîtées        | des classes autour de la moyenne               | la référence à la moyenne compte ; c'est la moyenne simple des territoires, pas la moyenne nationale pondérée |
| Head/Tail                 | sépare la queue d'une distribution très étirée | beaucoup de petites valeurs et quelques très grandes                                                          |
| Manuel                    | des bornes choisies par l'utilisateur          | des seuils ont un sens (seuil de pauvreté, objectif réglementaire)                                            |

- De 4 à 7 classes : au-delà, les teintes voisines se confondent ; en deçà, la carte perd de l'information.
- Avec peu de territoires (une dizaine de régions), 4 ou 5 classes suffisent : chaque classe doit compter plusieurs territoires.
- Une classe vide est un défaut : réduire le nombre de classes ou changer de méthode.
- La valeur de rupture (zéro, moyenne nationale) se règle dans Khartis ; elle rend la palette divergente.

## Les couleurs

- **Séquentielle** pour des valeurs ordonnées, du clair (peu) au foncé (beaucoup).
- **Divergente** seulement autour d'une valeur de rupture qui a un sens. Sans rupture, deux teintes opposées font croire à deux phénomènes contraires.
- **Qualitative** pour des catégories sans ordre : des teintes distinctes de même intensité.
- **Adaptée aux daltoniens** de préférence. Dans Khartis, ce sont les palettes de Wong et de Tol (« Bleu (Wong) », « Bleu / Rouge (Tol) »…) et la suggestion « Daltonisme ». L'outil « Déficiences visuelles » de l'étape Habillage simule huit déficiences de la vision des couleurs ; la simulation ne s'applique pas à l'export.
- **Motifs** (trames) quand la carte sera imprimée en noir et blanc.
- Un sens intuitif : le foncé pour le « plus », le rouge pour ce qui inquiète. Une palette se retourne si le sens est contre-intuitif, par exemple pour un taux de réussite.

## La projection

- Une choroplèthe se dessine sur une projection qui respecte les surfaces, puisque le lecteur compare des surfaces colorées : Equal Earth pour le monde, par exemple. Khartis signale les projections équivalentes parmi ses suggestions.
- Pour la France, la projection officielle Lambert-93 est conforme : elle garde les angles, pas les surfaces. Sur la métropole, elle les déforme de moins de 1 %, ce qui suffit pour une choroplèthe ; ne la présente pas comme une projection équivalente. Khartis place les territoires d'outre-mer en cartons.
- Le Web Mercator des fonds de rues agrandit les hautes latitudes : à éviter pour comparer des pays, acceptable pour une ville.

## Comparer plusieurs cartes

Pour comparer des années ou des variables, la collection de cartes de Khartis dessine une petite carte par variable. Il faut alors une **légende commune**, avec les mêmes classes et les mêmes couleurs sur toutes les cartes. Sinon le même foncé ne veut pas dire la même chose d'une carte à l'autre, et la comparaison trompe. Des classes propres à chaque carte se justifient seulement pour comparer des répartitions, et la légende doit le dire.

## Les valeurs manquantes et les petits territoires

- Un territoire sans valeur doit se distinguer d'un territoire à valeur faible : une couleur neutre (gris clair), et une note de légende qui dit pourquoi la valeur manque. Khartis permet de montrer les valeurs manquantes avec leur propre style.
- Un territoire non relié au tableau, pour cause d'entité non reconnue, n'est pas une valeur manquante : il faut corriger la jointure.
- Les petits territoires (outre-mer, Paris) se lisent mal en aplat : vérifier qu'ils sont visibles dans leur carton, ou compléter par des étiquettes.
