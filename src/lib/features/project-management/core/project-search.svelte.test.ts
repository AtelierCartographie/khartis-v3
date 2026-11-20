import { describe, expect, it } from 'vitest';
import type { SerializedProject } from '$lib/types/serialization.types';
import { buildProjectSearchText, matchesProjectSearch } from './project-search';

const project = {
  id: 'p1',
  manifest: {
    version: '3.17.0',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    name: 'Projet 24'
  },
  data: {
    sourceFiles: [{ name: 'filosofi-2023.csv' }],
    basemapSettings: { referenceBasemapId: 'france-departement' },
    visualizationSettings: {
      visualizations: [{ name: 'Taux de pauvreté', valueColumn: 'taux_pct' }]
    },
    layoutSettings: {
      annotations: {
        items: [
          { content: 'Pauvreté en Seine-Saint-Denis' },
          { content: { points: [] } }
        ]
      },
      legend: { items: [{ title: 'Ménages', subtitle: 'menages_col' }] }
    }
  }
} as unknown as SerializedProject;

describe('project search', () => {
  it('should index map texts, files and basemap titles but no column when building the search text', () => {
    const text = buildProjectSearchText(project, (id) =>
      id === 'france-departement' ? ['Départements'] : []
    );

    for (const term of [
      'pauvrete en seine-saint-denis',
      'menages',
      'taux de pauvrete',
      'filosofi-2023.csv',
      'departements'
    ]) {
      expect(text).toContain(term);
    }
    expect(text).not.toContain('france-departement');
    expect(text).not.toContain('taux_pct');
    expect(text).not.toContain('menages_col');
  });

  it('should match only when every query word appears, ignoring case and accents', () => {
    const fields = ['Projet 24', buildProjectSearchText(project)];

    expect(matchesProjectSearch(fields, 'SEINE pauvreté')).toBe(true);
    expect(matchesProjectSearch(fields, 'seine lyon')).toBe(false);
    expect(matchesProjectSearch(fields, '  ')).toBe(true);
  });
});
