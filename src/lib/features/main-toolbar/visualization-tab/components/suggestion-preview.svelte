<script lang="ts">
  import type { SimplifiedGeometryType } from '$lib/features/commons/services/viz-suggester.service';
  import { VisualizationType } from '$lib/features/commons/store/visualization.store.svelte';
  import { mapSuggestionToType } from '../suggestion.utils';

  interface Props {
    suggestionId: string;
    geometries: SimplifiedGeometryType[];
  }

  const { suggestionId, geometries }: Props = $props();

  const vizType = $derived(mapSuggestionToType(suggestionId));
  const primaryGeom = $derived(geometries[0] ?? 'polygon');
  const isText = $derived(suggestionId.startsWith('texts_'));
</script>

<div class="suggestion-preview">
  {#if isText}
    <!-- Text visualization: labeled points -->
    <svg viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <text
        x="12"
        y="28"
        font-size="16"
        font-weight="700"
        fill="var(--preview-accent)">Aa</text
      >
      <circle
        cx="30"
        cy="36"
        r="3"
        fill="var(--preview-accent)"
        opacity="0.5"
      />
      <text
        x="50"
        y="50"
        font-size="11"
        font-weight="600"
        fill="var(--preview-mid)">Bb</text
      >
      <circle cx="60" cy="55" r="2.5" fill="var(--preview-mid)" opacity="0.5" />
      <text
        x="22"
        y="68"
        font-size="13"
        font-weight="600"
        fill="var(--preview-dark)">Cc</text
      >
      <circle cx="38" cy="72" r="2" fill="var(--preview-dark)" opacity="0.5" />
      <text
        x="68"
        y="30"
        font-size="9"
        font-weight="600"
        fill="var(--preview-light)">Dd</text
      >
      <circle cx="76" cy="34" r="2" fill="var(--preview-light)" opacity="0.5" />
    </svg>
  {:else if primaryGeom === 'line'}
    <!-- Line visualization: colored/sized lines -->
    <svg viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M10 15 Q30 5, 55 20 T90 12"
        stroke="var(--preview-dark)"
        stroke-width="3.5"
        stroke-linecap="round"
      />
      <path
        d="M8 35 Q35 25, 60 38 T92 30"
        stroke="var(--preview-accent)"
        stroke-width="2.5"
        stroke-linecap="round"
      />
      <path
        d="M10 52 Q40 42, 65 55 T88 48"
        stroke="var(--preview-mid)"
        stroke-width="1.8"
        stroke-linecap="round"
      />
      <path
        d="M12 68 Q38 60, 58 70 T90 64"
        stroke="var(--preview-light)"
        stroke-width="1.2"
        stroke-linecap="round"
      />
    </svg>
  {:else if vizType === VisualizationType.CHOROPLETH}
    <!-- Choropleth: polygons with gradient fill -->
    <svg viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M5 5 L45 5 L40 35 L5 30Z"
        fill="var(--preview-light)"
        stroke="var(--preview-stroke)"
        stroke-width="0.5"
      />
      <path
        d="M45 5 L95 8 L90 40 L40 35Z"
        fill="var(--preview-dark)"
        stroke="var(--preview-stroke)"
        stroke-width="0.5"
      />
      <path
        d="M5 30 L40 35 L35 65 L8 60Z"
        fill="var(--preview-mid)"
        stroke="var(--preview-stroke)"
        stroke-width="0.5"
      />
      <path
        d="M40 35 L90 40 L85 72 L35 65Z"
        fill="var(--preview-accent)"
        stroke="var(--preview-stroke)"
        stroke-width="0.5"
      />
      <path
        d="M8 60 L35 65 L30 78 L5 75Z"
        fill="var(--preview-dark)"
        stroke="var(--preview-stroke)"
        stroke-width="0.5"
      />
      <path
        d="M35 65 L85 72 L80 78 L30 78Z"
        fill="var(--preview-light)"
        stroke="var(--preview-stroke)"
        stroke-width="0.5"
      />
    </svg>
  {:else if vizType === VisualizationType.CATEGORICAL}
    {#if primaryGeom === 'point'}
      <!-- Categorical points: same symbol, different category colors -->
      <svg viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="25" cy="22" r="6" fill="var(--preview-accent)" />
        <circle cx="65" cy="22" r="6" fill="var(--preview-cat2)" />
        <circle cx="50" cy="55" r="6" fill="var(--preview-cat3)" />
        <circle cx="78" cy="50" r="6" fill="var(--preview-accent)" />
        <circle cx="20" cy="56" r="6" fill="var(--preview-cat2)" />
        <circle cx="80" cy="24" r="6" fill="var(--preview-cat3)" />
      </svg>
    {:else}
      <!-- Categorical polygons: distinct colors -->
      <svg viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M5 5 L45 5 L40 35 L5 30Z"
          fill="var(--preview-accent)"
          stroke="var(--preview-stroke)"
          stroke-width="0.5"
        />
        <path
          d="M45 5 L95 8 L90 40 L40 35Z"
          fill="var(--preview-cat2)"
          stroke="var(--preview-stroke)"
          stroke-width="0.5"
        />
        <path
          d="M5 30 L40 35 L35 65 L8 60Z"
          fill="var(--preview-cat3)"
          stroke="var(--preview-stroke)"
          stroke-width="0.5"
        />
        <path
          d="M40 35 L90 40 L85 72 L35 65Z"
          fill="var(--preview-accent)"
          stroke="var(--preview-stroke)"
          stroke-width="0.5"
        />
        <path
          d="M8 60 L35 65 L30 78 L5 75Z"
          fill="var(--preview-cat2)"
          stroke="var(--preview-stroke)"
          stroke-width="0.5"
        />
        <path
          d="M35 65 L85 72 L80 78 L30 78Z"
          fill="var(--preview-cat3)"
          stroke="var(--preview-stroke)"
          stroke-width="0.5"
        />
      </svg>
    {/if}
  {:else if vizType === VisualizationType.PROPORTIONAL}
    <!-- Proportional symbols: varying circle sizes -->
    <svg viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle
        cx="35"
        cy="30"
        r="14"
        fill="var(--preview-accent)"
        opacity="0.8"
      />
      <circle
        cx="70"
        cy="45"
        r="10"
        fill="var(--preview-accent)"
        opacity="0.8"
      />
      <circle
        cx="25"
        cy="60"
        r="7"
        fill="var(--preview-accent)"
        opacity="0.8"
      />
      <circle
        cx="75"
        cy="20"
        r="5"
        fill="var(--preview-accent)"
        opacity="0.8"
      />
      <circle
        cx="55"
        cy="65"
        r="3.5"
        fill="var(--preview-accent)"
        opacity="0.8"
      />
    </svg>
  {:else if vizType === VisualizationType.BIVARIATE}
    <!-- Bivariate: circles varying in size AND color -->
    <svg viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="35" cy="30" r="14" fill="var(--preview-dark)" opacity="0.8" />
      <circle
        cx="70"
        cy="45"
        r="10"
        fill="var(--preview-accent)"
        opacity="0.8"
      />
      <circle cx="25" cy="60" r="7" fill="var(--preview-light)" opacity="0.8" />
      <circle cx="75" cy="20" r="5" fill="var(--preview-dark)" opacity="0.8" />
      <circle cx="55" cy="65" r="3.5" fill="var(--preview-mid)" opacity="0.8" />
    </svg>
  {:else}
    <!-- Basic/fallback: simple geometry outlines -->
    <svg viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {#if primaryGeom === 'point'}
        <circle
          cx="30"
          cy="25"
          r="5"
          fill="var(--preview-accent)"
          opacity="0.6"
        />
        <circle
          cx="65"
          cy="40"
          r="5"
          fill="var(--preview-accent)"
          opacity="0.6"
        />
        <circle
          cx="45"
          cy="60"
          r="5"
          fill="var(--preview-accent)"
          opacity="0.6"
        />
        <circle
          cx="78"
          cy="22"
          r="5"
          fill="var(--preview-accent)"
          opacity="0.6"
        />
        <circle
          cx="20"
          cy="55"
          r="5"
          fill="var(--preview-accent)"
          opacity="0.6"
        />
      {:else}
        <path
          d="M5 5 L45 5 L40 35 L5 30Z"
          fill="var(--preview-accent)"
          opacity="0.3"
          stroke="var(--preview-stroke)"
          stroke-width="0.5"
        />
        <path
          d="M45 5 L95 8 L90 40 L40 35Z"
          fill="var(--preview-accent)"
          opacity="0.3"
          stroke="var(--preview-stroke)"
          stroke-width="0.5"
        />
        <path
          d="M5 30 L40 35 L35 65 L8 60Z"
          fill="var(--preview-accent)"
          opacity="0.3"
          stroke="var(--preview-stroke)"
          stroke-width="0.5"
        />
        <path
          d="M40 35 L90 40 L85 72 L35 65Z"
          fill="var(--preview-accent)"
          opacity="0.3"
          stroke="var(--preview-stroke)"
          stroke-width="0.5"
        />
      {/if}
    </svg>
  {/if}
</div>

<style>
  .suggestion-preview {
    --preview-accent: var(--khartis-additions-interactive-suggestions, #0072c3);
    --preview-dark: #003a6d;
    --preview-mid: #0072c3;
    --preview-light: #82cfff;
    --preview-stroke: #003a6d;
    --preview-cat2: #8a3ffc;
    --preview-cat3: #08bdba;

    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  .suggestion-preview svg {
    width: 80px;
    height: 64px;
  }
</style>
