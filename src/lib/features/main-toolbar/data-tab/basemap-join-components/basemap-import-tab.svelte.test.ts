import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BasemapImportTab from './basemap-import-tab.svelte';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';

afterEach(cleanup);

const mockBasemap: BasemapMetadata = {
  file: 'custom-basemap-123',
  title: 'Custom Imported Basemap',
  description: 'A custom basemap imported by user',
  source: 'User Upload',
  date: '2025',
  bbox: [0, 0, 10, 10],
  projection: 'WGS84',
  layers: [],
  isCustom: true
};

describe('BasemapImportTab', () => {
  const defaultProps = {
    importedBasemap: null as BasemapMetadata | null,
    importError: null as string | null,
    importUploading: false,
    onFileDrop: vi.fn(),
    onFileInputChange: vi.fn(),
    onLoadUrl: vi.fn()
  };

  it('renders dropzone when no basemap imported', () => {
    const { container } = render(BasemapImportTab, { props: defaultProps });
    expect(container.querySelector('.dropzone')).not.toBeNull();
  });

  it('does not show imported basemap section when null', () => {
    const { container } = render(BasemapImportTab, { props: defaultProps });
    expect(container.querySelector('.imported-basemap-section')).toBeNull();
  });

  it('shows imported basemap as selected card when imported', () => {
    const { container } = render(BasemapImportTab, {
      props: {
        ...defaultProps,
        importedBasemap: mockBasemap
      }
    });

    const importedSection = container.querySelector(
      '.imported-basemap-section'
    );
    expect(importedSection).not.toBeNull();

    const basemapCard = container.querySelector('.basemap-card.selected');
    expect(basemapCard).not.toBeNull();
  });

  it('displays custom basemap title in card', () => {
    render(BasemapImportTab, {
      props: {
        ...defaultProps,
        importedBasemap: mockBasemap
      }
    });

    expect(screen.getByText('Custom Imported Basemap')).toBeTruthy();
  });

  it('shows error notification when importError is set', () => {
    render(BasemapImportTab, {
      props: {
        ...defaultProps,
        importError: 'Failed to import basemap'
      }
    });

    expect(screen.getByText('Failed to import basemap')).toBeTruthy();
  });

  it('shows loading state when importUploading is true', () => {
    const { container } = render(BasemapImportTab, {
      props: {
        ...defaultProps,
        importUploading: true
      }
    });

    const urlButton = container.querySelector(
      '.url-import-row button[disabled]'
    );
    expect(urlButton).not.toBeNull();
  });

  describe('custom basemap selection state', () => {
    it('renders basemap card with selected=true attribute', () => {
      const { container } = render(BasemapImportTab, {
        props: {
          ...defaultProps,
          importedBasemap: mockBasemap
        }
      });

      const selectedCard = container.querySelector('.basemap-card.selected');
      expect(selectedCard).not.toBeNull();
      expect(selectedCard?.getAttribute('aria-pressed')).toBe('true');
    });

    it('uses blue variant for selected custom basemap', () => {
      const { container } = render(BasemapImportTab, {
        props: {
          ...defaultProps,
          importedBasemap: mockBasemap
        }
      });

      const blueCard = container.querySelector(
        '.basemap-card.variant-blue.selected'
      );
      expect(blueCard).not.toBeNull();
    });

    it('does not show match score for imported basemap', () => {
      const { container } = render(BasemapImportTab, {
        props: {
          ...defaultProps,
          importedBasemap: mockBasemap
        }
      });

      const matchSection = container.querySelector('.match-section');
      expect(matchSection).toBeNull();
    });
  });
});
