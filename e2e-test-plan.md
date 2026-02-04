✅ Couverture Actuelle (20 tests)

1. Import de données ✅ Bien couvert (CSV, GeoJSON, Shapefile, GeoPackage)
2. Navigation ✅ Bien couvert (3 étapes)
3. Rendu carte ✅ Bien couvert (canvas, basemap, layers)
4. Gestion projets ✅ Bien couvert (CRUD + i18n)
5. Jointure de données ✅ Couvert (e2e/data-join.spec.ts)
6. Export projet ✅ Couvert (e2e/export.spec.ts)

✅ Axes Critiques Couverts

1. ✅ Jointure de données à fond de carte (IMPLÉMENTÉ)

Fichier : e2e/data-join.spec.ts
Test : should join CSV data with geographic entities to basemap

- Import CSV avec entités géographiques (fossil-fuel-subsidies-gdp-2021.csv)
- Sélection automatique de la colonne géographique
- Choix fond de carte (World > countries)
- Vérification de la jointure (sections géolocalisation et jointure visibles)
- Vérification du rendu carte (deck.gl canvas)

2. ✅ Export (IMPLÉMENTÉ)

Fichier : e2e/export.spec.ts
Tests :

- should export project as .kh file : Vérifie le téléchargement complet du fichier .kh
- should show export modal with tabs for Projet, Carte, Données : Vérifie l'UI export (3 onglets CDC 1.D)

🎯 Recommandation

Filet de sécurité actuel : 9/10 ✅

Tous les axes critiques du CDC sont maintenant couverts :

- ✅ Import de données
- ✅ Jointure données/fond de carte (workflow principal)
- ✅ Export projet (.kh)
