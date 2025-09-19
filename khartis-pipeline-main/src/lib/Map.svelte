<script>
	import { onMount } from 'svelte';

	import { Deck, OrthographicView } from '@deck.gl/core';
	import * as geodecklayers from '@geoarrow/deck.gl-layers';
	import { get_model_matrix } from '$lib/projscreen';

	let { jsTable } = $props();

	let deckgl;
	let canvasElement;
	let width,
		height = 700;

	/**
	 * Converts a given object into an HTML table representation.
	 *
	 * @param {Object} object - The object to be converted into a table.
	 * @returns {string} - The HTML string representing the table.
	 */
	function objectToTable(object) {
		const data = Object.entries(object);
		// creates a <table> element and a <tbody> element
		const tbl = document.createElement('table');

		data.forEach((row) => {
			const R = document.createElement('tr');
			row.forEach((cell) => {
				const C = document.createElement('td');
				const Ctext = document.createTextNode(cell);
				C.appendChild(Ctext);
				R.appendChild(C);
			});
			// add the row to the end of the table body
			tbl.appendChild(R);
		});
		return tbl;
	}

	async function updateMap(jsTable) {
		const geo_metadata = jsTable.schema.metadata.get('geo');
		const json_meta = JSON.parse(geo_metadata);
		const geo_column = json_meta.primary_column;
		const geometry_type = json_meta.columns[geo_column].geometry_types[0];
		const model_matrix = get_model_matrix(geo_metadata, [width, height]);

		let deckLayer;
		switch (geometry_type.toUpperCase()) {
			case 'POINT':
			case 'MULTIPOINT':
				deckLayer = new geodecklayers.GeoArrowScatterplotLayer({
					id: 'point-layer',
					data: jsTable,
					getPosition: jsTable.getChild(geo_column),
					stroked: true,
					getFillColor: [0, 100, 200],
					getLineColor: [255, 255, 255],
					// getLineWidth: 0.3,
					getRadius: 1,
					radiusScale: 5,
					radiusUnits: 'pixels',
					lineWidthUnits: 'pixels',
					lineWidthScale: 1 / 3,
					lineCapRounded: true,
					pickable: true,
					autoHighlight: true,
					modelMatrix: model_matrix
				});
				break;
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
					modelMatrix: model_matrix
				});
				break;
			case 'POLYGON':
			case 'MULTIPOLYGON':
				deckLayer = new geodecklayers.GeoArrowPolygonLayer({
					id: 'polygon-layer',
					data: jsTable,
					getPolygon: jsTable.getChild(geo_column),
					getFillColor: [0, 100, 200],
					getLineColor: [255, 255, 255],
					lineWidthUnits: 'pixels',
					lineWidthScale: 1 / 4,
					lineCapRounded: true,
					pickable: true,
					autoHighlight: true, // currently not working with multipolygon
					modelMatrix: model_matrix
				});
				break;
			default:
				break;
		}

		deckgl.setProps({
			layers: [deckLayer]
		});
	}

	$effect(async () => {
		if (jsTable) {
			await updateMap(jsTable);
		}
	});

	onMount(async () => {
		// DECK.GL
		// Orthographic View
		const view = new OrthographicView({ id: 'main', flipY: false });
		const initialViewState = {
			main: {
				target: [0, 0, 0],
				zoom: 0,
				minZoom: 0
			}
		};

		// Deck.gl instance
		deckgl = new Deck({
			canvas: canvasElement,
			views: [view],
			initialViewState,
			controller: true,
			// normal tooltip
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
		border: 1px solid black;
	}
	#deck-canvas {
		width: 100%;
		/* object-fit: contain; */
	}
</style>
