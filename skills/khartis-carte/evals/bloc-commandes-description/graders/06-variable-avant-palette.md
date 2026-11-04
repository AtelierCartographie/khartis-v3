---
type: llm
focus: trace
weight: 1
---

Dans le bloc, set_choropleth_variable vient avant update_classification : la carte actuelle a une valeur de rupture, que le changement de variable retire, sans quoi Khartis refuserait la palette séquentielle.
