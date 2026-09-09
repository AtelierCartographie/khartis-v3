#!/usr/bin/env node
// Régénère les 6 vignettes des styles tuilés « carte facile » (IGN / OpenMapTiles)
// affichées par le sélecteur d'échelle et de style du fond de référence.
//
//   node scripts/generate-basemap-style-thumbnails.mjs
//
// Le script sert une page MapLibre locale, attend que le navigateur ait rendu et
// renvoyé les 6 captures, puis les encode en AVIF 960x540 dans
// static/basemaps/thumbnails/<id>.avif — le chemin que basemap-card-vertical.svelte
// dérive de STYLE_CONFIGS[].id, donc aucun code applicatif n'est à modifier.
//
// Le rendu WebGL exige un vrai navigateur : ouvrez l'URL affichée dans un onglet
// AU PREMIER PLAN (un onglet masqué voit son requestAnimationFrame throttlé et la
// page ne termine jamais). Le script se termine seul une fois les 6 fichiers reçus.
//
// Encodage AVIF : `sips` (macOS) ou `avifenc` (libavif) doit être disponible.
// Sans l'un des deux, les PNG sont conservés et le chemin est affiché.
//
// Attribution des données rendues : © IGN (Licence Ouverte / Etalab 2.0),
// © OpenStreetMap contributors (ODbL 1.0), © Etalab.

import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const STYLES_DIR = join(ROOT, 'static/basemaps/styles');
const THUMBNAILS_DIR = join(ROOT, 'static/basemaps/thumbnails');
const MAPLIBRE_DIST = join(ROOT, 'node_modules/maplibre-gl/dist');
const PORT = Number(process.env.THUMBNAIL_PORT ?? 8931);

// Cadrage : le preset de viewport que l'application applique elle-même quand
// l'utilisateur bascule l'échelle (BASEMAP_VIEWPORT_PRESETS, basemap-styles.ts).
// La vignette montre donc exactement la vue obtenue après sélection.
const FRANCE = { center: [2.5, 46.7], zoom: 4.55 };
const MONDE = { center: [5, 20], zoom: 0.55 };

const JOBS = [
  { id: 'france-couleurs', ...FRANCE },
  { id: 'france-niveaux-de-gris', ...FRANCE },
  { id: 'france-satellite', ...FRANCE },
  { id: 'monde-couleurs', ...MONDE },
  { id: 'monde-niveaux-de-gris', ...MONDE },
  { id: 'monde-satellite', ...MONDE }
];

// Groupes masqués par défaut dans l'application (LayerGroupDefinition.defaultVisible
// à false dans carte-facile-layer-groups.ts) : la vignette doit montrer le rendu
// par défaut, pas toutes les couches du style.
const HIDDEN_GROUPS = ['admin_boundaries', 'cadastre'];

// Vue rendue en 640x360 CSS à un devicePixelRatio de 1,5 : le canvas fait
// 960x540, la taille des 183 vignettes existantes, tout en gardant des
// étiquettes à une échelle lisible une fois la vignette réduite à 184 px.
const VIEW = { width: 640, height: 360, pixelRatio: 1.5 };
const AVIF_QUALITY = 50;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function page() {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8" />
<title>Khartis — vignettes des styles tuilés</title>
<link rel="stylesheet" href="./maplibre/maplibre-gl.css" />
<style>
  body { margin: 0; font: 13px/1.5 ui-monospace, monospace; background: #161616; color: #f4f4f4; }
  #stage { width: ${VIEW.width}px; height: ${VIEW.height}px; }
  #log { padding: 12px; }
  .maplibregl-ctrl-attrib, .maplibregl-ctrl-logo { display: none !important; }
</style></head>
<body>
<div id="stage"></div>
<div id="log">Initialisation…</div>
<script type="module">
import { Map as MapLibreMap } from './maplibre/maplibre-gl.mjs';

const JOBS = ${JSON.stringify(JOBS)};
const HIDDEN_GROUPS = new Set(${JSON.stringify(HIDDEN_GROUPS)});
const log = document.getElementById('log');
const say = (message) => { log.textContent = message; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const map = new MapLibreMap({
  container: 'stage',
  style: { version: 8, sources: {}, layers: [] },
  center: [0, 0],
  zoom: 1,
  pixelRatio: ${VIEW.pixelRatio},
  canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
  attributionControl: false,
  interactive: false,
  fadeDuration: 0
});

function once(event, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };
    map.once(event, done);
    setTimeout(done, timeoutMs);
  });
}

