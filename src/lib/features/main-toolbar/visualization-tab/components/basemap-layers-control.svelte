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
  import {
    basemapLayersStore,
    type BasemapLayerId,
    type BasemapLayerConfig
  } from '$lib/features/map/stores/basemap-layers.store.svelte';

  interface LayerUIConfig {
    id: BasemapLayerId;
    name: string;
    icon: typeof Earth;
    hasColor: boolean;
    hasStroke: boolean;
  }

  const LAYER_UI_CONFIG: LayerUIConfig[] = [
    {
      id: 'terre',
      name: 'Terre',
      icon: Earth,
      hasColor: true,
      hasStroke: true
    },
    {
      id: 'mers',
      name: 'Mers / Océans',
      icon: Globe,
      hasColor: true,
      hasStroke: false
    },
    {
      id: 'lacs',
      name: 'Lacs',
      icon: WatsonHealthStackedMove,
      hasColor: true,
      hasStroke: false
    },
    {
      id: 'rivieres',
      name: 'Rivières',
      icon: WatsonHealthStackedMove,
      hasColor: true,
      hasStroke: false
    },
    {
      id: 'relief',
      name: 'Relief',
      icon: ChartLine,
      hasColor: true,
      hasStroke: false
    },
    {
      id: 'equateur',
      name: 'Équateur',
      icon: TextAlignJustify,
      hasColor: true,
      hasStroke: false
    },
    {
      id: 'meridiens',
      name: 'Méridiens / Parallèles',
      icon: TextAlignJustify,
      hasColor: true,
      hasStroke: false
    },
    {
      id: 'frontieres',
      name: 'Frontières / Limites',
      icon: Road,
      hasColor: true,
      hasStroke: false
    },
    {
      id: 'villes',
      name: 'Villes',
      icon: Location,
      hasColor: true,
      hasStroke: false
    }
  ];

  const layers = $derived(basemapLayersStore.layers);

  let expandedLayerId = $state<BasemapLayerId | null>(null);

  function getLayerConfig(id: BasemapLayerId): BasemapLayerConfig | undefined {
    return layers.find((l) => l.id === id);
  }

  function getLayerColor(layer: BasemapLayerConfig): string | undefined {
    if ('fillColor' in layer) return layer.fillColor;
    if ('color' in layer) return layer.color;
    return undefined;
  }

  function getLayerOpacity(layer: BasemapLayerConfig): number {
    if ('fillOpacity' in layer) return layer.fillOpacity;
    if ('opacity' in layer) return layer.opacity;
    return 100;
  }

  function getLayerStrokeColor(layer: BasemapLayerConfig): string | undefined {
    if ('strokeColor' in layer) return layer.strokeColor;
    return undefined;
  }

  function getLayerStrokeWidth(layer: BasemapLayerConfig): number | undefined {
    if ('strokeThickness' in layer) return layer.strokeThickness;
    if ('thickness' in layer) return layer.thickness;
    return undefined;
  }

  function toggleLayerVisibility(layerId: BasemapLayerId) {
    const layer = getLayerConfig(layerId);
    if (layer) {
      basemapLayersStore.setLayerVisibility(layerId, !layer.visible);
    }
  }

  function toggleExpanded(layerId: BasemapLayerId) {
    expandedLayerId = expandedLayerId === layerId ? null : layerId;
  }

  function updateLayerOpacity(layerId: BasemapLayerId, opacity: number) {
    const layer = getLayerConfig(layerId);
    if (!layer) return;

    if ('fillOpacity' in layer) {
      basemapLayersStore.updateLayer(layerId, {
        fillOpacity: opacity
      } as never);
    } else if ('opacity' in layer) {
      basemapLayersStore.updateLayer(layerId, { opacity } as never);
    }
  }

  function updateLayerColor(layerId: BasemapLayerId, color: string) {
    const layer = getLayerConfig(layerId);
    if (!layer) return;

    if ('fillColor' in layer) {
      basemapLayersStore.updateLayer(layerId, { fillColor: color } as never);
    } else if ('color' in layer) {
      basemapLayersStore.updateLayer(layerId, { color } as never);
    }
  }

  function updateLayerStrokeColor(layerId: BasemapLayerId, color: string) {
    basemapLayersStore.updateLayer(layerId, { strokeColor: color } as never);
  }

  function updateLayerStrokeWidth(layerId: BasemapLayerId, width: number) {
    const layer = getLayerConfig(layerId);
    if (!layer) return;

    if ('strokeThickness' in layer) {
      basemapLayersStore.updateLayer(layerId, {
        strokeThickness: width
      } as never);
    } else if ('thickness' in layer) {
      basemapLayersStore.updateLayer(layerId, { thickness: width } as never);
    }
  }

  function handleResetLayers() {
    basemapLayersStore.resetToDefaults();
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
    {#each LAYER_UI_CONFIG as uiConfig (uiConfig.id)}
      {@const layer = getLayerConfig(uiConfig.id)}
      {@const IconComponent = uiConfig.icon}
      {#if layer}
        {@const layerColor = getLayerColor(layer)}
        {@const layerOpacity = getLayerOpacity(layer)}
        {@const layerStrokeColor = getLayerStrokeColor(layer)}
        {@const layerStrokeWidth = getLayerStrokeWidth(layer)}
        <div
          class="layer-item"
          class:expanded={expandedLayerId === uiConfig.id}
        >
          <div class="layer-main">
            <button
              type="button"
              class="layer-toggle"
              class:visible={layer.visible}
              onclick={() => toggleLayerVisibility(uiConfig.id)}
              aria-label={layer.visible ? m.layers_hide() : m.layers_show()}
            >
              <div class="visibility-indicator"></div>
            </button>

            <div class="layer-icon">
              <IconComponent size={16} />
            </div>

            <span class="layer-name" class:dimmed={!layer.visible}
              >{uiConfig.name}</span
            >

            <button
              type="button"
              class="layer-expand"
              class:active={expandedLayerId === uiConfig.id}
              onclick={() => toggleExpanded(uiConfig.id)}
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

          {#if expandedLayerId === uiConfig.id}
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
                        value={layerOpacity}
                        hideTextInput
                        on:change={(e) =>
                          updateLayerOpacity(uiConfig.id, e.detail)}
                      />
                      <span class="setting-value">{layerOpacity}%</span>
                    </div>
                  </Column>
                </Row>

                {#if layerColor !== undefined}
                  <Row>
                    <Column sm={4} md={8} lg={16}>
                      <div class="color-row">
                        <span class="setting-label">{m.background()}</span>
                        <input
                          type="color"
                          class="color-input"
                          value={layerColor}
                          oninput={(e: Event) => {
                            const target = e.target as HTMLInputElement;
                            updateLayerColor(uiConfig.id, target.value);
                          }}
                        />
                        <span class="color-value">{layerColor}</span>
                      </div>
                    </Column>
                  </Row>
                {/if}

                {#if layerStrokeColor !== undefined}
                  <Row>
                    <Column sm={4} md={8} lg={16}>
                      <div class="color-row">
                        <span class="setting-label">{m.stroke()}</span>
                        <input
                          type="color"
                          class="color-input"
                          value={layerStrokeColor}
                          oninput={(e: Event) => {
                            const target = e.target as HTMLInputElement;
                            updateLayerStrokeColor(uiConfig.id, target.value);
                          }}
                        />
                        <span class="color-value">{layerStrokeColor}</span>
                      </div>
                    </Column>
                  </Row>
                {/if}

                {#if layerStrokeWidth !== undefined}
                  <Row>
                    <Column sm={4} md={8} lg={16}>
                      <div class="slider-row">
                        <span class="setting-label">{m.thickness()}</span>
                        <Slider
                          min={0}
                          max={5}
                          step={0.5}
                          value={layerStrokeWidth}
                          hideTextInput
                          on:change={(e) =>
                            updateLayerStrokeWidth(uiConfig.id, e.detail)}
                        />
                        <span class="setting-value">{layerStrokeWidth}px</span>
                      </div>
                    </Column>
                  </Row>
                {/if}
              </Grid>
            </div>
          {/if}
        </div>
      {/if}
    {/each}
  </div>

  <div class="footer">
    <Button kind="ghost" size="small" on:click={handleResetLayers}
      >{m.reset_layers()}</Button
    >
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
