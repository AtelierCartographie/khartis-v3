<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { Button, Column, Grid, Row, Slider } from 'carbon-components-svelte';
  import {
    Earth,
    WatsonHealthStackedMove,
    Location,
    Road,
    TextAlignJustify,
    Globe,
    ChartLine
  } from 'carbon-icons-svelte';

  interface BasemapLayer {
    id: string;
    name: string;
    icon: typeof Earth;
    visible: boolean;
    opacity: number;
    color?: string;
    strokeColor?: string;
    strokeWidth?: number;
  }

  interface Props {
    layers?: BasemapLayer[];
    onlayerchange?: (layer: BasemapLayer) => void;
  }

  let {
    layers = $bindable<BasemapLayer[]>([
      {
        id: 'land',
        name: 'Terre',
        icon: Earth,
        visible: true,
        opacity: 100,
        color: '#f5f5f5'
      },
      {
        id: 'oceans',
        name: 'Mers / Océans',
        icon: Globe,
        visible: true,
        opacity: 100,
        color: '#d4e4f7'
      },
      {
        id: 'lakes',
        name: 'Lacs et rivières',
        icon: WatsonHealthStackedMove,
        visible: true,
        opacity: 80,
        color: '#a8d4f0'
      },
      {
        id: 'relief',
        name: 'Relief',
        icon: ChartLine,
        visible: false,
        opacity: 50,
        color: '#e8dcc8'
      },
      {
        id: 'equator',
        name: 'Équateur',
        icon: TextAlignJustify,
        visible: false,
        opacity: 100,
        strokeColor: '#ff6b6b',
        strokeWidth: 1
      },
      {
        id: 'graticule',
        name: 'Méridiens / Parallèles',
        icon: TextAlignJustify,
        visible: false,
        opacity: 50,
        strokeColor: '#cccccc',
        strokeWidth: 0.5
      },
      {
        id: 'borders',
        name: 'Frontières / Limites',
        icon: Road,
        visible: true,
        opacity: 100,
        strokeColor: '#999999',
        strokeWidth: 1
      },
      {
        id: 'cities',
        name: 'Villes',
        icon: Location,
        visible: false,
        opacity: 100,
        color: '#333333'
      },
      {
        id: 'labels',
        name: 'Étiquettes',
        icon: TextAlignJustify,
        visible: false,
        opacity: 100,
        color: '#333333'
      }
    ]),
    onlayerchange
  }: Props = $props();

  let expandedLayerId = $state<string | null>(null);

  function toggleLayerVisibility(layerId: string) {
    const layer = layers.find((l) => l.id === layerId);
    if (layer) {
      layer.visible = !layer.visible;
      onlayerchange?.(layer);
    }
  }

  function toggleExpanded(layerId: string) {
    expandedLayerId = expandedLayerId === layerId ? null : layerId;
  }

  function updateLayerOpacity(layerId: string, opacity: number) {
    const layer = layers.find((l) => l.id === layerId);
    if (layer) {
      layer.opacity = opacity;
      onlayerchange?.(layer);
    }
  }

  function updateLayerColor(layerId: string, color: string) {
    const layer = layers.find((l) => l.id === layerId);
    if (layer) {
      layer.color = color;
      onlayerchange?.(layer);
    }
  }

  function updateLayerStrokeColor(layerId: string, color: string) {
    const layer = layers.find((l) => l.id === layerId);
    if (layer) {
      layer.strokeColor = color;
      onlayerchange?.(layer);
    }
  }

  function updateLayerStrokeWidth(layerId: string, width: number) {
    const layer = layers.find((l) => l.id === layerId);
    if (layer) {
      layer.strokeWidth = width;
      onlayerchange?.(layer);
    }
  }
</script>

