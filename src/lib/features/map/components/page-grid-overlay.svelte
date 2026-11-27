<script lang="ts">
  import {
    getPageGridOrigin,
    PAGE_GRID_SIZE_PX,
    type PageGridSize
  } from '$lib/features/commons/utils/page-grid.utils';

  interface Props {
    /** Page size in page units. */
    page: PageGridSize;
    displayScale?: number;
  }

  let { page, displayScale = 1 }: Props = $props();

  // A fixed size on screen whatever the zoom, drawn on whole device pixels so
  // that every point stays crisp and alike.
  const POINT_SIZE_CSS_PX = 1.5;

  let devicePixelRatio = $state(
    typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  );

  $effect(() => {
    const query = window.matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    const update = () => {
      devicePixelRatio = window.devicePixelRatio || 1;
    };
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  });

  const pageDisplayScale = $derived(
    Number.isFinite(displayScale) && displayScale > 0 ? displayScale : 1
  );
  // Device pixels per page unit.
  const scale = $derived(pageDisplayScale * devicePixelRatio);
  const viewWidth = $derived(Math.max(1, Math.round(page.width * scale)));
  const viewHeight = $derived(Math.max(1, Math.round(page.height * scale)));
  const pointsPath = $derived.by(() => {
    const origin = getPageGridOrigin(page);
    const size = Math.max(1, Math.round(POINT_SIZE_CSS_PX * devicePixelRatio));
    const half = size / 2;
    const columns: number[] = [];
    for (let x = origin.x; x <= page.width; x += PAGE_GRID_SIZE_PX) {
      columns.push(Math.round(x * scale - half));
    }
    const parts: string[] = [];
    for (let y = origin.y; y <= page.height; y += PAGE_GRID_SIZE_PX) {
      const top = Math.round(y * scale - half);
      for (const left of columns) {
        parts.push(`M${left} ${top}h${size}v${size}h-${size}z`);
      }
    }
    return parts.join('');
  });
</script>

<svg
  aria-hidden="true"
  class="page-grid"
  viewBox="0 0 {viewWidth} {viewHeight}"
  preserveAspectRatio="none"
  shape-rendering="crispEdges"
>
  <path d={pointsPath} fill="#ffffff" />
</svg>

<style>
  .page-grid {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: var(--z-map-layer);
    pointer-events: none;
    overflow: hidden;
    /* White points inverted against whatever lies beneath them, page or map:
       dark on light grounds, light on dark ones. */
    mix-blend-mode: difference;
    opacity: 0.28;
  }
</style>
