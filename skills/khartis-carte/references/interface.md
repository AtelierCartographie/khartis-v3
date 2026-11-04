# Guider l'utilisateur dans l'interface de Khartis

Sans outils, tu guides l'utilisateur à l'écran. Donne une étape à la fois, avec les libellés exacts entre guillemets, puis demande ce qu'il voit avant de continuer : l'interface réagit aux données, et ce qu'elle affiche (suggestions, entités non reconnues) décide de la suite. Les libellés ci-dessous sont ceux de l'interface en français ; en anglais, ils changent.

## Ouvrir un projet

À l'ouverture, Khartis propose trois onglets : « Créer un nouveau projet », « Ouvrir un projet » (un fichier `.kh`) et « Essayer avec un exemple ». Plus tard, « Nouveau projet » se trouve dans le menu (« Ouvrir le menu », en haut à gauche).

Pour créer un projet, sous « Importer des données » :

- « Glisser-déposer un fichier ou cliquer pour importer » ;
- « Coller un tableau de données » : coller des cellules copiées depuis un tableur. Le tableau est lu quand on quitte la zone de collage : si le bouton « Créer » reste grisé, cliquer dans un autre champ, par exemple « Lien vers un fichier stocké en ligne » ;
- « Lien vers un fichier stocké en ligne » : l'adresse d'un fichier public. Le site qui l'héberge doit autoriser sa lecture depuis Khartis, ce que font par exemple les fichiers de data.gouv.fr.

Puis « Créer ». Le projet s'enregistre tout seul dans le navigateur, mais seulement sur ce poste et dans ce navigateur : pour le garder ou le transmettre, le télécharger en `.kh`. « Ajouter des données au projet » ajoute un autre tableau ou fichier.

## Étape Données

L'étape suit trois temps, numérotés dans le panneau.

1. **« Contrôler les données ».** Le tableau s'affiche, avec la nature détectée de chaque colonne. Le menu d'une colonne permet de changer son type, de la renommer, de la masquer ou de la supprimer. « Options CSV » corrige le délimiteur, le séparateur décimal, celui des milliers et la ligne d'en-têtes. « Calculatrice » ajoute une colonne calculée (voir `references/calculs.md`).
2. **« Géolocaliser les données ».** Choisir « Entités administratives » (codes ou noms de territoires) et la « Variable liée », ou « Coordonnées géographiques » pour des colonnes de latitude et de longitude.
3. **« Joindre les données à un fond de carte ».** Khartis propose un fond (« Suggestions de Khartis ») ; on peut aussi chercher dans le « Catalogue » ou importer un fond (« Importer »). La jointure affiche ensuite ses comptes :
   - « entités jointes » : tout va bien ;
   - « entités jointes mais à vérifier » : rapprochées malgré une différence d'écriture, à confirmer une à une ;
   - « entités répétées » : plusieurs lignes pour un même territoire, seule la première compte ;
   - « entités non reconnues » : à corriger en choisissant l'« Entité du fond de carte » qui correspond, ou à ignorer ;
   - « entités ignorées ».

   Sur un gros fond, « Rechercher les correspondances approchantes » lance une recherche plus longue, qu'on ne peut pas interrompre. Terminer par « Valider la jointure ».

## Étape Visualisations

Le panneau suit trois temps.

1. **« Choisir ou créer une visualisation ».** Les « Suggestions de Khartis » montrent des cartes possibles, chacune avec sa ou ses variables. En cliquer une l'applique ; « Créer sa visualisation » part d'une visualisation vide.
2. **« Paramétrer la visualisation ».** Pour des aplats en classes : la « Méthode » (Quantiles, K-means (seuils naturels), Intervalles égaux, Q6, Moyennes emboîtées, Head/Tail, Manuel), le nombre de classes, la « Valeur de rupture » et la palette. Parmi les palettes, la suggestion « Daltonisme » regroupe celles de Wong et de Tol. « Afficher l'absence de données » donne un style aux valeurs manquantes.
3. **« Personnaliser le fond de carte ».**

Les outils de la barre de gauche :

- « Recherche » ;
- « Calques » : l'ordre des visualisations ;
- « Projection » : des projections suggérées d'après l'emprise des données, et les projections équivalentes signalées ;
- « Simplification » ;
- « Collection de cartes » : une carte par variable. Pour la créer, choisir plusieurs variables avec « Séparer en plusieurs cartes ». « Légende commune » garde les mêmes classes sur toutes les cartes.

## Étape Habillage

La page montre la mise en page finale. Les zones « Ajouter un titre », « Ajouter un sous-titre », « Ajouter une source » et « Ajouter l'auteur·rice » se remplissent directement sur la page ; une zone laissée vide n'apparaît pas à l'export.

Les outils de la barre de gauche :

- « Format » : A4, A3, formats d'écran ou format personnalisé ;
- « Légende » : titre, sous-titre (souvent l'unité), note et position de chaque légende ;
- « Indications géographiques » : échelle, flèche du nord, carte de situation ;
- « Annotations » : textes libres, formes, dessins, images ;
- « Déficiences visuelles » : simule huit déficiences de la vision des couleurs ; la simulation ne s'applique pas à l'export.

## Télécharger

Le bouton « Télécharger », en haut à droite, ouvre trois onglets :

- « Carte » : « Image vectorielle (SVG) », à reprendre dans un logiciel de dessin, ou « Image haute résolution (JPG) », jusqu'à l'« Ultra haute définition (4K) » ;
- « Données » : CSV, GeoJSON ou GeoPackage ;
- « Projet » : un fichier `.kh`, qui se rouvre par « Ouvrir un projet ».

Khartis n'exporte ni en PNG ni en PDF. Pour un PDF, ouvrir le SVG dans un logiciel de dessin ou de mise en page.
