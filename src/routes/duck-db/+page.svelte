<script lang="ts">
	import { base } from '$app/paths';
	import { dbError, duckDB, isDbInitializing, isQuerying, queryError } from '$lib/db';
	import { Button, Column, Grid, Loading, Row, Tag, Tile } from 'carbon-components-svelte';

	interface SpeechData {
		year: number;
		president: string;
		party: string;
		paragraph: number;
		'nc:text': string;
	}

	let selectedYear = $state<number>(1936);
	let speechResults = $state<SpeechData[]>([]);
	let availableYears = $state<number[]>([]);
	let speechCache = $state<Map<number, SpeechData[]>>(new Map());
	let isLoadingYear = $state<boolean>(false);

	async function setupSOTUDatabase(): Promise<void> {
		await duckDB.initialize();
		await duckDB.registerFile('SOTU.parquet', `${base}/SOTU.parquet`);
		await duckDB.createTableFromFile('sotu_data', 'SOTU.parquet');
	}

	async function querySOTUByYear(year: number) {
		return await duckDB.query(`
			SELECT * FROM sotu_data 
			WHERE year = ${year} 
			ORDER BY paragraph ASC
		`);
	}

	async function getAvailableYears(): Promise<number[]> {
		const result = await duckDB.query<{ year: number }>(`
			SELECT DISTINCT year FROM sotu_data 
			ORDER BY year ASC
		`);
		return result.map((row) => row.year);
	}

	$effect(() => {
		setupSOTUDatabase()
			.then(() => {
				loadAvailableYears();
				fetchSpeechData(selectedYear);
			})
			.catch((error) => {
				console.error('Failed to setup database:', error);
			});
	});

	async function loadAvailableYears() {
		try {
			availableYears = await getAvailableYears();
		} catch (error) {
			console.error('Failed to load available years:', error);
		}
	}

	async function fetchSpeechData(year: number) {
		if (speechCache.has(year)) {
			speechResults = speechCache.get(year) || [];
			return;
		}

		isLoadingYear = true;
		try {
			const results = await querySOTUByYear(year);
			const data = results as unknown as SpeechData[];
			speechResults = data;
			speechCache.set(year, data);
		} catch (error) {
			console.error('Failed to fetch speech data:', error);
		} finally {
			isLoadingYear = false;
		}
	}

	function handleYearSelect(year: number) {
		selectedYear = year;
		fetchSpeechData(year);
	}

	async function retryInitialization() {
		try {
			await setupSOTUDatabase();
			loadAvailableYears();
			fetchSpeechData(selectedYear);
		} catch (error) {
			console.error('Retry failed:', error);
		}
	}

	const defaultYears = $derived(() => {
		if (availableYears.length > 0) {
			return availableYears;
		}
		const yearsList: number[] = [];
		for (let y = 1934; y < 2021; y++) {
			yearsList.push(y);
		}
		return yearsList;
	});
</script>

<svelte:head>
	<title>DuckDB Svelte Demo - State of the Union Speeches</title>
	<meta
		name="description"
		content="Interactive demo using DuckDB WASM to query State of the Union speeches"
	/>
</svelte:head>

<main>
	<h1>DuckDB SvelteKit Test</h1>

	{#if $isDbInitializing}
		<Tile style="margin-top: 2rem;">
			<Loading withOverlay={false} small description="Initializing database..." />
		</Tile>
	{:else if $dbError}
		<Tile style="margin-top: 2rem; border-left: 4px solid var(--cds-support-error);">
			<h3>Database Error</h3>
			<p>Failed to initialize database: {$dbError}</p>
			<Button onclick={retryInitialization} size="small" style="margin-top: 1rem;">Retry</Button>
		</Tile>
	{:else}
		<section aria-labelledby="year-selection-title">
			<h2 id="year-selection-title" class="visually-hidden">Select a year</h2>
			<Grid>
				<Row>
					<Column>
						<div
							class="year-buttons"
							role="group"
							aria-label="Select year for State of the Union address"
						>
							{#each defaultYears() as year (year)}
								<button
									onclick={() => handleYearSelect(year)}
									disabled={$isQuerying || isLoadingYear}
									aria-pressed={selectedYear === year}
									class="year-button"
									class:selected={selectedYear === year}
									class:loading={isLoadingYear && selectedYear === year}
								>
									{year}
									{#if isLoadingYear && selectedYear === year}
										<span class="loading-indicator">⏳</span>
									{/if}
								</button>
							{/each}
						</div>
					</Column>
				</Row>
			</Grid>
		</section>

		<section aria-labelledby="speech-content-title">
			<h2 id="speech-content-title" class="visually-hidden">Speech content</h2>

			{#if $isQuerying}
				<Tile style="margin-top: 2rem;">
					<Loading
						withOverlay={false}
						small
						description="Loading speech data for {selectedYear}..."
					/>
				</Tile>
			{:else if $queryError}
				<Tile style="margin-top: 2rem; border-left: 4px solid var(--cds-support-error);">
					<h3>Speech Loading Error</h3>
					<p>Failed to load speech data: {$queryError}</p>
					<Button
						onclick={() => fetchSpeechData(selectedYear)}
						size="small"
						style="margin-top: 1rem;"
					>
						Retry
					</Button>
				</Tile>
			{:else if speechResults.length > 0}
				{@const speechData = speechResults[0]}
				<Tile style="margin-top: 2rem;">
					<Grid>
						<Row>
							<Column lg={4} md={4} sm={4}>
								<h3>{speechData.year}</h3>
								{#if isLoadingYear}
									<span class="loading-text">Chargement...</span>
								{/if}
							</Column>
							<Column lg={8} md={4} sm={4}>
								<h4>{speechData.president}</h4>
								<Tag type="outline">{speechData.party}</Tag>
							</Column>
						</Row>
					</Grid>
				</Tile>

				<div class="speech-content" style="margin-top: 1rem;" class:loading={isLoadingYear}>
					<Tile>
						<div class="speech-text">
							{#each speechResults.filter((p) => p['nc:text'] && p['nc:text'] !== 'None' && p['nc:text'].trim() !== '') as paragraph (paragraph.paragraph)}
								<p class="paragraph">{paragraph['nc:text']}</p>
							{/each}
						</div>
					</Tile>
				</div>
			{:else}
				<Tile style="margin-top: 2rem;">
					<p>No speech data found for {selectedYear}.</p>
				</Tile>
			{/if}
		</section>
	{/if}
</main>

<style>
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.year-buttons {
		margin: 2rem 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.year-button {
		padding: 0.5rem 1rem;
		border: 1px solid #ccc;
		background: white;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.2s ease;
		position: relative;
		margin: 0.25rem;
	}

	.year-button:hover {
		background: #f4f4f4;
		border-color: #999;
	}

	.year-button.selected {
		background: #0f62fe;
		color: white;
		border-color: #0f62fe;
	}

	.year-button.loading {
		opacity: 0.7;
	}

	.year-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.loading-indicator {
		margin-left: 0.5rem;
		animation: pulse 1s infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.loading-text {
		font-size: 0.8rem;
		color: #666;
		font-style: italic;
	}

	.speech-content {
		max-height: 70vh;
		overflow-y: auto;
		transition: opacity 0.3s ease;
	}

	.speech-content.loading {
		opacity: 0.6;
	}

	.speech-text {
		line-height: 1.6;
	}

	.paragraph {
		margin-bottom: 1rem;
		text-align: justify;
	}

	main {
		padding: 1rem;
		max-width: 1200px;
		margin: 0 auto;
	}

	@media (max-width: 768px) {
		.year-buttons {
			justify-content: center;
		}
	}
</style>
