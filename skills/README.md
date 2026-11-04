# Skills Khartis

Un skill est un dossier de méthode qu'un assistant IA charge de lui-même quand la tâche s'y prête : un fichier `SKILL.md`, des références lues au besoin, parfois des scripts. Il suit le format ouvert des skills ([agentskills.io](https://agentskills.io)), lu par Claude, Codex, Gemini CLI et GitHub Copilot. Ces skills apprennent aux assistants Khartis et les règles de l'Atelier de cartographie, quel que soit le navigateur de l'utilisateur.

Ce dossier est un exemple, rédigé pour l'étude de novembre 2026 et à relire par l'Atelier : rien n'est encore publié.

## Un exemple parmi d'autres

Ce dossier montre un seul skill, complet : `khartis-carte`. D'autres skills prolongeraient la même méthode pour un public ou une tâche, comme la préparation de données publiques, l'enseignement avec Khartis, la relecture avant publication ou la description accessible d'une carte. Ils ne sont pas écrits.

## Le skill `khartis-carte`

```
khartis-carte/
├── SKILL.md                       le parcours, les règles, la façon d'agir sur Khartis
├── references/
│   ├── donnees.md                 formats, codes officiels, millésimes, valeurs manquantes
│   ├── calculs.md                 taux, évolutions, écart à la moyenne pondérée, indice de spécificité
│   ├── semiologie.md              représentation, classes, couleurs, projection, comparaison
│   ├── interface.md               le chemin dans l'interface, avec les libellés exacts
│   └── outils-khartis.md          les outils WebMCP du prototype et le bloc de commandes
├── scripts/
│   ├── verifier_tableau.py        repère les pièges d'un tableau avant l'import
│   ├── analyser_distribution.py   compare les méthodes de classes de Khartis et en recommande une
│   └── regrouper_regions.py       ramène les anciennes régions aux régions actuelles, taux recalculés
└── evals/                         cas de test du skill
```

`analyser_distribution.py` calcule les bornes de chaque méthode avec les algorithmes des macros DuckDB de Khartis, arrondi compris. Sur 126 comparaisons (7 distributions, 6 méthodes, 3 nombres de classes), ses bornes sont identiques à celles de Khartis. Les scripts ne demandent que Python 3, sans bibliothèque ni réseau.

## Installer un skill

Copier le dossier `khartis-carte` dans le dossier de skills de l'assistant :

| Assistant      | Pour soi             | Pour un projet    |
| -------------- | -------------------- | ----------------- |
| Claude Code    | `~/.claude/skills/`  | `.claude/skills/` |
| Codex          | `~/.agents/skills/`  | `.agents/skills/` |
| Gemini CLI     | `~/.gemini/skills/`  | `.gemini/skills/` |
| GitHub Copilot | `~/.copilot/skills/` | `.github/skills/` |

Dans l'application Claude, le skill s'ajoute sous forme d'archive ZIP du dossier, depuis les réglages des fonctionnalités. Le dossier `evals/` n'est utile qu'à ceux qui font évoluer le skill.
