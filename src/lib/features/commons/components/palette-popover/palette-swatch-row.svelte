<script lang="ts">
  interface Props {
    colors?: readonly string[];
    background?: string;
    height?: string;
    bordered?: boolean;
    flexFill?: boolean;
  }

  let {
    colors = [],
    background,
    height = '100%',
    bordered = false,
    flexFill = false
  }: Props = $props();

  const rowStyle = $derived(
    [`height: ${height}`, background ? `background: ${background}` : '']
      .filter(Boolean)
      .join('; ')
  );
</script>

<div
  class="palette-swatch-row"
  class:pattern={Boolean(background)}
  class:bordered={bordered}
  class:flex-fill={flexFill}
  style={rowStyle}
>
  {#if !background}
    {#each colors as color, i (i)}
      <div class="palette-swatch-cell" style="background-color: {color}"></div>
    {/each}
  {/if}
</div>

<style lang="scss">
  .palette-swatch-row {
    display: flex;
    width: 100%;
    overflow: hidden;

    &.flex-fill {
      flex: 1;
      width: auto;
    }

    &.bordered {
      border: 1px solid var(--khartis-palette-swatch-border-color);
    }

    &.pattern {
      background-size:
        auto,
        8px 8px,
        auto;
    }
  }

  .palette-swatch-cell {
    flex: 1;
    height: 100%;
  }
</style>
