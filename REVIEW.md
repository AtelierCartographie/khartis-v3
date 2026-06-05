# Review rapide — livraison 2026-06-05 (branche `w22-2026-tma-jb`)

> **13 commits.** Lancer : `pnpm dev` → http://localhost:5176/cartographie/khartisnewpprd/
> **Projet de test rapide** (Monde, choroplèthe) : ajoute à l'URL
> `?kh=http://localhost:5176/cartographie/khartisnewpprd/tests-datasets/projects/test-project.kh`
> 📄 **Détail de ce qui a été fait / reste** : voir **`BILAN.md`**. Ce fichier-ci = **comment tester**.
> 🔑 **À tester en priorité** (gros chantiers) : suppression du mode hors ligne, couche `land` #156, refonte des calques #182, échelle de page #186, annotations #172.
> Coche chaque case après vérification. Format : **Tester** → **Voir**.

---

## Étape Données

- [ ] **#166 — Forcer une colonne mixte en Nombre** _(déjà résolu)_
      Tester : importe `…/tests-datasets/csv/mixed-numeric-type-test.csv` (colonne `mesure` typée Texte) → clic type colonne → **Nombre**.
      Voir : les valeurs non numériques (`abc`, `N/A`) deviennent NULL (badge nuls augmente), l'opération n'échoue pas.

- [ ] **#173 — Outil Recherche épuré** _(déjà résolu)_
      Tester : projet joint (ex. `…/csv/naissances-par-commune-departement-et-region-2018.csv`, joins) → étape Visualisations → outil Recherche → chercher « Paris ».
      Voir : aucune option Regex / « Remplacer par » ; aucun résultat de colonne `basemap_*`.

- [ ] **#184 — Scroll horizontal du tableau (vue large)**
      Tester : étape Données, beaucoup de colonnes, clic « Agrandir ».
      Voir : scroll horizontal fonctionnel dans la modale agrandie.

- [ ] **#184 — Croix de suppression d'un filtre**
      Tester : étape Données → ajoute un filtre → clic sur la **croix** du tag du filtre.
      Voir : le filtre est supprimé (avant : seul « Effacer tout » marchait).

- [ ] **#184 — Scroll horizontal du catalogue de fonds**
      Tester : étape Données → Géolocaliser/Joindre → catalogue de fonds de carte.
      Voir : la liste des fonds scrolle horizontalement.

## Fenêtre de lancement

- [ ] **#184 — Scroll horizontal (sauvegardes + exemples)**
      Tester : ouvre la modale création → onglets « Ouvrir un projet » / « Essayer un exemple ».
      Voir : les listes scrollent horizontalement.

- [ ] **#183 — Vignettes de projet homogènes**
      Tester : crée un projet en **OSM / Web Mercator** (MapLibre), laisse l'autosave, rouvre « Ouvrir un projet ».
      Voir : vignette de la carte (skeleton bref puis image). En carte **orthographique** : placeholder propre (pas de vignette vide), aucune erreur console.

## Étape Visualisations

- [ ] **Suggestion « symboles » n'active que Symboles**
      Tester : projet polygone joint → suggestions → choisir « Symboles proportionnels ».
      Voir : seule **Symboles** active, **Polygones off**.

- [ ] **#184 — Décocher la suggestion après une modif manuelle**
      Tester : projet de test → choisir une suggestion (sa carte se coche) → modifier un paramètre (couleur, classification, type…) ; puis crée une 2ᵉ viz depuis une suggestion sans y toucher.
      Voir : la carte de suggestion **se décoche** dès la modif manuelle ; la viz **non modifiée** issue d'une suggestion **reste cochée** ; au save/reload, une viz modifiée reste décochée.

- [ ] **#184 — Carte de suggestion = Primitive · Type · Variable**
      Tester : projet de test → étape Visualisations, regarde les cartes de suggestion.
      Voir : une ligne **primitive** (« Polygone », « Point · Polygone ») au-dessus du type et de la variable.

