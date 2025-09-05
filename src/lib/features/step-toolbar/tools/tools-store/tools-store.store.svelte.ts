import type { ToolName, ToolState } from './tools-store.types';
import {
  createAnnotationsActions,
  createLayersActions,
  createSearchActions
} from './tools-store.actions.svelte';
import { DEFAULT_STATE } from './tools-store.defaults.svelte';
import {
  getActiveAnnotation,
  getSearchResults,
  getVisibleLayers
} from './tools-store.selectors.svelte';

export const toolState = $state<ToolState>({ ...DEFAULT_STATE });

const searchActions = createSearchActions(toolState);
const layersActions = createLayersActions(toolState);
const annotationsActions = createAnnotationsActions(toolState);

export const toolActions = {
  updateSearch: searchActions.updateSearch,
  updateLayers: layersActions.updateLayers,
  updateFacets(updates: Partial<ToolState['facets']>): void {
    Object.assign(toolState.facets, updates);
    console.log('[Tools] Facets updated:', toolState.facets);
  },
  updateSimplification(updates: Partial<ToolState['simplification']>): void {
    Object.assign(toolState.simplification, updates);
    console.log('[Tools] Simplification updated:', toolState.simplification);
  },
  updateFormat(updates: Partial<ToolState['format']>): void {
    Object.assign(toolState.format, updates);
    console.log('[Tools] Format updated:', toolState.format);
  },
  updateProjection(updates: Partial<ToolState['projection']>): void {
    Object.assign(toolState.projection, updates);
    console.log('[Tools] Projection updated:', toolState.projection);
  },
  updateLegend(updates: Partial<ToolState['legend']>): void {
    Object.assign(toolState.legend, updates);
    console.log('[Tools] Legend updated:', toolState.legend);
  },
  updateGeoIndications(updates: Partial<ToolState['geoIndications']>): void {
    Object.assign(toolState.geoIndications, updates);
    console.log('[Tools] Geo Indications updated:', toolState.geoIndications);
  },
  updateAnnotations: annotationsActions.updateAnnotations,
  updateColorBlindness(updates: Partial<ToolState['colorBlindness']>): void {
    Object.assign(toolState.colorBlindness, updates);
    console.log('[Tools] Color Blindness updated:', toolState.colorBlindness);
  },

  toggleLayerVisibility: layersActions.toggleLayerVisibility,
  reorderLayers: layersActions.reorderLayers,
  addAnnotation: annotationsActions.addAnnotation,
  removeAnnotation: annotationsActions.removeAnnotation,
  performReplace: searchActions.performReplace,

  resetTool(toolName: ToolName): void {
    console.log(`[Tools] Resetting tool: ${toolName}`);
    switch (toolName) {
      case 'search':
        toolState.search = DEFAULT_STATE.search;
        break;
      case 'simplification':
        toolState.simplification = DEFAULT_STATE.simplification;
        break;
      case 'format':
        toolState.format = DEFAULT_STATE.format;
        break;
      default:
        Object.assign(toolState[toolName], DEFAULT_STATE[toolName]);
        break;
    }
  },

  resetAll(): void {
    Object.assign(toolState, DEFAULT_STATE);
    console.log('[Tools] All tools reset to default state');
  },

  logCurrentState(): void {
    console.log(
      '[Tools] Current state:',
      JSON.parse(JSON.stringify(toolState))
    );
  }
};

export function getState(): ToolState {
  return toolState;
}

export function getVisibleLayersFromState() {
  return getVisibleLayers(toolState);
}

export function getSearchResultsFromState() {
  return getSearchResults(toolState);
}

export function getActiveAnnotationFromState() {
  return getActiveAnnotation(toolState);
}

export { getActiveAnnotation, getSearchResults, getVisibleLayers };
