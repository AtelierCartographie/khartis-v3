<script>
	import { Duck } from '$lib/duckdb/duckdb.js';
	import {
		FileUploaderDropContainer,
		FileUploaderItem,
		Loading,
		TextArea,
		TextInput,
		ToastNotification
	} from 'carbon-components-svelte';
	import { fade } from 'svelte/transition';
	import { current_table, file } from './share_state.svelte.js';

	let paste = $state();
	let paste_url = $state();
	let files_tmp = $state([]); // not used, just to trigger afterUpdate
	let files = $state([]);
	let files_id = new Set();
	let metadata = $state();
	let showNotification = $state(false);
	let urlNotHandled = $state(false);
	let loading = $state(false);
	let fileUploadError = $state(false);
	let fileUploadErrorMessage = $state('');

	// SHAPEFILE HANDLING
	const shape_mandatory_files = ['.shp', '.shx', '.prj', '.dbf'];
	function is_shapefile(files) {
		return files.filter((d) => shape_mandatory_files.includes(d.name.slice(-4))).length > 0
			? true
			: false;
	}
	function has_missing_files(files) {
		const filenames = files.map((d) => d.name.slice(-4));
		return shape_mandatory_files.filter((d) => !filenames.includes(d)).length > 0 ? true : false;
	}
	function get_missing_files(files) {
		const filenames = files.map((d) => d.name.slice(-4));
		return shape_mandatory_files.filter((d) => !filenames.includes(d));
	}

	// TABULAR or GEOFILE or SHAPEFILE OR PARQUET based on extension
	function get_file_type(file) {
		const tabular_regex = /\.(csv|tsv|text|txt)/i;
		const geo_regex = /\.(geojson|json|gpkg|kml)/i;
		const shp_regex = /\.(shp|shx|prj|dbf|cpg)/i;
		const parquet_regex = /\.(parquet|geoparquet)/i;
		if (tabular_regex.test(file.name)) return 'tabular';
		if (geo_regex.test(file.name)) return 'geofile';
		if (shp_regex.test(file.name)) return 'shapefile';
		if (parquet_regex.test(file.name)) return 'parquet';
		throw new Error('File type not recognized');
	}

	function add_files(current_files) {
		add_id(current_files);
		current_files.forEach((d) => {
			if (!files_id.has(d.id)) {
				files = [...files, d];
				files_id.add(d.id);
			}
		});
	}

	function add_id(files) {
		return files.forEach((d) => (d.id = d.lastModified + '-' + d.name));
	}

	let last_files_length = files.length;

	async function upload_files() {
		console.log('inside upload_files function');
		if (files.length === last_files_length && !paste && !paste_url) return;

		loading = true;
		fileUploadError = false; // Reset error state
		fileUploadErrorMessage = '';

		try {
			if (paste) {
				current_table.value = await Duck.read_tabular(paste);
				paste = '';
			} else if (paste_url) {
				try {
					current_table.value = await Duck.read_link(paste_url);
				} catch (error) {
					console.error('Error uploading file:', error);
					urlNotHandled = true;
					fileUploadError = true;
					fileUploadErrorMessage = 'Impossible to read file from this URL : ' + error.message;
				}
				paste_url = '';
			} else {
				last_files_length = files.length;
				const last_file = files[files.length - 1];
				switch (get_file_type(last_file)) {
					case 'parquet':
						current_table.value = await Duck.read_tabular(last_file, { format: 'parquet' });
						break;
					case 'tabular':
						current_table.value = await Duck.read_tabular(last_file);
						break;
					case 'geofile':
						file.value = last_file;
						metadata = await Duck.read_geofile(file.value, { meta: true });
						current_table.value = await Duck.read_geofile(file.value);
						break;
					case 'shapefile':
						if (has_missing_files(files)) {
							showNotification = true;
							fileUploadError = false;
							return;
						}
						showNotification = false;
						await Duck.register_files(files, { shapefile: true });
						file.value = files.filter((d) => d.name.slice(-4) === '.shp')[0];
						metadata = await Duck.read_geofile(file.value, { meta: true });
						current_table.value = await Duck.read_geofile(file.value);
						break;
					default:
						throw new Error('File type not recognized');
				}
			}
		} catch (error) {
			console.error('Error uploading file:', error);
			fileUploadError = true;
			fileUploadErrorMessage = 'Impossible to read file : ' + error.message;
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		console.log('side effect');
		files_tmp;
		(async () => await upload_files())();
	});
</script>

<h3>Importer des données</h3>
<p>
	Il peut s'agir d'un tableau de données au format csv ou d'un fichier d'informations géographiqes
	(shp, geojson, geopackage)
</p>
<div id="upload-area">
	<FileUploaderDropContainer
		multiple
		labelText="Glisser-déposer un fichier ou cliquer pour importer"
		accept={[
			'.csv',
			'.tsv',
			'.text',
			'.parquet',
			'.geoparquet',
			'.json',
			'.geojson',
			'.shp',
			'.gpkg',
			'.kml',
			'.shx',
			'.prj',
			'.dbf',
			'.cpg'
		]}
		bind:files={files_tmp}
		on:add={(e) => add_files(e.detail)}
		style="width: auto; max-width: auto;"
	/>
	<TextArea bind:value={paste} rows={7} hideLabel placeholder="Coller un tableau de données" />
</div>
<TextInput bind:value={paste_url} hideLabel placeholder="Coller une url vers un fichier" />
{#if urlNotHandled}
	<div transition:fade>
		<ToastNotification
			kind="warning"
			title="Impossible de charger l'url"
			subtitle="Le format du fichier vers lequel pointe le lien n'est pas reconnu"
		/>
	</div>
{/if}
{#if fileUploadError}
	<div transition:fade>
		<ToastNotification
			kind="error"
			title="Erreur de chargement"
			subtitle={fileUploadErrorMessage}
			on:close={() => (fileUploadError = false)}
		/>
	</div>
{/if}
{#each files as f (f.id)}
	<FileUploaderItem size="small" name={f.name} status="complete" />
{/each}

{#if metadata}
	{@const { name, format, nb_entities, geometry, crs } = metadata.get(0)}
	<h3>Métadonnées</h3>
	<ul>
		<li><strong>Nom:</strong> {name}</li>
		<li><strong>Format:</strong> {format}</li>
		<li><strong>Nb_entités:</strong> {nb_entities}</li>
		<li><strong>Géométrie:</strong> {geometry}</li>
		<li><strong>CRS:</strong> {crs}</li>
	</ul>
{/if}

{#if showNotification}
	<div transition:fade>
		<ToastNotification
			kind="warning"
			title="Des fichiers sont manquants"
			subtitle="Le format Shapefile est composé de plusieurs fichiers : .shp, .shx, .prj, .dbf, .cpg"
			caption={`Fichiers manquants: ${get_missing_files(files).join(', ')}`}
		/>
	</div>
{/if}

<Loading active={loading} />

<style>
	#upload-area {
		display: flex;
		gap: 1rem;
	}
</style>
