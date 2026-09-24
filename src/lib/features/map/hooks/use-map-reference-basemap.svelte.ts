import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { ProjectionLike } from '@ateliercartographie/geoarrow-deck-stream';
import type { LngLatBoundsLike, Map as MapLibreMap } from 'maplibre-gl';
import { untrack } from 'svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  mapInstanceStore,
  type ViewportFitReason
} from '$lib/features/commons/stores/map-instance.store.svelte';
import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
import { calculateBoundsFromGeoArrow } from '../core';
import { ViewMode } from '../constants/map.constants';
import { basemapService } from '../services/basemap.service.svelte';
import { mapLoadingStore } from '../stores/map-loading.store.svelte';
import { projectionStore } from '../stores/projection.store.svelte';
import type { BBox } from '../types';
import type { BasemapMetadata } from '../types/basemap.types';

interface OrthographicReferenceState {
  bbox: BBox | null;
  isProjected: boolean;
  renderProjection: ProjectionLike | null;
}

export interface UseMapReferenceBasemapProps {
  getIsMapLoaded: () => boolean;
  getViewMode: () => ViewMode;
  getMap: () => MapLibreMap | null;
  getHasData: () => boolean;
  getIsSwitchingViewMode: () => boolean;
  setWorldBaseTable: (table: ArrowTable | null) => void;
  scheduleLayerUpdate: (source?: string) => void;
  fitMapLibreBounds: (bounds: LngLatBoundsLike) => void;
  shouldPreserveManualViewport: () => boolean;
  queueSuggestedPreviewViewportSettled: () => void;
  resolveOrthographicBasemapReferenceState: (
    basemapMeta: BasemapMetadata | null,
    basemapTable: ArrowTable | null
  ) => OrthographicReferenceState;
  requestPendingOrthographicFit: (reason: ViewportFitReason) => void;
  triggerOnReady: () => void;
  onReferenceBasemapLoadComplete: () => void;
}

export interface UseMapReferenceBasemapReturn {
  markInitialLoadingIfNeeded: () => void;
  readonly isLoadingReferenceBasemap: boolean;
}

export function useMapReferenceBasemap(
  props: UseMapReferenceBasemapProps
): UseMapReferenceBasemapReturn {
  let referenceBasemapRequestId = 0;
  let isLoadingReferenceBasemap = $state(false);

  function markInitialLoadingIfNeeded(): void {
    if (basemapStyleStore.referenceBasemapId) {
      isLoadingReferenceBasemap = true;
    }
  }

  $effect(() => {
    const refId = basemapStyleStore.referenceBasemapId;
    const isMapLoaded = props.getIsMapLoaded();
    void isMapLoaded;
    void basemapService.registrationVersion;
    const requestId = ++referenceBasemapRequestId;

    untrack(async () => {
      if (!props.getIsMapLoaded()) {
        return;
      }

      if (requestId !== referenceBasemapRequestId) {
        return;
      }

      if (refId) {
        isLoadingReferenceBasemap = true;
        let shouldReleaseSuggestedPreview = false;
        const cachedGeometryTable =
          basemapService.getCachedGeometryTable(refId);
        if (cachedGeometryTable) {
          props.setWorldBaseTable(cachedGeometryTable);
          props.scheduleLayerUpdate('effect:referenceBasemapCachedHit');
        }
        try {
          const loaded = await basemapService.loadBasemap(refId);
          if (requestId !== referenceBasemapRequestId) {
            return;
          }

          if (loaded) {
            const resolvedBasemap =
              basemapService.getResolvedVariantData(
                loaded.metadata.file,
                loaded.activeSimplificationLevel ?? undefined
              ) ?? loaded;
            props.setWorldBaseTable(resolvedBasemap.geometryTable);
            if (!props.getIsSwitchingViewMode()) {
              if (mapLoadingStore.isHoldingPreviewForSuggestedBasemap) {
                mapLoadingStore.armSuggestedPreviewRelease();
                shouldReleaseSuggestedPreview = true;
              }
              props.scheduleLayerUpdate('effect:referenceBasemapChanged');

              if (props.getViewMode() === ViewMode.MAPLIBRE && props.getMap()) {
                let bounds = calculateBoundsFromGeoArrow(
                  resolvedBasemap.geometryTable
                );
                if (!bounds && resolvedBasemap.metadata.bbox) {
                  const [minLng, minLat, maxLng, maxLat] =
                    resolvedBasemap.metadata.bbox;
                  bounds = [
                    [minLng, minLat],
                    [maxLng, maxLat]
                  ];
                }
                if (bounds) {
                  if (mapInstanceStore.applyPendingMapLibreRestore()) {
                    if (shouldReleaseSuggestedPreview) {
                      props.queueSuggestedPreviewViewportSettled();
                    }
                  } else if (!props.shouldPreserveManualViewport()) {
                    props.fitMapLibreBounds(bounds);
                  } else if (shouldReleaseSuggestedPreview) {
                    props.queueSuggestedPreviewViewportSettled();
                  }
                } else if (shouldReleaseSuggestedPreview) {
                  props.queueSuggestedPreviewViewportSettled();
                }
              } else if (props.getViewMode() === ViewMode.ORTHOGRAPHIC) {
                const referenceState =
                  props.resolveOrthographicBasemapReferenceState(
                    resolvedBasemap.metadata,
                    resolvedBasemap.geometryTable
                  );
                if (referenceState.bbox) {
                  projectionStore.setReferenceBbox(
                    referenceState.bbox,
                    undefined,
                    referenceState.isProjected,
                    referenceState.renderProjection
                  );
                }
                if (!props.shouldPreserveManualViewport()) {
                  if (props.getIsMapLoaded()) {
                    mapInstanceStore.fitToOrthographicBounds('basemap');
                  } else {
                    props.requestPendingOrthographicFit('basemap');
                  }
                }
                if (shouldReleaseSuggestedPreview) {
                  props.queueSuggestedPreviewViewportSettled();
                }
              } else if (shouldReleaseSuggestedPreview) {
                props.queueSuggestedPreviewViewportSettled();
              }
            }
          } else {
            logger.error(
              'Failed to load reference basemap — not found in service',
              LogCategory.MAP,
              { refId }
            );
          }
        } finally {
          if (requestId === referenceBasemapRequestId) {
            isLoadingReferenceBasemap = false;
            if (
              mapLoadingStore.isHoldingPreviewForSuggestedBasemap &&
              !shouldReleaseSuggestedPreview
            ) {
              mapLoadingStore.setHoldingPreviewForSuggestedBasemap(false);
            }
            props.onReferenceBasemapLoadComplete();
          }
        }
      } else if (!props.getHasData()) {
        props.setWorldBaseTable(null);
        props.scheduleLayerUpdate('effect:referenceBasemapCleared');
        props.triggerOnReady();
      } else {
        props.setWorldBaseTable(null);
        props.scheduleLayerUpdate('effect:referenceBasemapCleared');
      }
    });
  });

  return {
    markInitialLoadingIfNeeded,
    get isLoadingReferenceBasemap() {
      return isLoadingReferenceBasemap;
    }
  };
}
