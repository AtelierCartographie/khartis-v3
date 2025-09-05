import {
  SimplificationLevel,
  SimplificationSource,
  TextAlign
} from '$lib/features/commons/types/enums';
import type { ToolState } from './tools-store.types';

export const DEFAULT_STATE: ToolState = {
  search: {
    searchValue: '',
    selectedSource: 'all',
    replaceValue: '',
    results: [],
    currentResultIndex: 0,
    isSearching: false,
    caseSensitive: false,
    wholeWord: false,
    useRegex: false
  },
  layers: {
    layers: [
      {
        id: 'texts',
        name: 'Texts',
        visible: true,
        type: 'visualization',
        color: '#22c55e',
        order: 0
      },
      {
        id: 'symbols',
        name: 'Symbols',
        visible: true,
        type: 'visualization',
        color: '#22c55e',
        order: 1
      },
      {
        id: 'borders',
        name: 'Borders',
        visible: true,
        type: 'geographic',
        color: '#dc2626',
        order: 2
      },
      {
        id: 'equator',
        name: 'Equator',
        visible: false,
        type: 'geographic',
        color: '#dc2626',
        order: 3
      }
    ],
    expandedSections: { visualization: true, geographic: false },
    dragState: {
      dragIndex: null,
      dragOverIndex: null,
      isDragging: false
    }
  },
  facets: {
    variables: ['Population', 'GDP', 'Area', 'Density'],
    selectedVariables: [],
    collections: [],
    layout: 'grid',
    spacing: 16
  },
  simplification: {
    source: SimplificationSource.Basemap,
    level: SimplificationLevel.Medium,
    rate: 50,
    isProcessing: false
  },
  format: {
    mode: 'preset',
    model: 'page-a4-landscape',
    width: 842,
    height: 595,
    color: { hue: 180, saturation: 50, lightness: 50 },
    margins: { top: 32, bottom: 32, left: 32, right: 32 },
    gridEnabled: true
  },
  projection: {
    selected: 'mercator',
    viewMode: 'list',
    longitude: 0,
    latitude: 0,
    rotation: 0
  },
  legend: {
    items: [
      {
        id: 'legend-1',
        name: 'Population',
        visible: true,
        title: 'Population par région',
        subtitle: "En milliers d'habitants",
        note: 'Données 2023'
      },
      {
        id: 'legend-2',
        name: 'PIB',
        visible: true,
        title: 'PIB par habitant',
        subtitle: 'En euros',
        note: 'Source: INSEE'
      }
    ],
    position: 'top-right',
    visible: true,
    style: {
      fontFamily: 'Cabin',
      fontSize: 12,
      background: {
        enabled: true,
        color: { hue: 180, saturation: 50, lightness: 50 },
        opacity: 100
      }
    },
    activeTab: 'content'
  },
  geoIndications: {
    scale: {
      enabled: false,
      style: 'line',
      distance: 2000,
      units: 'kilometers',
      color: { hue: 180, saturation: 50, lightness: 50 },
      expanded: true
    },
    orientation: {
      enabled: false,
      style: 'arrow',
      size: 10,
      color: { hue: 360, saturation: 50, lightness: 50 }
    },
    insetMap: {
      enabled: false,
      type: 'globe',
      size: 40,
      windowColor: { hue: 180, saturation: 50, lightness: 50 },
      zoom: 50,
      contrast: 50
    }
  },
  annotations: {
    items: [],
    selectedId: null,
    activeType: 'text',
    predefinedStyle: 'default',
    textContent: '',
    defaultStyle: {
      font: 'cabin',
      fontSize: 14,
      bold: false,
      italic: false,
      underlined: false,
      textAlign: TextAlign.Left,
      opacity: 100,
      color: '#000000'
    }
  },
  colorBlindness: {
    simulationType: 'none',
    enabled: false
  }
};
