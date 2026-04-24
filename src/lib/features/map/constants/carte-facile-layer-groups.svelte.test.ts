import { describe, expect, it } from 'vitest';
import {
  getDefaultVisibility,
  getStyleConfig
} from './carte-facile-layer-groups';

describe('Carte Facile layer groups', () => {
  it('keeps core vector groups visible by default for world color styles', () => {
    const config = getStyleConfig('monde-couleurs');

    expect(config).toBeDefined();
    expect(getDefaultVisibility(config!)).toMatchObject({
      streets: true,
      boundaries: true,
      labels: true
    });
  });

  it('keeps France administrative overlays opt-in', () => {
    const config = getStyleConfig('france-couleurs');

    expect(config).toBeDefined();
    expect(getDefaultVisibility(config!)).toMatchObject({
      boundaries: true,
      admin_boundaries: false,
      cadastre: false
    });
  });
});
