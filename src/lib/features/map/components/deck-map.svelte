<script lang="ts">
  import { Deck, OrthographicView } from '@deck.gl/core';
  import * as geodecklayers from '@geoarrow/deck.gl-layers';
  import type { Table as ArrowTable } from 'apache-arrow/Arrow';
  import { onMount } from 'svelte';
  import { getModelMatrix } from '../utils/projection-screen';

  interface DeckMapProps {
    jsTable: ArrowTable;
  }

  let { jsTable }: DeckMapProps = $props();

  let deckgl: Deck<OrthographicView[]>;
  let canvasElement: HTMLCanvasElement;
  let width = $state(0);
  const height = 700;

  function objectToTable(object: Record<string, unknown>): HTMLTableElement {
    const data = Object.entries(object);
    const tbl = document.createElement('table');

    data.forEach((row) => {
      const R = document.createElement('tr');
      row.forEach((cell) => {
        const C = document.createElement('td');
        const Ctext = document.createTextNode(String(cell));
        C.appendChild(Ctext);
        R.appendChild(C);
      });
      tbl.appendChild(R);
    });

    return tbl;
  }

  async function updateMap(jsTable: ArrowTable): Promise<void> {
    const geoMetadata = jsTable.schema.metadata.get('geo');
    if (!geoMetadata) return;

    const jsonMeta = JSON.parse(geoMetadata);
    const geoColumn = jsonMeta.primary_column;
    const geometryType = jsonMeta.columns[geoColumn].geometry_types[0];
    const modelMatrix = getModelMatrix(geoMetadata, [width, height]);

    let deckLayer;
    switch (geometryType.toUpperCase()) {
      case 'POINT':
      case 'MULTIPOINT': {
        const pointChild = jsTable.getChild(geoColumn);
        if (!pointChild) return;
        deckLayer = new geodecklayers.GeoArrowScatterplotLayer({
          id: 'point-layer',
          data: jsTable,
          getPosition: pointChild,
          stroked: true,
          getFillColor: [0, 100, 200],
          getLineColor: [255, 255, 255],
          getRadius: 1,
          radiusScale: 5,
          radiusUnits: 'pixels',
          lineWidthUnits: 'pixels',
          lineWidthScale: 1 / 3,
          lineCapRounded: true,
          pickable: true,
          autoHighlight: true,
          modelMatrix
        });
        break;
      }
      case 'LINESTRING':
      case 'MULTILINESTRING':
        deckLayer = new geodecklayers.GeoArrowPathLayer({
          id: 'line-layer',
          data: jsTable,
          getColor: [0, 100, 200],
          getWidth: 1,
          lineWidthUnits: 'pixels',
          lineWidthScale: 1 / 4,
          lineCapRounded: true,
          pickable: true,
          autoHighlight: true,
          modelMatrix
        });
        break;
      case 'POLYGON':
      case 'MULTIPOLYGON': {
        const polygonChild = jsTable.getChild(geoColumn);
        if (!polygonChild) return;
        deckLayer = new geodecklayers.GeoArrowPolygonLayer({
          id: 'polygon-layer',
          data: jsTable,
          getPolygon: polygonChild,
          getFillColor: [0, 100, 200],
          getLineColor: [255, 255, 255],
          lineWidthUnits: 'pixels',
          lineWidthScale: 1 / 4,
          lineCapRounded: true,
          pickable: true,
          autoHighlight: true,
          modelMatrix
        });
        break;
      }
      default:
        break;
    }

    if (deckgl) {
      deckgl.setProps({
        layers: [deckLayer]
      });
    }
  }

  $effect(() => {
    if (jsTable && width > 0 && deckgl) {
      updateMap(jsTable);
    }
  });

  onMount(async () => {
    const view = new OrthographicView({ id: 'main', flipY: false });
    const initialViewState = {
      main: {
        target: [0, 0, 0] as [number, number, number],
        zoom: 0,
        minZoom: 0
      }
    };

    deckgl = new Deck({
      canvas: canvasElement,
      views: [view],
      initialViewState,
      controller: true,
      getTooltip: ({ picked, object }) => {
        if (!picked) return null;
        const { geom, ...attributes } = object;
        return (
          object && {
            html: objectToTable(attributes).outerHTML
          }
        );
      }
    });

    if (jsTable) {
      await updateMap(jsTable);
    }
  });
</script>

<div class="deck-container" bind:offsetWidth={width}>
  <canvas id="deck-canvas" bind:this={canvasElement}></canvas>
</div>

<style>
  .deck-container {
    position: relative;
    width: 100%;
    height: 700px;
    border: 1px solid var(--cds-border-subtle);
  }

  #deck-canvas {
    width: 100%;
  }
</style>
