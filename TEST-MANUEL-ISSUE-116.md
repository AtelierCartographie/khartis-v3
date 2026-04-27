# Test manuel - Issue #116 Primitive Symboles

## Fichiers a importer

Fichier principal pour tester presque tout :

`static/tests-datasets/csv/world-bank-rural-pop.csv`

Fichier complementaire pour fermer le bug global sur France communes :

`static/tests-datasets/csv/naissances-par-commune-departement-et-region-2018.csv`

Le premier fichier couvre la jointure Monde, les colonnes numeriques par annee, les champs texte, les modes Proportionnel, Classes, Categories, Fond et Contour. Le second sert a verifier que le bug global ne revient pas sur le cas France communes.

## Preparation

1. Lancer l'app :

   ```bash
   pnpm dev
   ```

2. Ouvrir :

   `http://localhost:5176/cartographie/khartisnewpprd/`

3. Ouvrir la console navigateur.
4. Pour chaque scenario important, repartir d'un nouveau projet.
5. Ne pas rafraichir la page entre la jointure et les tests Symboles.

## Scenario 1 - Bug global Monde

1. Importer `static/tests-datasets/csv/world-bank-rural-pop.csv`.
2. Creer le projet.
3. Verifier que Khartis detecte `country_code` comme code pays ISO Alpha-3.
4. Valider la suggestion `Monde - par pays`.
5. Cliquer sur `Visualiser`.
6. Activer `Symboles`.
7. Passer le mode Symboles en `Proportionnel`.
8. Verifier que `Taille selon` selectionne automatiquement `_2020` ou la derniere colonne annee disponible.
9. Verifier que les symboles apparaissent sur la carte sans F5.
10. Passer en `En classes`.
11. Verifier que la carte affiche des symboles classes, sans message d'absence de donnees.
12. Passer en `En categories`.
13. Verifier que les symboles restent visibles.

Resultat attendu : aucun mode Symboles ne tombe en absence de donnees apres jointure.

## Scenario 2 - Bug global France communes

1. Repartir d'un nouveau projet.
2. Importer `static/tests-datasets/csv/naissances-par-commune-departement-et-region-2018.csv`.
3. Creer le projet.
4. Choisir la geolocalisation administrative proposee.
5. Valider la suggestion `France - par communes`.
6. Aller dans `Visualiser`.
7. Activer `Symboles`.
8. Tester `Proportionnel`, `En classes`, puis `En categories`.

Resultat attendu : les symboles s'affichent sans rafraichir la page.

## Scenario 3 - Restriction des variables

Avec `world-bank-rural-pop.csv` :

1. En Symboles `Proportionnel`, ouvrir `Taille selon`.
2. Verifier que les champs numeriques sont proposes (`_1960`, `_1980`, `_2000`, `_2020`).
3. Verifier que les champs texte (`country_code`, `country_name`, `indicator_name`) ne sont pas proposes comme choix principaux.
4. En Symboles `En categories`, ouvrir `Aspect selon`.
5. Verifier que les champs texte sont proposes.
6. Verifier que les champs numeriques ne sont pas proposes.
7. Faire le meme controle dans `Polygones > En classes` et `Polygones > En categories`.
8. Faire le meme controle dans `Contour > En classes` et `Contour > En categories`.

Resultat attendu : numerique pour les classes/proportionnels, texte pour les categories.

## Scenario 4 - Symboles proportionnels simples

1. Activer `Symboles`.
2. Choisir `Proportionnel`.
3. Verifier que le radio affiche `Uniques`.
4. Verifier que `Taille maximum` est visible.
5. Verifier que le choix de `Forme` est visible.
6. Changer la forme de `Point` vers une forme lineaire si disponible.

Resultat attendu : la taille maximum et la forme sont reglables en mode simple, et l'echelle s'adapte automatiquement selon la forme.

## Scenario 5 - Symboles proportionnels doubles

