import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import BasemapOsmTab from './basemap-osm-tab.svelte';

vi.mock('$lib/features/map/stores/osm-basemap.store.svelte', () => ({
  osmBasemapStore: {
    get isActive() {
      return false;
    }
  }
}));

vi.mock('$lib/paraglide/messages', () => ({
  osm_description: () => 'OpenStreetMap is a collaborative project...',
  osm_modal_gps_required_title: () => 'GPS Coordinates Required',
  osm_modal_gps_required_subtitle: () =>
    'To use OpenStreetMap, your data must contain latitude and longitude columns.',
  osm_basemap_title: () => 'OpenStreetMap Basemap Active',
  osm_basemap_description: () => 'The OpenStreetMap basemap is now active.',
  osm_modal_button_add: () => 'Add to project',
  osm_customization_note: () =>
    'This basemap can be customized in the Visualize step',
  step_visualize: () => 'Visualize',
  learn_more: () => 'Learn more',
  osm_learn_more: () => 'Learn more about OpenStreetMap data'
}));

afterEach(cleanup);

describe('BasemapOsmTab', () => {
  const mockOnSelectOSM = vi.fn();
  const mockOnGoToVisualize = vi.fn();

  const defaultProps = {
    hasGPSCoordinates: false,
    onSelectOSM: mockOnSelectOSM,
    onGoToVisualize: mockOnGoToVisualize
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when GPS coordinates are not available', () => {
    it('displays a warning notification', () => {
      render(BasemapOsmTab, { props: defaultProps });

      expect(screen.getByText('GPS Coordinates Required')).toBeTruthy();
      expect(
        screen.getByText(
          'To use OpenStreetMap, your data must contain latitude and longitude columns.'
        )
      ).toBeTruthy();
    });

    it('does not show the add button', () => {
      const { container } = render(BasemapOsmTab, { props: defaultProps });

      expect(container.querySelector('.bx--btn--primary')).toBeNull();
    });
  });

  describe('when GPS coordinates are available and OSM is not active', () => {
    it('displays the add button', () => {
      render(BasemapOsmTab, {
        props: {
          ...defaultProps,
          hasGPSCoordinates: true
        }
      });

      expect(screen.getByText('Add to project')).toBeTruthy();
    });

    it('does not display the warning notification', () => {
      render(BasemapOsmTab, {
        props: {
          ...defaultProps,
          hasGPSCoordinates: true
        }
      });

      expect(screen.queryByText('GPS Coordinates Required')).toBeNull();
    });
  });

  describe('navigation to visualize step', () => {
    it('displays a link to the visualize step', () => {
      render(BasemapOsmTab, { props: defaultProps });

      expect(screen.getByText('Visualize')).toBeTruthy();
    });
  });

  describe('learn more link', () => {
    it('displays a link to learn more about OSM', () => {
      render(BasemapOsmTab, { props: defaultProps });

      expect(
        screen.getByText('Learn more about OpenStreetMap data')
      ).toBeTruthy();
    });

    it('links to the documentation', () => {
      const { container } = render(BasemapOsmTab, { props: defaultProps });

      const learnMoreLink = container.querySelector(
        'a[href="https://www.sciencespo.fr/cartographie/khartis/docs/data"]'
      );
      expect(learnMoreLink).not.toBeNull();
      expect(learnMoreLink?.getAttribute('target')).toBe('_blank');
    });
  });
});
