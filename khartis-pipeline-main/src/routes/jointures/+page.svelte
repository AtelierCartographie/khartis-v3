<script lang="ts">
	import { Duck } from '$lib/duckdb/duckdb';

	interface LoadedFile {
		tablename: string;
		filename: string;
	}

	interface UIState {
		selected_dataset: string;
	}

	let datasets_list: LoadedFile[] = $state(Duck?.get_loaded_files() || []);

	let ui_state: UIState = $state({
		selected_dataset: datasets_list[0]?.tablename || ''
	});

	function get_list_tables(): string[] {
		return [...(Duck?.loaded_files.keys() || [])];
	}
</script>

<h2>Jointures</h2>

{#if datasets_list.length > 0}
	<p>Choisir un jeu de données déjà importé</p>
	<select bind:value={ui_state.selected_dataset}>
		{#each datasets_list as { tablename, filename }}
			<option value={tablename}>{filename}</option>
		{/each}
	</select>
{:else}
	<p>Aucun jeu de données n'est présent. Veuillez charger un dataset depuis la page d'accueil.</p>
{/if}