1. En Symboles `Proportionnel`, choisir `Doubles`.
2. Verifier que la section `Fond` disparait pour ce mode.
3. Verifier que `Couleur A`, `Couleur B` et `Opacite` sont visibles apres les reglages de rupture.
4. Choisir une variable numerique pour A et une autre pour B.
5. Tester la position `Juxtaposition`.

Resultat attendu : deux symboles se dessinent cote a cote, sans chevauchement visible.

## Scenario 6 - Symboles en classes

1. Passer Symboles en `En classes`.
2. Verifier que l'icone du selecteur de variable est une icone de table.
3. Cliquer sur `Parametres de discretisation`.
4. Verifier que le bouton est discret, sans bordure basse parasite.
5. Verifier que le panneau montre un apercu de tailles par classe.
6. Si un fond en classes est actif, verifier que l'histogramme reprend les couleurs de classes.

Resultat attendu : panneau discretisation coherent avec la taille des symboles.

## Scenario 7 - Fusion Fond / Symboles categories

1. Revenir en Symboles `Unique`.
2. Dans la section `Fond`, choisir `En categories`.
3. Verifier que Symboles bascule automatiquement en `En categories`.
4. Verifier que la section `Fond` n'est plus affichee dans le mode Symboles categories.
5. Verifier que `Aspect selon` propose des champs texte.
6. Ouvrir la palette qualitative.
7. Verifier qu'il n'y a pas de bouton `Inverser la palette`.

Resultat attendu : Fond categories et Symboles categories sont fusionnes proprement.

## Scenario 8 - Popover Aspect des categories

1. En Symboles `En categories`, choisir un champ texte avec plusieurs categories, par exemple `country_name`.
2. Ouvrir le popover `Aspect`.
3. Verifier les valeurs par defaut :
   - taille unique activee ;
   - contour actif ;
   - couleur auto activee ;
   - taille unique du contour activee ;
   - motif desactive.
4. Verifier que le slider de taille peut monter jusqu'a 100.
5. Desactiver `Couleur auto`.
6. Verifier que chaque categorie affiche un selecteur de couleur de contour.
7. Desactiver la taille unique du contour.
8. Verifier que chaque categorie affiche une epaisseur de contour.
9. Activer `Motif`.
10. Verifier que le dropdown propose les motifs.
11. Renommer une categorie.
12. Verifier que la legende et la carte suivent le renommage.
13. Desactiver une categorie.
14. Verifier que les symboles de cette categorie disparaissent au lieu de devenir noirs.
15. Tester le tri `A-Z`, puis `Z-A`.

Resultat attendu : le popover permet de piloter taille, contour, motif, ordre, nom et visibilite par categorie.

## Scenario 9 - Section Contour

1. En Symboles, ouvrir `Contour`.
2. En mode `Unique`, activer `Pointilles`.
3. Verifier qu'un dropdown de motif apparait.
4. Choisir `Tirets longs`.
5. Verifier que le rendu carte change.
6. Cliquer sur `Couleur`.
7. Verifier que le popover propose des suggestions et une personnalisation.
8. Passer Contour en `En classes`.
9. Verifier que `Epaisseur` est sous la palette de couleurs.
10. Verifier que le toggle `Afficher l'absence de donnees` est visible.

Resultat attendu : Contour unique et classes ont les bons controles.

## Scenario 10 - Non-regression rapide

1. Activer `Polygones`.
2. Tester `Unique`, `En classes`, `En categories`.
3. Activer `Lignes` si le fond courant le permet.
4. Activer `Textes`.
5. Verifier qu'aucun panneau ne casse et qu'aucune erreur rouge n'apparait dans la console.

## Critere de fermeture

L'issue peut etre consideree fermee si :

1. Les scenarios 1 et 2 passent sans rafraichissement.
2. Les modes Symboles `Unique`, `Proportionnel`, `En classes`, `En categories` affichent des donnees.
3. Les selecteurs de variables respectent bien texte vs numerique.
4. Le mode categories masque les categories desactivees au lieu de les rendre noires.
5. Les controles ajoutes sont visibles et persistants.
6. La console navigateur ne contient pas d'erreur rouge pendant les scenarios.