- [ ] **Palette divergente automatique (passage par zéro)**
      Tester : projet de test → viz choroplèthe sur **`taux_solde`** (valeurs ±).
      Voir : palette **divergente** présélectionnée, **pivot à 0** (rouge↘bleu) ; sur `population` (100 % positif) → séquentielle.

- [ ] **#184 — Catégories : appliquer une palette entière**
      Tester : viz en **catégories** (primitive « En catégories ») → popover couleur → « Suggestions Khartis » qualitatives.
      Voir : un bouton **« Appliquer la palette »** sur chaque rangée applique toutes les couleurs d'un coup (vs couleur par couleur).

- [ ] **#184 — Onglets de visualisation répartis (plus de débordement)**
      Tester : crée 3-4 visualisations (bouton « Ajouter une visualisation »).
      Voir : les onglets se **répartissent l'espace** (pas de scroll/troncature « Visuali… »), tous cliquables.

- [ ] **#184 — Icônes des étapes/outils**
      Tester : barre de gauche (étapes + outils).
      Voir : Données=tableau, Habillage=outils croisés, Projection=globe, Simplification=scalpel, Format=crop, Indications=boussole, Annotations=annotation, Déficiences=œil-réglages.

- [ ] **#75 — Projections : l'interaction agit (rotation/centrage)**
      Tester : projet de test (fond Monde) → outil Projection → choisir une projection (ex. Mercator) ; puis bouger les sliders **longitude / latitude / rotation**.
      Voir : la carte **change de projection** ET se recadre ; les sliders de rotation/centrage **modifient le rendu** (avant : « rien ne se passait »). _(Sous-points par-défaut composites / bbox points / pré-projeté / flipY = à confirmer sur datasets dédiés.)_

- [ ] **Filtre de primitive : Textes et Symboles dissociés** _(déjà résolu, #154/#175)_
      Tester : viz avec **Symboles + Textes** actifs (ex. `…/csv/sites-seveso-idf.csv`, labels activés) → bouton « Filtrer » (entonnoir) d'une primitive → créer un filtre côté **Symboles**, puis côté **Textes**.
      Voir : filtrer les **Symboles** laisse les **Textes** intacts ; filtrer les **Textes** fonctionne seul (avant : Textes ne marchait pas, Symboles filtrait aussi les textes).

- [ ] **#177 — Collection de cartes (facettes)** _(travail à valider)_
      Tester : projet multi-variables → outil **Collection de cartes** → activer.
      Voir : **grille de facettes** (une carte par variable), sans flip Y, centrées ; **pastille rouge** dès plusieurs variables ; titres synchronisés ; légendes (1/facette ou commune) ; **contour de facette**. Sur projection régionale (France) : contour-sphère bien calé. Une collection ne doit **pas** ouvrir d'onglets de visualisation supplémentaires.

- [ ] **#184 — Outil Projection = liste simple (plus de Liste/Grille)**
      Tester : outil Projection → section suggestions / « Autres projections ».
      Voir : **plus de toggle Liste/Grille** ; une seule liste de projections + filtres.

- [ ] **#156 — Territoire rendu depuis le fichier `land`**
      Tester : projet de test (Monde) → onglet réseau du navigateur, filtre `land`.
      Voir : `monde-land-2024-medium.parquet` **chargé** ; le Territoire s'affiche (avant : réutilisait les polygones-pays). Tester l'**épaisseur de contour à 0** (section 3 → Territoire) → contour disparaît.

- [ ] **#186 — Symboles/textes suivent l'échelle de page**
      Tester : viz à **symboles proportionnels** (`…/csv/sites-seveso-idf.csv`) + légende → barre de zoom mode **Page** → 200 %.
      Voir : symboles, contours, textes **grossissent comme la légende et le canvas** (avant : symboles figés).

## Étape Habillage

- [ ] **#184 — Ouverture des panneaux au double-clic seulement**
      Tester : sur la carte, **simple** clic sur la légende, puis **double**-clic.
      Voir : simple clic → n'ouvre pas le panneau ; double-clic → ouvre l'outil Légende. Idem titre/sources/annotations.

- [ ] **#172 — Annotations : isolation des points d'ancrage**
      Tester : Annotations → Forme « Flèche » → dessiner → déplacer une extrémité.
      Voir : seule l'extrémité bouge, l'**autre reste strictement immobile**.

- [ ] **#172 — Annotations : épaisseur de contour constante**
      Tester : créer un rectangle, l'**étirer** très large/plat.
      Voir : le contour garde une **épaisseur uniforme** (pas écrasé/étiré).

- [ ] **#172 — Annotations solidaires du fond au zoom carte**
      Tester : créer une forme sur la carte, la déplacer une fois, puis **zoomer/paner la CARTE** (mode Carte).
      Voir : la forme **reste collée aux frontières** (titre/légende → restent fixes). _(En projection composite France/DOM : reste en mode page — normal.)_

- [ ] **#160 — Carte en encart (mini-globe)** _(cœur câblé, à valider)_
      Tester : projet **régional** → outil **Indications géographiques** → activer la carte en encart → **activer une projection**.
      Voir : la bbox de l'encart **reflète la carte principale même en projection active** (avant : cassé dès qu'une projection était active) ; couleur de l'emprise par défaut **`#dd5642`** ; **plus de slider de zoom** ni de réglages centrage lon/lat dans le panneau encart. _(rectangle→point quand l'emprise est minuscule = non livré.)_

