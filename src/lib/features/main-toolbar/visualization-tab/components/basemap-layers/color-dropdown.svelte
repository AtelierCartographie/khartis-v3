<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { Dropdown } from 'carbon-components-svelte';
  import { BasemapColorId, BASEMAP_COLOR_VALUES } from '../../../constants';

  interface ColorOption {
    id: BasemapColorId;
    color: string;
    text: string;
  }

  interface Props {
    label?: string;
    value?: string;
    colors?: ColorOption[];
    onchange?: (value: string) => void;
  }

  function getDefaultColors(): ColorOption[] {
    return [
      {
        id: BasemapColorId.GRAY_LIGHT,
        color: BASEMAP_COLOR_VALUES[BasemapColorId.GRAY_LIGHT],
        text: m.basemap_color_gray_light()
      },
      {
        id: BasemapColorId.GRAY,
        color: BASEMAP_COLOR_VALUES[BasemapColorId.GRAY],
        text: m.basemap_color_gray()
      },
      {
        id: BasemapColorId.GRAY_DARK,
        color: BASEMAP_COLOR_VALUES[BasemapColorId.GRAY_DARK],
        text: m.basemap_color_gray_dark()
      },
      {
        id: BasemapColorId.BLUE_LIGHT,
        color: BASEMAP_COLOR_VALUES[BasemapColorId.BLUE_LIGHT],
        text: m.basemap_color_blue_light()
      },
      {
        id: BasemapColorId.BLUE,
        color: BASEMAP_COLOR_VALUES[BasemapColorId.BLUE],
        text: m.basemap_color_blue()
      },
      {
        id: BasemapColorId.BEIGE,
        color: BASEMAP_COLOR_VALUES[BasemapColorId.BEIGE],
        text: m.basemap_color_beige()
      },
      {
        id: BasemapColorId.WHITE,
        color: BASEMAP_COLOR_VALUES[BasemapColorId.WHITE],
        text: m.basemap_color_white()
      },
      {
        id: BasemapColorId.BLACK,
        color: BASEMAP_COLOR_VALUES[BasemapColorId.BLACK],
        text: m.basemap_color_black()
      }
    ];
  }

  let {
    label = m.basemap_config_color(),
    value = BASEMAP_COLOR_VALUES[BasemapColorId.GRAY_LIGHT],
    colors = getDefaultColors(),
    onchange
  }: Props = $props();

  const selectedColor = $derived(
    colors.find((c) => c.color === value || c.id === value) || colors[0]
  );

  function handleSelect(e: CustomEvent<{ selectedId: string }>) {
    const selected = colors.find((c) => c.id === e.detail.selectedId);
    if (selected) {
      onchange?.(selected.color);
    }
  }
</script>

<div
  class="color-dropdown-wrapper"
  style:--selected-color={selectedColor.color}
>
  <Dropdown
    size="sm"
    titleText={label}
    selectedId={selectedColor.id}
    items={colors}
    on:select={handleSelect}
    let:item
  >
    <div class="color-item">
      <span class="color-swatch" style="background-color: {item.color}"></span>
      <span class="color-label">{item.text}</span>
    </div>
  </Dropdown>
</div>

<style lang="scss">
  .color-dropdown-wrapper {
    :global(.bx--dropdown) {
      max-height: none;
    }

    :global(.bx--list-box__menu) {
      max-height: 200px;
    }

    :global(.bx--list-box__label) {
      display: flex;
      align-items: center;
      gap: var(--cds-spacing-02);

      &::before {
        content: '';
        display: inline-block;
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        background-color: var(--selected-color);
        border: 1px solid var(--cds-border-subtle);
      }
    }
  }

  .color-item {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-02);
  }

  .color-swatch {
    width: 16px;
    height: 16px;
    border: 1px solid var(--cds-border-subtle);
    flex-shrink: 0;
  }

  .color-label {
    font-size: 0.875rem;
  }
</style>
