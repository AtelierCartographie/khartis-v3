<script>
	import { Duck } from '$lib/duckdb/duckdb';
	import { OverflowMenu, OverflowMenuItem } from 'carbon-components-svelte';
	import { onMount } from 'svelte';
	import { create_summary_plot } from './duckdb/summary-plot';
	import SummaryPlot from './duckdb/SummaryPlot.svelte';

	let {
		table, // duckdb table name
		ids_highlight = [5, 8], // array of row id to be highlighted
		...rest
	} = $props();

	let root; // reference to the html table element
	let columns = $state(); // columns of the duckdb table as an array of objects
	let numRows = $state(); // row count of the duckdb table

	let arrow_table = $state(Duck.get_data(table, { geometry: false }));
	let arrow_table_natural = $state();
	$effect(() => {
		arrow_table_natural = arrow_table;
	});

	const row_height = 28; // Assuming a fixed row height
	const max_show_rows = 12.5; // Maximum number of rows to be displayed at a time
	const max_height = (max_show_rows + 1) * row_height; // Maximum height of the table
	let start_index = 0; // Index de départ pour les lignes visibles
	let offset_rows = 1; // Offset for the rows to be displayed
	let rows = $state([]); // Indexes of rows to be displayed

	// INFINITE SCROLL UP AND DOWN
	function create_index_array(length, start = 0) {
		return Array.from({ length }, (_, i) => i + start);
	}
	// Initialiser les lignes visibles à partir de start_index
	function initializeRows(start) {
		// When close to table end, only add remaining rows
		const end = numRows - start;
		const length = Math.min(end, max_show_rows * 2);
		rows = create_index_array(length, start);
	}
	// Infinite scroll
	function addScroll() {
		// TODO ---------- définir via des constantes le cas scroll down et scroll hight
		// pour être plus explicite
		// console.log(rows.length);
		// console.log('is scroll high', root.scrollTop <= 0 && start_index > 0);
		if (
			root.scrollHeight - root.clientHeight - root.scrollTop < 1 &&
			rows[rows.length - 1] + 1 < numRows
		) {
			// Scroll down
			console.log('scroll down');
			const end_index = rows[rows.length - 1] + 1;
			const new_end_index = Math.min(numRows, end_index + 13);
			const new_length = new_end_index - end_index;
			const more_rows = create_index_array(new_length, end_index);
			rows = rows.concat(more_rows);
		} else if (root.scrollTop <= 0 && start_index > 0) {
			// Scroll hight
			console.log('scroll high');
			const new_start_index = Math.max(0, start_index - 13);
			const new_length = start_index - new_start_index;
			const new_rows = create_index_array(new_length, new_start_index);
			rows = new_rows.concat(rows);
			start_index = new_start_index;
			root.scrollTop = start_index * row_height;
		}
	}

	// sort table and handle button color
	function sort_table(event, column, order) {
		// get button color
		let color = event.target.style.color;
		root.querySelectorAll('th .sort-button button').forEach((button) => {
			button.style.color = 'grey';
		});
		if (color === 'white') {
			// restore natural order
			arrow_table = arrow_table_natural;
		} else {
			// sort by column with order
			event.target.style.color = 'white';
			arrow_table = Duck.sort_table(table, column, order);
		}
	}

	// Méthode pour faire défiler le tableau jusqu'à la ligne avec l'ID spécifié
	function goToId(id) {
		if (numRows === undefined || id > numRows) return;

		const index = id - 1; // 0-based index
		if (index !== -1) {
			start_index = Math.max(0, index - offset_rows);
			initializeRows(start_index);
			const scrollPosition = offset_rows * row_height;
			root.scrollTop = scrollPosition;
		}
	}

	onMount(async () => {
		console.log('Table onMount');
		columns = await Duck.analyse(table);
		console.log('after analyse');
		columns = columns.filter((d) => d.name !== 'geom');
		console.log(columns);
		numRows = await Duck.get_row_count(table);
		initializeRows(start_index);
	});

	// Si besoin d'utiliser goToId()
	$effect(() => {
		console.log('effect');
		numRows;
		if (ids_highlight.length > 0) goToId(ids_highlight[0]);
	});
</script>

