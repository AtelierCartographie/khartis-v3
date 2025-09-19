<script>
	import { Duck } from '$lib/duckdb/duckdb.js';
	import { get_viz_suggestions } from './viz_suggestions';
	import { table as inputs_table } from '@observablehq/inputs';
	import SummaryPlot from './duckdb/SummaryPlot.svelte';

	let { table, ...rest } = $props();

	async function get_suggestions(table) {
		const columns_analyse = await Duck.analyse(table);
		console.log(columns_analyse);
		return get_viz_suggestions(columns_analyse, {
			geometry_type: 'polygon',
			debug: true
		});
	}
</script>

{#await get_suggestions(table) then { columns_indicators, viz }}
	<h3>Suggestions de visualisation</h3>
	<p>
		Des suggestions de visualisation sont proposées pour les données importées. Les suggestions sont
		basées sur l'analyse des données et un typage sémiologique automatique.
	</p>
	<p><strong>Résultats du typage sémiologique</strong></p>
	<div class="viz-suggestions">
		<SummaryPlot svgElement={inputs_table(columns_indicators, { select: false, width: 'auto' })} />
	</div>
	<p><strong>Propositions de viz</strong></p>
	<div class="viz-suggestions">
		<SummaryPlot svgElement={inputs_table(viz, { select: false, width: 'auto' })} />
	</div>
{/await}

<style>
	h3 {
		margin-top: 1em;
	}
	p strong {
		display: block;
		margin-top: 0.5em;
		margin-bottom: 0.3em;
	}
	.viz-suggestions :global(form) {
		display: block;
		overflow-y: auto;
		width: 100%;
	}
	.viz-suggestions :global(table) {
		max-width: initial;
		min-height: 33px;
		margin: 0;
		border-collapse: separate;
		border-spacing: 0;
		font-variant-numeric: tabular-nums;
	}
	.viz-suggestions :global(th) {
		position: sticky;
		top: 0;
		padding-left: 10px;
		border-bottom: solid 2px #ccc;
		background-color: #111;
		cursor: ns-resize;
	}
	.viz-suggestions :global(tr) {
		text-align: left;
	}
	.viz-suggestions :global(tr > :not(:first-of-type)) {
		padding-left: 10px;
	}
	.viz-suggestions :global(td) {
		white-space: nowrap;
		text-overflow: ellipsis;
		overflow: hidden;
		padding: 3px 10px 3px 0;
	}
</style>
