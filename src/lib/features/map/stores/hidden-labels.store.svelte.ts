import type { Layer } from '@deck.gl/core';
import type { HiddenReason } from '@ateliercartographie/label-placer';

import { globalState } from '$lib/features/commons/stores/global.svelte';
import { ToolbarStep } from '$lib/features/commons/types/global';

import type { LabelOffset } from '../utils/label-layout.utils';

import { labelLayoutStore } from './label-layout.store.svelte';

/** A label the automatic placement hid, in page pixels of the map area. */
export interface HiddenLabel {
  featureKey: string;
  text: string;
  reason: HiddenReason;
  /** Names of the labels on the spot it would get, for `labels`. */
  by: string[];
  anchor: LabelOffset;
  symbolRadius: number;
  /** Outline of the area it names, if any. */
  rings?: LabelOffset[][];
  /** Where its block would sit by default: x0, y0, x1, y1. */
  box: [number, number, number, number];
}

export interface LabelPlacementReport {
  vizId: string;
  /** Labels with a text, symbols alone left out. */
  labelCount: number;
  hidden: HiddenLabel[];
  overlapping: number;
  pageDisplayScale: number;
  /** Ghosts of the given hidden labels, drawn over the map. */
  buildGhosts: (featureKeys: ReadonlySet<string>) => Layer[];
  /** Block centre to pin a hidden label at, relative to its anchor. */
  resolveShownCenter: (featureKey: string) => LabelOffset | null;
}

interface HoveredHiddenLabel {
  vizId: string;
  featureKey: string;
}

/** Pointer slack around a symbol or a ghost, in page pixels. */
const HOVER_SLACK_PX = 4;

function isInsideRings(rings: LabelOffset[][], [x, y]: LabelOffset): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}

function hitsLabel(label: HiddenLabel, point: LabelOffset): boolean {
  const [x, y] = point;
  const [x0, y0, x1, y1] = label.box;
  if (
    x >= x0 - HOVER_SLACK_PX &&
    x <= x1 + HOVER_SLACK_PX &&
    y >= y0 - HOVER_SLACK_PX &&
    y <= y1 + HOVER_SLACK_PX
  ) {
    return true;
  }
  if (label.symbolRadius > 0) {
    return (
      Math.hypot(x - label.anchor[0], y - label.anchor[1]) <=
      label.symbolRadius + HOVER_SLACK_PX
    );
  }
  return label.rings ? isInsideRings(label.rings, point) : false;
}

/**
 * The labels the automatic placement hid, by visualization, and their ghosts
 * in the Styling step: the hovered one, or all of them on request. A ghost is
 * dragged like a label, which pins it where it is dropped.
 */
function createHiddenLabelsStore() {
  let reports = $state.raw<Record<string, LabelPlacementReport>>({});
  let revealAll = $state(false);
  let hovered = $state.raw<HoveredHiddenLabel | null>(null);

  const ghostLayers = $derived.by((): Layer[] => {
    if (
      globalState.selectedStep !== ToolbarStep.Styling ||
      globalState.isMapExporting
    ) {
      return [];
    }
    const dragged = labelLayoutStore.draggedLabel;
    return Object.values(reports).flatMap((report) => {
      const keys = new Set(
        report.hidden
          .map((label) => label.featureKey)
          .filter(
            (key) =>
              (revealAll ||
                (hovered?.vizId === report.vizId &&
                  hovered.featureKey === key)) &&
              !(dragged?.vizId === report.vizId && dragged.featureKey === key)
          )
      );
      return keys.size > 0 ? report.buildGhosts(keys) : [];
    });
  });

  function report(vizId: string, next: LabelPlacementReport | null): void {
    if (!next && !(vizId in reports)) return;
    const updated = { ...reports };
    if (next) updated[vizId] = next;
    else delete updated[vizId];
    reports = updated;
  }

  function findHidden(vizId: string, featureKey: string): HiddenLabel | null {
    return (
      reports[vizId]?.hidden.find((label) => label.featureKey === featureKey) ??
      null
    );
  }

  /**
   * Follows the pointer, in pixels of the map container: a label picked
   * there wins, else the hidden label whose area, symbol or ghost is under it.
   */
  function updateHover(
    point: LabelOffset,
    picked: HoveredHiddenLabel | null
  ): void {
    let next: HoveredHiddenLabel | null = null;
    if (picked) {
      next = findHidden(picked.vizId, picked.featureKey) ? picked : null;
    } else {
      for (const report of Object.values(reports)) {
        const scale = report.pageDisplayScale > 0 ? report.pageDisplayScale : 1;
        const pagePoint: LabelOffset = [point[0] / scale, point[1] / scale];
        // Symbols and ghosts before areas: they lie over the areas.
        const label =
          report.hidden.find(
            (candidate) => !candidate.rings && hitsLabel(candidate, pagePoint)
          ) ??
          report.hidden.find(
            (candidate) => candidate.rings && hitsLabel(candidate, pagePoint)
          );
        if (label) {
          next = { vizId: report.vizId, featureKey: label.featureKey };
          break;
        }
      }
    }
    if (
      next?.vizId === hovered?.vizId &&
      next?.featureKey === hovered?.featureKey
    ) {
      return;
    }
    hovered = next;
  }

  function clearHover(): void {
    if (hovered) hovered = null;
  }

  /** Pins a hidden label where the engine would set it if it had to. */
  function show(vizId: string, featureKey: string): void {
    const center = reports[vizId]?.resolveShownCenter(featureKey);
    if (center) labelLayoutStore.setOffset(vizId, featureKey, center);
  }

  return {
    get ghostLayers(): Layer[] {
      return ghostLayers;
    },
    get revealAll(): boolean {
      return revealAll;
    },
    setRevealAll(value: boolean): void {
      revealAll = value;
    },
    getReport(vizId: string): LabelPlacementReport | null {
      return reports[vizId] ?? null;
    },
    isHidden(vizId: string, featureKey: string): boolean {
      return findHidden(vizId, featureKey) !== null;
    },
    report,
    updateHover,
    clearHover,
    show
  };
}

export const hiddenLabelsStore = createHiddenLabelsStore();
