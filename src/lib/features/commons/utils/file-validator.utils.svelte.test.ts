import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileValidator } from './file-validator.utils';
import * as m from '$lib/paraglide/messages';

describe('file-validator utils', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function shapefilePart(name: string): File {
    return new File(['shape-part'], name, {
      type: 'application/octet-stream'
    });
  }

  it('warns when CSV content has no supported separator', async () => {
    const file = new File(['name\nParis\nLyon'], 'names.csv', {
      type: 'text/csv'
    });
    const initialResult = FileValidator.validate(file);

    const result = await FileValidator.validateAsync(file, initialResult);

    expect(result.warnings).toContain(m.validation_csv_no_separator());
  });

  it('marks a shapefile group invalid when required sidecars are missing', () => {
    const result = FileValidator.validateMultiple([shapefilePart('roads.shp')]);
    const message = m.shapefile_incomplete_message({
      missing: '.shx, .dbf'
    });

    expect(result.isValid).toBe(false);
    expect(result.globalErrors).toContain(message);
    expect(result.results.get('roads.shp')?.errors).toContain(message);
  });

  it('accepts a shapefile group with .shp, .shx, and .dbf components', () => {
    const result = FileValidator.validateMultiple([
      shapefilePart('roads.shp'),
      shapefilePart('roads.shx'),
      shapefilePart('roads.dbf')
    ]);

    expect(result.globalErrors).toEqual([]);
    expect(result.isValid).toBe(true);
  });

  it('allows loopback dataset URLs when the app is running from a local preview', () => {
    vi.stubGlobal('window', {
      location: {
        hostname: '127.0.0.1',
        href: 'http://127.0.0.1:4176/',
        pathname: '/'
      }
    });

    const result = FileValidator.validateURL(
      'http://127.0.0.1:4176/tests-datasets/csv/world-bank-rural-pop.csv'
    );

    expect(result.isValid).toBe(true);
    expect(result.errors).not.toContain(m.validation_url_domain_blocked());
  });

  it('blocks loopback dataset URLs when the app is running from production', () => {
    vi.stubGlobal('window', {
      location: {
        hostname: 'www.sciencespo.fr',
        href: 'https://www.sciencespo.fr/cartographie/khartis/',
        pathname: '/cartographie/khartis/'
      }
    });

    const result = FileValidator.validateURL(
      'http://127.0.0.1:4176/tests-datasets/csv/world-bank-rural-pop.csv'
    );

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain(m.validation_url_domain_blocked());
  });
});
