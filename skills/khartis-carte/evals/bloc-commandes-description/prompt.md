---
tags: [khartis]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Je travaille sur une carte dans Khartis, l'outil de cartographie thématique de l'Atelier de cartographie de Sciences Po. Voici sa description, produite par Khartis : elle ne contient aucune valeur des données.

Comment me répondre :

- Explique chaque choix en une phrase ; c'est moi qui décide.
- Pour modifier la carte, termine ta réponse par un seul bloc de code json, que je collerai dans Khartis. Khartis vérifie chaque commande avant de l'appliquer et refuse celles qui sont invalides.
- Forme du bloc : {"revision": "<révision de la description>", "commands": [{"tool": "<outil>", "arguments": {...}}]}
- Une commande peut viser une visualisation ou une légende créée par une commande précédente du bloc : mets alors "@nouvelle" à la place de son identifiant.
- N'invente aucun chiffre, aucune date ni aucune source absents de la description : demande-les-moi.

Outils et arguments :

- apply_visualization_suggestion : suggestion_key, dataset_id. Applique une représentation suggérée par Khartis.
- update_classification : visualization_id, method, classes, palette_id, inverted. Aplats en classes seulement ; méthodes et palettes dans "capabilities".
- set_choropleth_variable : visualization_id, column. Change la variable d'un aplat.
- set_layout_texts : title, subtitle, source. Écrit le titre, le sous-titre et la source de la page.
- set_text : text_id, text. Réécrit un texte existant de la page (liste "texts") ; à utiliser quand le titre ou la source est un texte libre, que set_layout_texts signale comme manquant.
- set_legend_texts : legend_id, title, subtitle, note.

Description de la carte :
{"project_name": "Participation aux élections européennes, 2019-2024", "step": "styling", "revision": "114121fd", "datasets": [{"id": "3d0bdece-22bb-4f63-ba92-da733db80290", "name": "Tableau collé-1790772837546.tsv", "row_count": 101, "has_geometry": false, "joined_basemap": "france-departement-2025-high", "columns": [{"name": "code_departement", "type": "text", "nature": "place_id", "missing_count": 0, "distinct_count": 101}, {"name": "departement", "type": "text", "nature": "label", "missing_count": 0, "distinct_count": 101}, {"name": "participation_2019", "type": "number", "nature": "ratio", "missing_count": 0, "distinct_count": 67}, {"name": "participation_2024", "type": "number", "nature": "ratio", "missing_count": 0, "distinct_count": 72}], "calculated_columns": ["evolution_participation", "taux_variation"]}], "visualizations": [{"id": "04fb3290-08cb-4fd5-8918-9f753c3016f6", "name": "Visualisation", "dataset_id": "3d0bdece-22bb-4f63-ba92-da733db80290", "enabled": true, "primitives": [{"primitive": "polygon", "mode": "classes", "value_column": "taux_variation", "classification": {"method": "kmeans", "classes": 5, "inverted": false, "diverging": true}}]}], "page_texts": {"title": null, "subtitle": null, "source": null}, "texts": [{"id": "page-element-credit-1790773285006-5", "role": "credit", "text": "Rose Desvents, 2026. Réalisé avec Khartis"}, {"id": "annotation-1790773530114", "role": null, "text": "Source : ministère de l'Intérieur, 2019 et 2024, www.data.gouv.fr\nFond de carte : IGN - ADMIN EXPRESS."}, {"id": "annotation-1791985508310", "role": null, "text": "Participation aux élections \neuropéennes, 2019-2024"}], "legends": [{"id": "legend-viz-04fb3290-08cb-4fd5-8918-9f753c3016f6--area", "visualization_id": "04fb3290-08cb-4fd5-8918-9f753c3016f6", "visible": true, "title": "Évolution de la participation", "subtitle": "en %", "note": ""}], "capabilities": {"steps": ["data", "visualizations", "styling"], "classification_methods": ["quantiles", "equal_interval", "kmeans", "q6", "nested_means", "head_tail"], "class_count": {"min": 2, "max": 12}, "class_palettes": {"sequential": ["blues", "greens", "oranges", "purples", "reds", "grays", "cb-blue", "cb-vermilion", "cb-green", "cb-indigo", "mono-khartis", "mono-pink", "mono-teal", "mono-gold", "mono-vermilion", "sepia-sand", "sepia-terre", "sepia-ochre", "sepia-brique", "sepia-olive"], "diverging": ["rdbu", "rdylgn", "piyg", "prgn", "brbg", "sepia-ochre-slate", "sepia-brick-olive", "cb-prgn", "cb-burd", "cb-orin"]}}}

Représentations suggérées par Khartis :
{"dataset_id": "3d0bdece-22bb-4f63-ba92-da733db80290", "visualizable_dataset_ids": ["3d0bdece-22bb-4f63-ba92-da733db80290"], "applied_suggestion_key": null, "suggestions": [{"key": "choropleth::1::participation_2019::polygon::QTR", "kind": "choropleth", "label": "Carte choroplèthe", "columns": [{"name": "participation_2019", "nature": "ratio"}], "geometry": "polygon", "score": 46}, {"key": "choropleth_labeled::2::participation_2019|departement::polygon::QTR|label", "kind": "choropleth_labeled", "label": "Choroplèthe + étiquettes (top 10)", "columns": [{"name": "participation_2019", "nature": "ratio"}, {"name": "departement", "nature": "label"}], "geometry": "polygon", "score": 42}, {"key": "texts_colorful_QTR::2::departement|participation_2019::point|polygon::QL|QTR", "kind": "texts_colorful_QTR", "label": "Textes colorés (quantitatif)", "columns": [{"name": "departement", "nature": "category"}, {"name": "participation_2019", "nature": "ratio"}], "geometry": "polygon", "score": 32}]}

Relecture de Khartis :
{"revision": "114121fd", "ready": true, "checks": [{"id": "title_in_free_text", "severity": "advice", "message": "The title field is empty: check that one of the free texts is the title."}]}

Ma demande : Plutôt que l'évolution, je veux montrer la participation de 2024, avec une palette adaptée aux daltoniens et un titre clair.
