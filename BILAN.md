# Bilan livraison Khartis — 2026-06-05 (échéance 7 juin)

> Branche `w22-2026-tma-jb` · **13 commits** · code commité, rien poussé. Guide de test : `REVIEW.md`.
> Liste = **ce qui a été fait (avec le détail)** puis **ce qui reste (avec le pourquoi)**.

---

## ✅ FAIT — livraison 7 juin

- **PWA — bouton d'installation** `12f54dc6`
  Cause : aucun `<link rel="manifest">` dans `app.html` (vite-plugin-pwa ne l'injecte pas sous SvelteKit). Ajout du link → manifest découvert (fetch 200), `beforeinstallprompt` se déclenche → l'icône d'install apparaît.

- **Suppression du mode hors ligne** (#—) `0cdebd39`
  12 fichiers supprimés (offline button/panel/row, basemap-sets, warmup-scheduler, connectivity.store, pwa-offline). `factoryResetPwa` extrait dans `pwa-reset.ts`. `sw.ts` purgé (routes basemap, background-fetch, periodic-sync). 40 clés i18n retirées. **PWA install + factory reset conservés**, build OK, SW généré sain (31 Ko, 0 code offline).

- **Couches annexes : couche `land`** #156 `207b1178` `6e8fbe40`
  Le Territoire est rendu depuis le **fichier `land` des métadonnées** (ex. `monde-land-2024-medium`) au lieu des polygones-pays, via le pipeline binaire existant ; fallback `worldBaseTable` si pas de `land` ; multi-`land` géré (Europe NUTS). Sous-tâches vérifiées : **épaisseur de contour 0** (rendu sauté, 2 tests), **Mers via sphère** (déjà en place), **graticules « Remarquable »** + gating (déjà en place). Réseau confirme `monde-land` chargé.

- **Refonte de la gestion des calques** #182 `91b2852e`
  Panneau « Calques » = **liste unique aplatie** (chaque ligne = primitive·viz ou couche annexe basemap **globale dédupliquée**). **Drag&drop** réordonne le rendu via rétro-projection vers les 3 stores + clamp/snap (invariant back→thematic→front). Facettes routées via `reorderVariables` (rendu facettes intact). UI plate accent viz / sépia basemap. 178 tests verts.

- **Projections — rotation / l'interaction agit** #75
  L'outil Projection **agit** : choisir une projection change le rendu ET recadre ; les sliders longitude/latitude/rotation modifient la carte (avant : « rien ne se passait »). _(Socle projection antérieur, validé en navigateur ; 4 sous-points pré-projeté/composite à confirmer sur datasets dédiés.)_

- **Vignettes d'aperçu — partie autonome** #183 `f201b624`
  Capture **basse-résolution best-effort** du canvas à la sauvegarde (`map-thumbnail.utils`, 100 % local) : fiable en MapLibre, repli placeholder propre en orthographique. Cartes projet/exemple en ratio 16/9 + **skeleton** + **lazy-load** d'image.

- **Simplification — ultime remarque** #66 `12f54dc6`
  Le bouton « Réinitialiser » en mode **radios** (fond à niveaux) revient à **« Moyen »** ET recharge le basemap au bon niveau (avant : ne faisait rien). Le mode slider (géo importé) reste inchangé.

- **UI/UX : intégrations diverses** #184 — **11/12** `12f54dc6` `32d98718`
  Faits : **icônes** des étapes/outils (8/8) ; **onglets** répartis en flex (plus de débordement) ; **croix de suppression de filtre** (`on:close`) ; **outil Projection → liste simple** (toggle Liste/Grille retiré) ; **scrolls horizontaux** (fenêtre de lancement, catalogue, tableau Données) ; **paddings verticaux** uniformisés ; **ouverture des panneaux d'habillage au double-clic** ; **badge Primitive** sur les cartes de suggestion (`Primitive · Type · Variable`) ; **sélection d'une palette catégorielle entière** (« Appliquer la palette »).

- **Correction de la carte en encart** #160
  La bbox de l'encart utilise l'**invert de la projection de rendu** → reflète la carte même **projection active** (avant : cassé) ; couleur d'emprise par défaut **`#dd5642`** ; **slider de zoom + réglages centrage retirés** ; clé i18n orpheline nettoyée.

- **Échelle de page ↔ taille des symboles** #186 `6697e6b9`
  `pageDisplayScale` répercuté sur `radiusScale`/`lineWidthScale`/`sizeScale` des symboles, lignes, contours et textes → ils **grossissent avec la page et la légende** (avant : figés). Sans double-comptage (positions via matrice, tailles via scale), facteur=1 en MapLibre.

- **Collection de cartes — dernière remarque** #177 — _à valider en QA_
  Essentiel committé (collection unique, masquage des primitives, pastille multi-variables, titres synchro, légendes, contour de facette, corrections flip-Y/centrage). Contour-sphère sur projection régionale = travail parallèle, à revoir par l'auteur.

- **Filtre de primitive : Textes ↔ Symboles dissociés** (#154) _(déjà résolu, #175)_
  `VizDataFilter.primitiveType` est appliqué par table → filtrer **Symboles** laisse les **Textes** intacts ; filtrer **Textes** fonctionne seul (avant : Textes ne marchait pas, Symboles filtrait aussi les textes). Couvert par tests.

- **Palette divergente automatique (passage par zéro)** (#68) `12f54dc6`
  `detectDivergingBreakpoint` : si `min<0 && max>0` → **pivot 0** appliqué, palette **divergente** présélectionnée (modifiable) ; si tout positif → séquentielle (pas de faux positif). Pivot auto re-résolu à chaque (re)calcul.

## ✅ FAIT — quick wins

- **Bouton de réinitialisation du zoom/centrage** #185 `12f54dc6`
  Bouton **↺** dans la visionneuse, réinitialise le mode actif : Carte → recentrage emprise ; Page → page ajustée à l'écran.

- **Suggestion viz → seule Symboles active** `12f54dc6`
  `symbolPrimitiveFilters = [POINT]` (au lieu de `[POINT, POLYGON]`) → une suggestion « symboles » n'active **que** Symboles (Polygones n'est plus activé à tort).

- **Import de projet via URL `?kh=`** `12f54dc6`
  `loadProjectFromKhUrl` dans `+layout` : lit `?kh=`, garde `isDirty` (confirmation), fetch navigateur → `File` → `importProject` ; erreur (URL/CORS/corrompu) en toast localisé (fr+en). Privacy : fetch direct navigateur.

- **Décocher la suggestion au modif manuel** #184 `426a3a90`
  `resolveDisplayedSuggestionKey` filtre désormais l'`originMode` (`custom` / `manual-blank`) **avant** la clé persistée. Une modif manuelle bascule l'origin en `custom` (en gardant `suggestionKey`), donc la carte de suggestion **se décoche** au lieu de rester collée. Le garde s'appuie sur `originMode` (fiable), **pas** sur le matching structurel imparfait → les vizs **intactes** (`auto-suggestion`) restent cochées (pas de régression, contrairement au fix précédent reverté). Test mis à jour (14/14).

## ✅ FAIT — annotations (#172, hors liste Thomas mais livré)

- **bug 1 — isolation des points d'ancrage** `12f54dc6` : déplacer un point ne déplace plus les autres (renormalisation de `position` au drag ; mesuré Δ 0,0).
- **bug 2 — épaisseur de contour constante** `12f54dc6` : `vector-effect="non-scaling-stroke"` → contour uniforme même sur forme étirée 10:1.
- **bug 3 — ancrage au zoom carte** `3f23485b` `dad9e426` `9765755b` : les formes/flèches dessinées sont créées en `coordinateSpace:'map'` + ancrées en data (`{lon,lat}`), reprojetées au `viewState` → **restent collées aux frontières au zoom/pan** ; repli `'page'` sur projection composite ; habillage (`role`) inchangé.

---

## ⏸ RESTE À FAIRE — et pourquoi

- **#183 cœur (vignettes catalogue + suggestions)** — ⛔ **bloqué** : les **SVG statiques de l'Atelier ne sont pas fournis** (asset externe absent du repo).
- **#160 rectangle → point** (quand l'emprise est trop petite) — ⏸ **reporté par consigne** (décision produit explicite de le laisser pour après).
- **#184 redimensionnement de la légende par poignée** — feature **à créer** : les annotations ont déjà des poignées de resize, mais la légende n'en a pas (elle se scale seulement au zoom page). _Non livrée : une feature de drag/resize ne peut pas être validée sans navigateur (risque de régression non vérifiable côté code)._
- **#156 innerlines + synchro Territoire ↔ Calques** — innerlines (`extract_innerlines`, #53) à l'import géo non faites ; la couleur de fond du Territoire vient du **style preset** et pas encore de la config utilisateur (recoupe l'outil Calques #182). _Non livré : pipeline DuckDB + rendu, validation visuelle requise._
- **#154 finitions textes & #177 contour-sphère facettes** — 🟡 **travail parallèle committé** (color picker HSL, « halo→contour », contour-sphère) : c'est **du code écrit par un autre travail en cours**, à **valider en QA par son auteur** (je ne l'ai pas écrit, je ne le coche pas).
- **QA manuelle navigateur des 2 refontes** — #172 bug 3 (forme suit le zoom carte) et #182 (save/reload + drag natif + facettes) sont **couverts par les tests unitaires** mais méritent une **confirmation visuelle humaine** (non déroulée faute de temps de session).

## 📋 Actions hors-code (en attente de toi)

- **Clore #166 et #173** — vérifiées résolues (changement de type `TRY_CAST` ; outil Recherche épuré), clôture **non exécutée**.
- **Créer 2 issues** : règle « palette divergente auto sur passage par zéro » (lié #68) ; bugs « filtre de primitive Textes/Symboles » (lié #154).

---

## Commits de la session (13)

```
426a3a90  fix(visualization): uncheck suggestion once a viz diverges into custom (#184)
8ce6c32a  docs: add delivery review guide and status report
91b2852e  feat(layers): flatten the layer panel into one reorderable list (#182)
dad9e426  feat(annotations): anchor drawn shapes to the basemap on creation (#172)
9765755b  test(map): open legend on double-click in tests (#184)
3f23485b  feat(annotations): data-anchoring infrastructure for map annotations (#172)
f201b624  feat(projects): low-res map thumbnail on save, homogeneous previews (#183)
32d98718  feat(visualization): suggestion primitive label and whole-palette pick (#184)
6697e6b9  feat(map): scale symbols, lines and labels with page zoom (#186)
6e8fbe40  test(map): lock no Territoire stroke when thickness is 0 (#156)
207b1178  feat(map): render Territoire from metadata land file (#156)
0cdebd39  refactor(pwa): remove offline mode, keep install and factory reset
12f54dc6  fix(visualization): ui/ux pass and annotation fixes (#184, #172)
          ↑ checkpoint : PWA #—, simplification #66, reset zoom #185, suggestion-toggle,
            import ?kh=, palette divergente #68, filtre primitive #154, encart #160,
            UI/UX #184 (1ʳᵉ vague), annotations bug1+bug2 #172
```