async function render(job) {
  map.setStyle(await fetch('./styles/' + job.id + '.json').then((r) => r.json()), { diff: false });
  await once('styledata', 15000);
  for (const layer of map.getStyle().layers ?? []) {
    if (HIDDEN_GROUPS.has(layer.metadata?.['cartefacile:group'])) {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
  }
  map.setProjection({ type: 'mercator' });
  map.jumpTo({ center: job.center, zoom: job.zoom, bearing: 0, pitch: 0 });
  await once('idle', 45000);
  await sleep(1500);
  map.triggerRepaint();
  await once('idle', 20000);
  await sleep(500);
  await fetch('/save?name=' + job.id, { method: 'POST', body: map.getCanvas().toDataURL('image/png') });
}

(async () => {
  let index = 0;
  for (const job of JOBS) {
    index += 1;
    say('[' + index + '/' + JOBS.length + '] ' + job.id + ' …');
    await render(job);
  }
  say('Terminé — vous pouvez fermer cet onglet.');
  await fetch('/done', { method: 'POST' });
})().catch(async (error) => {
  say('Échec : ' + (error?.message ?? error));
  await fetch('/failed?message=' + encodeURIComponent(error?.message ?? String(error)), { method: 'POST' });
});
</script>
</body></html>`;
}

async function stageAssets() {
  if (!existsSync(MAPLIBRE_DIST)) {
    throw new Error('maplibre-gl introuvable dans node_modules — lancez `pnpm install`.');
  }

  const dir = await mkdtemp(join(tmpdir(), 'khartis-thumbnails-'));
  await mkdir(join(dir, 'maplibre'), { recursive: true });
  await mkdir(join(dir, 'styles'), { recursive: true });
  await mkdir(join(dir, 'out'), { recursive: true });

  for (const file of [
    'maplibre-gl.mjs',
    'maplibre-gl-shared.mjs',
    'maplibre-gl-worker.mjs',
    'maplibre-gl.css'
  ]) {
    await copyFile(join(MAPLIBRE_DIST, file), join(dir, 'maplibre', file));
  }
  for (const job of JOBS) {
    await copyFile(join(STYLES_DIR, `${job.id}.json`), join(dir, 'styles', `${job.id}.json`));
  }
  await writeFile(join(dir, 'index.html'), page());

  return dir;
}

function encodeAvif(pngPath, avifPath) {
  if (process.platform === 'darwin') {
    const result = spawnSync(
      'sips',
      ['-s', 'format', 'avif', '-s', 'formatOptions', String(AVIF_QUALITY), pngPath, '--out', avifPath],
      { stdio: 'ignore' }
    );
    return result.status === 0;
  }

  const result = spawnSync('avifenc', ['-q', String(AVIF_QUALITY), pngPath, avifPath], {
    stdio: 'ignore'
  });
  return result.status === 0;
}

async function serve(dir) {
  const received = new Set();

  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer(async (request, response) => {
      const url = new URL(request.url, `http://localhost:${PORT}`);

      if (request.method === 'POST' && url.pathname === '/save') {
        const name = String(url.searchParams.get('name'));
        if (!JOBS.some((job) => job.id === name)) {
          response.writeHead(400).end('unknown style');
          return;
        }
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const base64 = Buffer.concat(chunks).toString('utf8').replace(/^data:image\/png;base64,/, '');
        await writeFile(join(dir, 'out', `${name}.png`), Buffer.from(base64, 'base64'));
        received.add(name);
        console.log(`  ✓ ${name} (${received.size}/${JOBS.length})`);
        response.writeHead(200).end('ok');
        return;
      }

      if (request.method === 'POST' && url.pathname === '/failed') {
        server.close();
        rejectPromise(new Error(url.searchParams.get('message') ?? 'rendu interrompu'));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/done') {
        response.writeHead(200).end('ok');
        server.close();
        resolvePromise(received);
        return;
      }

      const relative = normalize(url.pathname === '/' ? '/index.html' : url.pathname).replace(
        /^(\.\.[/\\])+/,
        ''
      );
      try {
        const body = await readFile(join(dir, relative));
        response.writeHead(200, { 'content-type': MIME[extname(relative)] ?? 'application/octet-stream' });
        response.end(body);
      } catch {
        response.writeHead(404).end('not found');
      }
    });

    server.listen(PORT, () => {
      console.log(`\n  Ouvrez http://localhost:${PORT}/ dans un onglet AU PREMIER PLAN.`);
      console.log('  (un onglet masqué throttle requestAnimationFrame : le rendu ne se termine jamais)\n');
    });
    server.on('error', rejectPromise);
  });
}

const dir = await stageAssets();
try {
  await serve(dir);

  let encoded = 0;
  for (const job of JOBS) {
    const png = join(dir, 'out', `${job.id}.png`);
    const avif = join(THUMBNAILS_DIR, `${job.id}.avif`);
    if (encodeAvif(png, avif)) {
      encoded += 1;
    } else {
      const fallback = join(THUMBNAILS_DIR, `${job.id}.png`);
      await copyFile(png, fallback);
      console.error(`  ! encodage AVIF indisponible pour ${job.id} — PNG conservé : ${fallback}`);
    }
  }
  console.log(`\n  ${encoded}/${JOBS.length} vignettes AVIF écrites dans static/basemaps/thumbnails/\n`);
} finally {
  await rm(dir, { recursive: true, force: true });
}
