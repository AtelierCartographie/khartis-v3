<script lang="ts">
	import { browser } from '$app/environment';
	import { initDuckDB } from '$lib/duckdb/duckdb';
	import 'carbon-components-svelte/css/g80.css';
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
	}

	let { children }: Props = $props();
</script>

<header>
	<nav>
		<h1>Khartis pipeline</h1>
		<ul>
			<li><a href="/">Data Viewer</a></li>
			<li><a href="/discretisations">Discrétisations</a></li>
			<!-- <li><a href="/jointures">Jointures</a></li> -->
			<li><a href="/spatial">Spatial</a></li>
		</ul>
	</nav>
</header>

<div id="main-container">
	{#if browser}
		{#await initDuckDB()}
			<p>...chargement de DuckDB...</p>
		{:then ready}
			{@render children?.()}
		{/await}
	{:else}
		<p>...chargement de DuckDB...</p>
	{/if}
</div>

<style>
	#main-container {
		margin-left: 1rem;
		margin-right: 1rem;
	}

	nav {
		top: 0;
		height: 70px;
		display: flex;
		align-items: center;
		background-color: #111;
		box-shadow: 0 4px 4px rgb(0 0 0 / 6%);
		border-bottom: 1px solid #ccc;
		z-index: 10;
	}

	nav h1 {
		margin-left: 1rem;
		width: 500px;
	}

	nav ul {
		list-style-type: none;
		padding: 0;
		width: 100%;
		display: flex;
		align-items: baseline;
		justify-content: flex-end;
		gap: 1rem;
		margin: 0 1rem;
	}

	nav ul li {
		margin-left: 1rem;
	}

	nav ul li a {
		color: white;
		text-decoration: none;
	}

	nav ul li a:hover {
		text-decoration: underline;
	}
</style>