- [ ] **#66 — Simplification : « Réinitialiser » (fond à niveaux radio)**
      Tester : fond avec niveaux Faible/Moyen/Élevé → passer à Faible → « Réinitialiser ».
      Voir : revient à **Moyen** ET la carte se recharge au bon niveau.

- [ ] **#185 — Bouton de réinitialisation du zoom**
      Tester : zoomer/déplacer (mode Carte puis Page) → bouton **↺** de la visionneuse.
      Voir : recadrage/zoom revient à 100 % (Carte = emprise, Page = ajusté).

## Étape Visualisations → outil Calques

- [ ] **#182 — Refonte des calques (liste unique + drag&drop)**
      Tester : projet multi-viz → outil Calques.
      Voir : **une seule liste plate** (`Symboles · <viz>`, couches annexes globales) ; toggle visibilité d'une ligne agit en direct ; réordonner (drag ou menu Monter/Descendre) change le rendu ; **save/reload** conserve l'ordre.

## Application (menu latéral)

- [ ] **PWA installable**
      Tester : barre d'adresse Chrome (build/preview : `pnpm build && pnpm preview`).
      Voir : icône d'installation présente ; menu latéral → « Installer Khartis ».

- [ ] **Mode hors ligne supprimé, factory reset conservé**
      Tester : menu latéral (hamburger).
      Voir : **aucun** bouton « mode hors ligne / télécharger les fonds » ; « Mettre à jour Khartis » (reset) toujours présent ; au démarrage, **aucun téléchargement de basemap** (onglet réseau).

- [ ] **Import projet par URL `?kh=`**
      Tester : ouvre `…/khartisnewpprd/?kh=…/tests-datasets/projects/test-project.kh` ; puis une URL `.kh` inexistante.
      Voir : projet chargé sans modale ; URL invalide → toast d'erreur localisé.

---

## ⏳ Pas livré (pour info, rien à tester)

- **#183 cœur** ⛔ vignettes catalogue/suggestions = **SVG Atelier non fournis**.
- **#160** rectangle→point quand l'emprise est minuscule (reporté).
- **#184** redimensionnement de la **légende** par poignée (feature drag, non vérifiable sans navigateur).
- **#156** innerlines à l'import géo + synchro couleur Territoire ↔ Calques.
- **À valider par leur auteur** (travail parallèle committé) : finitions textes #154 (color picker HSL, « halo→contour ») ; facettes #177 (contour-sphère).

## 📋 À faire côté projet (hors code)

- [ ] Clore **#166** et **#173** (vérifiées résolues).
- [ ] Créer 2 issues : règle palette divergente auto ; bugs filtre Textes/Symboles.
