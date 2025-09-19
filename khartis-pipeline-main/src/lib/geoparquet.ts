import wasmInit, { readGeoParquet } from '@geoarrow/geoparquet-wasm/esm/index.js';
import { tableFromIPC } from 'apache-arrow/Arrow';

/**
 * /!\ @geoarrow/deckgl-layers a été conçu pour fonctionner spécifiquement
 * avec les classes que renvoie Apache Arrow JS. Notamment une classe Vector pour le résultat de getChild('column_name).
 * Si on utilise Flechette, ça ne marche pas car c'est une classe Column qui est renvoyée par getChild.
 */

// Need to await the default export first to initialize the WebAssembly code
// ToDo : comment pointer vers le bon fichier wasm sans le copier dans $lib
const wasm_url =
	'https://cdn.jsdelivr.net/npm/@geoarrow/geoparquet-wasm@0.2.0-beta.5/esm/index_bg.wasm';
await wasmInit(wasm_url);

export async function read_geoparquet(arrayBuffer: ArrayBuffer) {
	const data = await readGeoParquet(new Uint8Array(arrayBuffer));
	const table = tableFromIPC(data.intoIPCStream());
	return table;
}
