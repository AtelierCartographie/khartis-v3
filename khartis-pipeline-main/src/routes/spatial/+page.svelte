<script lang="ts">
	import Map from '$lib/Map.svelte';
	import { Duck } from '$lib/duckdb/duckdb';
	import { read_geoparquet } from '$lib/geoparquet';
	import type { Table as ArrowTable } from 'apache-arrow/Arrow';
	import { onMount } from 'svelte';

	interface LoadedFile {
		tablename: string;
		filename: string;
	}

	interface TableInfo {
		table_name: string;
	}

	interface UIState {
		selected_dataset: string | null;
		isLoading: boolean;
		jsTable: ArrowTable | null;
	}

	let datasets_list: LoadedFile[] = $state([]);
	let ui_state: UIState = $state({
		selected_dataset: null,
		isLoading: true,
		jsTable: null
	});

	async function filter_datasets_with_geometry(): Promise<LoadedFile[]> {
		try {
			const with_geom = (await Duck!.query(
				`FROM information_schema.columns
					 SELECT table_name
					 WHERE column_name = 'geom' OR column_name = 'geometry' AND data_type = 'GEOMETRY'`,
				{ format: 'array' }
			)) as TableInfo[];
			const datasets = Duck!.get_loaded_files();
			const filtered = datasets.filter((dataset) =>
				with_geom.map((d) => d.table_name).includes(dataset.tablename)
			);
			return filtered;
		} catch (error) {
			console.error('Error filtering datasets with geometry:', error);
			return [];
		}
	}

	async function geofile_to_geoarrow_memory(
		geofile: string,
		options: { source?: 'duckdb' | 'file' } = {}
	): Promise<ArrowTable> {
		let { source = 'duckdb' } = options;
		if (source === 'duckdb') {
			const buffer = await Duck!.copy_to_geoparquet_as_buffer(geofile);
			const jsTable = await read_geoparquet(buffer.buffer as ArrayBuffer);
			return jsTable;
		}
		// Cas où le geofile est un fichier
		// TODO : gérer un geoparquet classique, un geoparquet encodé en GeoArrow ou directement un Arrow IPC file
		if (source === 'file') {
			const response = await fetch(geofile);
			const arrayBuffer = await response.arrayBuffer();
			const jsTable = await read_geoparquet(arrayBuffer);
			return jsTable;
		}
		throw new Error(`Unsupported source: ${source}`);
	}

	async function handleDatasetChange(event: Event): Promise<void> {
		const target = event.target as HTMLSelectElement;
		ui_state.selected_dataset = target.value;
		ui_state.jsTable = await geofile_to_geoarrow_memory(ui_state.selected_dataset);
	}

	onMount(async () => {
		try {
			datasets_list = await filter_datasets_with_geometry();
			if (datasets_list.length > 0) {
				ui_state.selected_dataset = datasets_list[0].tablename;
				ui_state.jsTable = await geofile_to_geoarrow_memory(ui_state.selected_dataset);
			}
		} finally {
			ui_state.isLoading = false;
		}
	});
</script>

<h2>Rendu carto avec Deck.gl</h2>

{#if ui_state.isLoading}
	<p>Chargement des données...</p>
{:else if datasets_list.length > 0}
	<p>Choisir un fond déjà importé</p>
	<select onchange={handleDatasetChange} bind:value={ui_state.selected_dataset}>
		{#each datasets_list as { tablename, filename }}
			<option value={tablename}>{filename}</option>
		{/each}
	</select>
	{#if ui_state.jsTable}
		<Map jsTable={ui_state.jsTable} />
	{/if}
{:else}
	<p>Aucun jeu de données géométrique chargé.</p>
{/if}

<style>
</style>