{#if numRows}
	<p>Les données contiennent {numRows.toLocaleString()} lignes</p>
{/if}
<p>Le tableau contient actuellement <b>{rows.length.toLocaleString()}</b> lignes</p>

<table bind:this={root} onscroll={addScroll} style="max-height: {max_height}px;">
	<thead>
		<tr>
			{#each columns as column}
				{@const name = column.name}
				<th scope="col">
					<div class="col-header">
						<div>
							<!-- <p>{name}</p> -->
							<div class="col-title">
								<p>{name}</p>
								<OverflowMenu menuOptionsClass="col-menu">
									<OverflowMenuItem
										text="Renommer"
										onclick={async () => (
											await Duck.rename_column(table, name, `${name}_new`),
											// NEED TO ANALYSE AGAIN AND RELOAD DATA
											(columns = await Duck.analyse(table))
										)}
									/>
									<OverflowMenuItem
										text="Changer le type"
										onclick={async () => (
											await Duck.change_column_type(table, name, 'VARCHAR'),
											// NEED TO ANALYSE AGAIN AND RELOAD DATA
											(columns = await Duck.analyse(table))
										)}
									/>
									<OverflowMenuItem
										text="Changer la casse"
										onclick={async () => (
											await Duck.change_column_case(table, name, 'UPPER'),
											// NEED TO ANALYSE AGAIN AND RELOAD DATA
											(columns = await Duck.analyse(table))
										)}
									/>
									<OverflowMenuItem
										text="Supprimer"
										onclick={async () => (
											await Duck.drop_column(table, name),
											// NEED TO ANALYSE AGAIN AND RELOAD DATA
											(columns = await Duck.analyse(table))
										)}
									/>
								</OverflowMenu>
							</div>
						</div>
						<div class="sort-button">
							<button onclick={(e) => sort_table(e, name, 'ASC')}>▲</button>
							<button onclick={(e) => sort_table(e, name, 'DESC')}>▼</button>
						</div>
					</div>
					<div class="summary-plot">
						<SummaryPlot svgElement={create_summary_plot(column)} />
					</div>
				</th>
			{/each}
		</tr>
	</thead>
	<tbody>
		{#await arrow_table}
			<!-- SKELETON TABLE -->
			{#each rows as row}
				<tr>
					{#each columns as column}
						<td><div class="placeholder"></div></td>
					{/each}
				</tr>
			{/each}
		{:then arrow_tb}
			<!-- TABLE WITH DATA -->
			{#each rows as row}
				{@const id = arrow_tb.get(row)['__id']}
				<tr class:id-highlight={ids_highlight.includes(id)}>
					{#each columns as { name, type, type_simple }}
						{@const value = arrow_tb.get(row)[name]}
						{@const is_numeric = type_simple === 'numeric' ? true : false}
						{@const is_date = type_simple === 'date' ? true : false}
						<td class:numeric={is_numeric}
							>{!value ? null : is_date ? value.toLocaleDateString() : value.toLocaleString()}</td
						>
					{/each}
				</tr>
			{/each}
		{:catch error}
			<tr>
				<td colspan={columns?.length || 1}>Something went wrong: {error.message}</td>
			</tr>
		{/await}
	</tbody>
</table>

<style>
	table {
		display: block;
		overflow: auto;
		width: 800px;
		table-layout: fixed;
		max-width: initial;
		/* min-height: 33px; */
		margin: 0;
		border-collapse: separate;
		border-spacing: 0;
		font-variant-numeric: tabular-nums;
		font-size: small;
		font-family:
			Menlo,
			Consolas,
			Monaco,
			Liberation Mono,
			Lucida Console,
			monospace;
	}
	thead th {
		position: sticky;
		top: 0;
		text-align: left;
		vertical-align: top;
		background: #222;
	}
	th .col-header {
		display: flex;
		justify-content: space-between;
		flex-direction: column;
	}
	th .col-header p {
		margin: 0;
		font-size: small;
	}
	th .sort-button button {
		border: none;
		background: none;
		padding: 0;
		color: gray;
		font-size: 10px;
	}
	th .sort-button button:hover {
		cursor: pointer;
		color: white;
	}
	th .col-title {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	th .col-header :global(.col-menu) {
		overflow: visible;
	}
	.summary-plot {
		height: 64px;
		/* background: #f4f4f4; */
	}
	tbody {
		white-space: nowrap;
	}
	tbody td {
		border-bottom: solid 1px #ccc;
	}
	tbody tr.id-highlight {
		background-color: coral;
	}
	tbody tr:hover {
		background-color: #222;
	}
	tbody td:hover {
		background-color: black;
		cursor: pointer;
	}
	td,
	th {
		text-overflow: ellipsis;
		overflow: hidden;
		padding: 4px 6px;
		min-width: 144px;
		max-width: 144px;
	}
	td.numeric {
		text-align: right;
	}
	.placeholder {
		background-color: #ededed;
		height: 18px;
		border-radius: 7px;
		width: 100%;
	}
	td .placeholder {
		background-color: #ededed;
		background: linear-gradient(
				100deg,
				rgba(255, 255, 255, 0) 40%,
				rgba(255, 255, 255, 0.5) 50%,
				rgba(255, 255, 255, 0) 60%
			)
			#ededed;
		background-size: 200% 100%;
		background-position-x: 180%;
		animation: 1s loading ease-in-out infinite;
	}
	@keyframes loading {
		to {
			background-position-x: -30%;
		}
	}
</style>
