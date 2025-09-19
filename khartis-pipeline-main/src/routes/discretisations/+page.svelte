<script lang="ts">
	import { Duck } from '$lib/duckdb/duckdb';
	import { onMount } from 'svelte';
	import type { AnalysisResults } from '../../types/index.js';

	interface Method {
		name: string;
		label: string;
	}

	interface UIState {
		dataset_url: string;
		selected_column: string | undefined;
		selected_method: string;
		nclass: number;
		nclass_right: number;
		break_value: string | undefined;
		tablename: string | undefined;
	}

	let datasets_url = new Map([
		[
			'IDH',
			'https://raw.githubusercontent.com/AtelierCartographie/Khartis/master/public/data/examples/02-evolution-idh-1990-2014.csv'
		],
		[
			'FAO seafood',
			'https://raw.githubusercontent.com/TomBor/datasets-test/refs/heads/main/csv/FAOSTAT_data_en_3-4-2024.csv'
		],
		[
			'UN pop 2021',
			'https://raw.githubusercontent.com/TomBor/datasets-test/refs/heads/main/csv/UN_population_by_country_2021.csv'
		],
		[
			'UE nuts2',
			'https://raw.githubusercontent.com/TomBor/datasets-test/refs/heads/main/csv/nuts2_data.csv'
		],
		[
			'World Bank capture fish 2021',
			'https://raw.githubusercontent.com/TomBor/datasets-test/refs/heads/main/csv/world_bank_capture_fish_2021.csv'
		],
		[
			'World Bank - Share rural pop',
			'https://raw.githubusercontent.com/TomBor/datasets-test/refs/heads/main/csv/world-bank-rural-pop.csv'
		],
		[
			'FR naissance par commune 2028',
			'https://raw.githubusercontent.com/TomBor/datasets-test/refs/heads/main/csv/naissances-par-commune-departement-et-region-2018.csv'
		],
		[
			'FR régions pauvreté 2013',
			'https://raw.githubusercontent.com/AtelierCartographie/Khartis/master/public/data/examples/fr-reg2015-pauvrete-2013.csv'
		],
		[
			'JO 2024',
			'https://raw.githubusercontent.com/TomBor/datasets-test/refs/heads/main/csv/TOP15%20medailles%20OR%20jeux%20olymiques%202024.csv'
		],
		[
			'Fossils fuels',
			'https://raw.githubusercontent.com/TomBor/datasets-test/refs/heads/main/csv/fossil-fuel-subsidies-gdp-2021.csv'
		],
		[
			'Site seveso IDF',
			'https://raw.githubusercontent.com/TomBor/datasets-test/refs/heads/main/csv/sites-seveso-idf.csv'
		],

		[
			'Ransomware attacks',
			'https://raw.githubusercontent.com/TomBor/datasets-test/refs/heads/main/csv/comparitech-ransomware-dataset.csv'
		],
		[
			'Financial secrecy index 2022',
			'https://raw.githubusercontent.com/TomBor/datasets-test/refs/heads/main/csv/archive_financial_secrecy_index_2022.csv'
		],
		[
			'Débit rivières (format parquet)',
			'https://object.files.data.gouv.fr/hydra-parquet/hydra-parquet/c5b4bc0b43f27276fccad24884d0a1ec.parquet'
		]
	]);

	const methods: Method[] = [
		{ name: 'quantile', label: 'Quantiles' },
		{ name: 'Q6', label: 'Q6 (PhilCarto)' },
		{ name: 'equi_width', label: 'Intervalles égaux' },
		{ name: 'nested_means', label: 'Moyennes emboîtées' },
		{ name: 'headtail2', label: 'Head/Tail' },
		{ name: 'kmeans', label: 'Kmeans' }
	];
	let columns: AnalysisResults | undefined = $state();
	let ui_state: UIState = $state({
		dataset_url: datasets_url.get('UE nuts2')!,
		selected_column: undefined,
		selected_method: 'quantile',
		nclass: 5,
		nclass_right: 5,
		break_value: undefined,
		tablename: undefined
	});

	async function read_csv_link(): Promise<void> {
		console.log('start reading');
		ui_state.tablename = await Duck!.read_link(ui_state.dataset_url);
		columns = await Duck!.analyse(ui_state.tablename);
		const numericColumn = columns.find((d) => d.type_simple === 'numeric');
		ui_state.selected_column = numericColumn?.name;
	}
	onMount(read_csv_link);
</script>

<h2>Discrétisations</h2>
<p>
	La classe javascript Duck comprend deux méthodes pour gérer les discrétisations. La méthode
	principale permet de calculer les seuils de discrétisation de six méthodes implémentées en SQL :
	quantile, Q6 (PhilCarto), intervalles égaux, moyennes emboîtées, headtails, kmeans. Les seuils
	peuvent être arrondis tout en préservant leurs position dans la série. En cas de valeur de rupture
	(zéro ou forcé par l'utilisateur), la méthode de discrétisation est appliquée deux foix, en
	dessous et au dessus de la valeur de rupture. Le nombre de classe avant ou après la valeur de
	rupture peut être fixé par l'utilisateur. La seconde méthode permet d'ajouter une colonne à la
	table existante avec l'affectation des classes.
</p>

<p>Choisir un jeu de données</p>
<select bind:value={ui_state.dataset_url} onchange={read_csv_link}>
	{#each datasets_url as [key, value]}
		<option {value}>{key}</option>
	{/each}
</select>

<p>Choisir une colonne numérique</p>
{#if columns}
	<select bind:value={ui_state.selected_column} onchange={() => (ui_state.break_value = undefined)}>
		{#each columns as column}
			{#if column.type_simple === 'numeric'}
				<option value={column.name}>{column.name}</option>
			{/if}
		{/each}
	</select>
{:else}
	<span>En attente de la lecture du fichier</span>
{/if}

<p>Choisir une méthode de discrétisation</p>
{#each methods as method}
	<label>
		<input type="radio" bind:group={ui_state.selected_method} value={method.name} />
		{method.label}
	</label>
{/each}

<p>Choisir une valeur de rupture (optionnel)</p>
<input type="text" bind:value={ui_state.break_value} />

<p>Choisir le nombre de classes</p>
{#if ui_state.break_value}
	<span>...avant la valeur de rupture</span>
	<input type="range" min="1" max="15" bind:value={ui_state.nclass} />
	<span>{ui_state.nclass}</span>
	<br />
	<span>...après la valeur de rupture</span>
	<input type="range" min="1" max="15" bind:value={ui_state.nclass_right} />
	<span>{ui_state.nclass_right}</span>
{:else}
	<input type="range" min="2" max="15" bind:value={ui_state.nclass} />
	<span>{ui_state.nclass}</span>
{/if}

<p>Seuils calculés et arrondis</p>
{#if ui_state.selected_column && ui_state.selected_method}
	{#await Duck!.calculate_class_breaks( ui_state.tablename!, ui_state.selected_column, { method: ui_state.selected_method, nclass: ui_state.nclass, nclass_right: ui_state.nclass_right, break_value: ui_state.break_value ? Number(ui_state.break_value) : null, round: true } )}
		<p>⏳</p>
	{:then breaks}
		<p>{[...breaks].map((d: number) => d.toLocaleString()).join(' - ')}</p>
	{:catch error}
		<p>Something went wrong: {error.message}</p>
	{/await}
{/if}

<style>
	p {
		margin-top: 1em;
	}
</style>
