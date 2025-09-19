<script lang="ts">
	import { Duck } from '$lib/duckdb/duckdb.js';
	import { current_table } from '$lib/share_state.svelte.js';
	import Table from '$lib/Table.svelte';
	import Upload from '$lib/Upload.svelte';
	import VizSuggestions from '$lib/VizSuggestions.svelte';
	import { Tab, TabContent, Tabs } from 'carbon-components-svelte';

	interface LoadedFile {
		tablename: string;
		filename: string;
	}

	let tables: LoadedFile[] = $state([]);
	$inspect(tables);
	$effect(() => {
		current_table.value;
		if (Duck) {
			tables = Duck.get_loaded_files();
		}
	});
</script>

<Upload />

<h2>Tableau de Khartis</h2>
<p>
	Les données importées sont chargées dans Duckdb. Ensuite une ou des requêtes sont lancées qui
	renvoient des résultats au format arrow. <br />Le tableau est finalement construit depuis la table
	arrow sous forme d'un <i>infinite scroll</i> par paquet de 12 lignes.
</p>
<Tabs>
	{#each tables as table}
		<Tab label={table.filename} />
	{/each}
	<svelte:fragment slot="content">
		{#each tables as table}
			<TabContent>
				<Table table={table.tablename} />
				<VizSuggestions table={table.tablename} />
			</TabContent>
		{/each}
	</svelte:fragment>
</Tabs>
