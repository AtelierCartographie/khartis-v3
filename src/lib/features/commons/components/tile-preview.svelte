<script lang="ts">
  import { ColorPalette, Earth } from 'carbon-icons-svelte';
  import clsx from 'clsx';

  interface Props {
    ratio: string;
    label: string;
    theme?: 'default' | 'suggestion';
    icon?: 'earth' | 'palette' | 'none';
    className?: string;
  }

  let {
    ratio,
    label,
    theme = 'default',
    icon = 'earth',
    className
  }: Props = $props();

  const previewClasses = $derived(
    clsx('tile-preview', className, {
      suggestion: theme === 'suggestion'
    })
  );

  const Icon = $derived(
    icon === 'palette' ? ColorPalette : icon === 'earth' ? Earth : undefined
  );
</script>

<div class={previewClasses}>
  {#if Icon}
    <Icon size={32} />
  {:else}
    <span class="neutral-preview-glyph" aria-hidden="true"></span>
  {/if}

  <div class="preview-copy">
    <p class="preview-ratio">{ratio}</p>
    <p class="preview-label">{label}</p>
  </div>
</div>

<style lang="scss">
  .tile-preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    gap: var(--cds-spacing-03);
    padding: var(--cds-spacing-04);
    background: var(
      --tile-preview-background,
      var(--tile-preview-default-background, var(--cds-layer-02, #ffffff))
    );
    color: var(
      --tile-preview-color,
      var(--tile-preview-default-color, var(--cds-interactive-03, #726e6e))
    );
    text-align: center;
    box-sizing: border-box;
  }

  .tile-preview.suggestion {
    --tile-preview-default-background: var(
      --khartis-additions-layer-02-suggestions,
      #ffffff
    );
    --tile-preview-default-color: var(
      --khartis-additions-interactive-suggestions,
      #0072c3
    );
  }

  .neutral-preview-glyph {
    display: block;
    width: 32px;
    height: 24px;
    border: 2px solid currentColor;
    box-sizing: border-box;
  }

  .preview-copy {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .preview-ratio,
  .preview-label {
    margin: 0;
    color: inherit;
  }

  .preview-ratio {
    font-size: 1rem;
    line-height: 1.375rem;
    font-weight: 400;
  }

  .preview-label {
    font-size: 0.75rem;
    line-height: 1rem;
    letter-spacing: 0.32px;
  }
</style>
