import { expect, test } from '@playwright/test';

test.describe('Géolocalisation des données - 2.A.6', () => {
  test.skip('reconnaît automatiquement les entités administratives', async ({ page }) => {});

  test.skip('reconnaît automatiquement les coordonnées géographiques', async ({ page }) => {});

  test.skip('permet de corriger la détection automatique', async ({ page }) => {});

  test.skip('définit une référence géographique', async ({ page }) => {});

  test.skip('lie les variables à la référence', async ({ page }) => {});
});

test.describe('Jointure à un fond de carte - 2.A.7', () => {
  test.skip('superpose les coordonnées sur OpenStreetMap', async ({ page }) => {});

  test.skip('joint les données à un fond du catalogue', async ({ page }) => {});

  test.skip('joint les données à un fond importé', async ({ page }) => {});
});

test.describe('Suggestions de fonds de carte - 2.A.7.a', () => {
  test.skip('propose des fonds selon les données', async ({ page }) => {});

  test.skip('affiche les vignettes des suggestions', async ({ page }) => {});

  test.skip('affiche le titre du fond', async ({ page }) => {});

  test.skip('affiche le niveau de découpage', async ({ page }) => {});

  test.skip('affiche l\'année du fond', async ({ page }) => {});

  test.skip('affiche la source du fond', async ({ page }) => {});

  test.skip('affiche le taux de correspondance', async ({ page }) => {});

  test.skip('trie par taux de correspondance', async ({ page }) => {});
});

test.describe('Catalogue de fonds de carte - 2.A.7.b', () => {
  test.skip('affiche tous les fonds disponibles', async ({ page }) => {});

  test.skip('affiche les vignettes du catalogue', async ({ page }) => {});

  test.skip('recherche avec auto-complétion', async ({ page }) => {});

  test.skip('filtre par années', async ({ page }) => {});

  test.skip('suggère l\'ajout de nouveaux fonds', async ({ page }) => {});

  test.skip('ouvre le formulaire de suggestion', async ({ page }) => {});
});

test.describe('Jointure assistée - 2.A.7.c', () => {
  test.skip('affiche les catégories de jointure', async ({ page }) => {});

  test.skip('compte les entités jointes', async ({ page }) => {});

  test.skip('compte les entités à vérifier', async ({ page }) => {});

  test.skip('compte les entités non uniques', async ({ page }) => {});

  test.skip('compte les entités non reconnues', async ({ page }) => {});

  test.skip('classe par criticité', async ({ page }) => {});

  test.skip('permet de corriger les identifiants', async ({ page }) => {});

  test.skip('remplace dans le tableau de données', async ({ page }) => {});
});

test.describe('Import de fonds de carte - 2.A.7.d', () => {
  test.skip('importe un fichier géographique comme fond', async ({ page }) => {});

  test.skip('accepte les formats standards', async ({ page }) => {});

  test.skip('réalise la jointure avec données tabulaires', async ({ page }) => {});

  test.skip('affiche le module de jointure assistée', async ({ page }) => {});
});

test.describe('Fond OpenStreetMap - 2.A.7.e', () => {
  test.skip('superpose les coordonnées sur OSM', async ({ page }) => {});

  test.skip('personnalise le style OSM', async ({ page }) => {});

  test.skip('active OSM pour données avec lat/lon', async ({ page }) => {});
});

test.describe('Enrichir un fichier géographique - 2.A.8', () => {
  test.skip('joint des données tabulaires au fichier géo', async ({ page }) => {});

  test.skip('affiche l\'aperçu du tableau importé', async ({ page }) => {});

  test.skip('choisit les variables communes', async ({ page }) => {});

  test.skip('réalise la jointure assistée', async ({ page }) => {});

  test.skip('affiche les données jointes dans l\'aperçu', async ({ page }) => {});
});

test.describe('Aperçu de la carte - 2.A.9', () => {
  test.skip('affiche la carte au centre de l\'interface', async ({ page }) => {});

  test.skip('utilise le premier fond suggéré', async ({ page }) => {});

  test.skip('affiche un planisphère par défaut', async ({ page }) => {});

  test.skip('affiche les infobulles au survol', async ({ page }) => {});

  test.skip('affiche les infobulles au toucher mobile', async ({ page }) => {});

  test.skip('affiche les variables de visualisation en premier', async ({ page }) => {});

  test.skip('regroupe les autres variables en accordéon', async ({ page }) => {});

  test.skip('zoom sur la page', async ({ page }) => {});

  test.skip('zoom sur la carte', async ({ page }) => {});

  test.skip('ajuste automatiquement le fond par défaut', async ({ page }) => {});
});