<div class="basemap-layers-control">
  <div class="header">
    <h6 class="title">Couches du fond de carte</h6>
    <p class="subtitle">
      Personnalisez l'affichage des éléments du fond de carte.
    </p>
  </div>

  <div class="layers-list">
    {#each layers as layer (layer.id)}
      {@const IconComponent = layer.icon}
      <div class="layer-item" class:expanded={expandedLayerId === layer.id}>
        <div class="layer-main">
          <button
            type="button"
            class="layer-toggle"
            class:visible={layer.visible}
            onclick={() => toggleLayerVisibility(layer.id)}
            aria-label={layer.visible ? m.layers_hide() : m.layers_show()}
          >
            <div class="visibility-indicator"></div>
          </button>

          <div class="layer-icon">
            <IconComponent size={16} />
          </div>

          <span class="layer-name" class:dimmed={!layer.visible}
            >{layer.name}</span
          >

          <button
            type="button"
            class="layer-expand"
            class:active={expandedLayerId === layer.id}
            onclick={() => toggleExpanded(layer.id)}
            aria-label={m.layers_settings()}
          >
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path
                d="M2 4l4 4 4-4"
                stroke="currentColor"
                stroke-width="2"
                fill="none"
              />
            </svg>
          </button>
        </div>

        {#if expandedLayerId === layer.id}
          <div class="layer-settings">
            <Grid padding noGutter>
              <Row>
                <Column sm={4} md={8} lg={16}>
                  <div class="slider-row">
                    <span class="setting-label">{m.opacity()}</span>
                    <Slider
                      min={0}
                      max={100}
                      step={1}
                      value={layer.opacity}
                      hideTextInput
                      on:change={(e) => updateLayerOpacity(layer.id, e.detail)}
                    />
                    <span class="setting-value">{layer.opacity}%</span>
                  </div>
                </Column>
              </Row>

              {#if layer.color !== undefined}
                <Row>
                  <Column sm={4} md={8} lg={16}>
                    <div class="color-row">
                      <span class="setting-label">{m.background()}</span>
                      <input
                        type="color"
                        class="color-input"
                        value={layer.color}
                        oninput={(e: Event) => {
                          const target = e.target as HTMLInputElement;
                          updateLayerColor(layer.id, target.value);
                        }}
                      />
                      <span class="color-value">{layer.color}</span>
                    </div>
                  </Column>
                </Row>
              {/if}

              {#if layer.strokeColor !== undefined}
                <Row>
                  <Column sm={4} md={8} lg={16}>
                    <div class="color-row">
                      <span class="setting-label">{m.stroke()}</span>
                      <input
                        type="color"
                        class="color-input"
                        value={layer.strokeColor}
                        oninput={(e: Event) => {
                          const target = e.target as HTMLInputElement;
                          updateLayerStrokeColor(layer.id, target.value);
                        }}
                      />
                      <span class="color-value">{layer.strokeColor}</span>
                    </div>
                  </Column>
                </Row>
              {/if}

              {#if layer.strokeWidth !== undefined}
                <Row>
                  <Column sm={4} md={8} lg={16}>
                    <div class="slider-row">
                      <span class="setting-label">{m.thickness()}</span>
                      <Slider
                        min={0}
                        max={5}
                        step={0.5}
                        value={layer.strokeWidth}
                        hideTextInput
                        on:change={(e) =>
                          updateLayerStrokeWidth(layer.id, e.detail)}
                      />
                      <span class="setting-value">{layer.strokeWidth}px</span>
                    </div>
                  </Column>
                </Row>
              {/if}
            </Grid>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <div class="footer">
    <Button kind="ghost" size="small">Réinitialiser les couches</Button>
  </div>
</div>

<style lang="scss">
  .basemap-layers-control {
    padding: var(--cds-spacing-04);
  }

  .header {
    margin-bottom: var(--cds-spacing-05);
  }

  .title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-primary);
    margin-bottom: var(--cds-spacing-02);
  }

  .subtitle {
    font-size: 0.75rem;
    color: var(--cds-text-02);
    line-height: 1.4;
  }

  .layers-list {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .layer-item {
    background-color: var(--cds-layer);
    border: 1px solid var(--cds-border-subtle);
    border-radius: 4px;
    overflow: hidden;
    transition: border-color 0.15s ease;

    &:hover {
      border-color: var(--cds-border-strong);
    }

    &.expanded {
      border-color: var(--cds-interactive);
    }
  }

  .layer-main {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-03);
  }

  .layer-toggle {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    border: 2px solid var(--cds-border-strong);
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
    flex-shrink: 0;

    &.visible {
      border-color: var(--cds-interactive);
      background-color: var(--cds-interactive);

      .visibility-indicator {
        background-color: white;
      }
    }
  }

  .visibility-indicator {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background-color: transparent;
    transition: background-color 0.15s ease;
  }

  .layer-icon {
    color: var(--cds-icon-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .layer-name {
    flex: 1;
    font-size: 0.875rem;
    color: var(--cds-text-primary);
    transition: opacity 0.15s ease;

    &.dimmed {
      opacity: 0.5;
    }
  }

  .layer-expand {
    width: 24px;
    height: 24px;
    border-radius: 4px;
    border: none;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--cds-icon-secondary);
    transition: all 0.15s ease;
    flex-shrink: 0;

    &:hover {
      background-color: var(--cds-layer-hover);
    }

    &.active {
      background-color: var(--cds-layer-selected);
      color: var(--cds-interactive);

      svg {
        transform: rotate(180deg);
      }
    }

    svg {
      transition: transform 0.15s ease;
    }
  }

  .layer-settings {
    padding: var(--cds-spacing-03);
    padding-top: 0;
    border-top: 1px solid var(--cds-border-subtle);
    background-color: var(--cds-layer-accent);
  }

  .slider-row,
  .color-row {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-02) 0;
  }

  .setting-label {
    font-size: 0.75rem;
    color: var(--cds-text-02);
    min-width: 60px;
  }

  .setting-value {
    font-size: 0.75rem;
    color: var(--cds-text-02);
    min-width: 40px;
    text-align: right;
  }

  .color-input {
    width: 28px;
    height: 28px;
    border: 1px solid var(--cds-border-subtle);
    border-radius: 4px;
    cursor: pointer;
    padding: 2px;
    background: transparent;

    &::-webkit-color-swatch-wrapper {
      padding: 0;
    }

    &::-webkit-color-swatch {
      border: none;
      border-radius: 2px;
    }
  }

  .color-value {
    font-size: 0.75rem;
    color: var(--cds-text-02);
    font-family: var(--cds-code-01-font-family);
  }

  .footer {
    margin-top: var(--cds-spacing-05);
    padding-top: var(--cds-spacing-04);
    border-top: 1px solid var(--cds-border-subtle);
  }
</style>
