import { expect, test } from '@playwright/test';

test.describe('Aperçu du tableau de données - 2.A.5', () => {
  test.skip('affiche le tableau dans un panneau latéral', async ({ page }) => {});

  test.skip('permet de redimensionner le panneau', async ({ page }) => {});

  test.skip('affiche un nombre limité de lignes avec scroll', async ({ page }) => {});

  test.skip('permet d\'agrandir le panneau à taille prédéfinie', async ({ page }) => {});
});

test.describe('Actions sur les variables - 2.A.5.a', () => {
  test.skip('change le type d\'une variable', async ({ page }) => {});

  test.skip('modifie et manipule les variables', async ({ page }) => {});
});

test.describe('Résumé statistique - 2.A.5.b', () => {
  test.skip('affiche le nombre de lignes du tableau', async ({ page }) => {});

  test.skip('affiche le nombre d\'objets uniques pour variables géographiques', async ({ page }) => {});

  test.skip('signale les valeurs nulles', async ({ page }) => {});

  test.skip('signale les doublons', async ({ page }) => {});

  test.skip('affiche le nombre de catégories pour variables texte', async ({ page }) => {});

  test.skip('affiche un histogramme pour variables numériques', async ({ page }) => {});

  test.skip('affiche les valeurs min/max pour variables numériques', async ({ page }) => {});

  test.skip('peut masquer/afficher le résumé', async ({ page }) => {});
});

test.describe('Tri des données - 2.A.5.c', () => {
  test.skip('trie les données par différents critères', async ({ page }) => {});
});

test.describe('Recherche dans le tableau - 2.A.5.d', () => {
  test.skip('recherche dans tout le tableau', async ({ page }) => {});

  test.skip('recherche dans une variable spécifique', async ({ page }) => {});

  test.skip('affiche le nombre de résultats', async ({ page }) => {});

  test.skip('navigue entre les résultats', async ({ page }) => {});

  test.skip('met en évidence les résultats', async ({ page }) => {});

  test.skip('permet rechercher/remplacer', async ({ page }) => {});
});

test.describe('Filtres - 2.A.5.e', () => {
  test.skip('applique différents types de filtres sur les données', async ({ page }) => {});

  test.skip('combine plusieurs filtres', async ({ page }) => {});

  test.skip('affiche les statistiques de filtrage', async ({ page }) => {});
});

test.describe('Calculatrice - 2.A.5.f', () => {
  test.skip('ajoute une nouvelle variable calculée', async ({ page }) => {});

  test.skip('utilise l\'addition entre variables', async ({ page }) => {});

  test.skip('utilise la soustraction entre variables', async ({ page }) => {});

  test.skip('utilise la multiplication entre variables', async ({ page }) => {});

  test.skip('utilise la division entre variables', async ({ page }) => {});

  test.skip('utilise la fonction moyenne', async ({ page }) => {});

  test.skip('utilise la fonction puissance', async ({ page }) => {});

  test.skip('utilise la fonction arrondi', async ({ page }) => {});

  test.skip('utilise la concaténation de texte', async ({ page }) => {});

  test.skip('utilise l\'extraction de texte', async ({ page }) => {});

  test.skip('propose l\'auto-complétion', async ({ page }) => {});

  test.skip('teste la formule avant validation', async ({ page }) => {});
});

test.describe('Corbeille et réinitialisation - 2.A.5.g et 2.A.5.h', () => {
  test.skip('supprime des variables sélectionnées', async ({ page }) => {});

  test.skip('supprime des lignes sélectionnées', async ({ page }) => {});

  test.skip('avertit si impact sur visualisations', async ({ page }) => {});

  test.skip('réinitialise aux données d\'origine', async ({ page }) => {});

  test.skip('perd les modifications après réinitialisation', async ({ page }) => {});

  test.skip('perd les visualisations après réinitialisation', async ({ page }) => {});

  test.skip('demande confirmation avant réinitialisation', async ({ page }) => {});

  test.skip('annule la suppression avec Ctrl+Z', async ({ page }) => {});
});

test.describe('Performance avec gros volumes - 2.A.5 & 3.B', () => {
  test.skip('gère un tableau de 10000 lignes avec pagination', async ({ page }) => {});

  test.skip('affiche un loader pendant le traitement', async ({ page }) => {});

  test.skip('tronque les lignes de plus de 2000 caractères', async ({ page }) => {});

  test.skip('optimise l\'affichage avec virtualisation', async ({ page }) => {});

  test.skip('affiche un écran squelette pendant le chargement', async ({ page }) => {});

  test.skip('limite l\'affichage initial à N lignes', async ({ page }) => {});
});