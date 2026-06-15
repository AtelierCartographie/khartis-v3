<script lang="ts">
  import { SkeletonPlaceholder } from 'carbon-components-svelte';
  import clsx from 'clsx';
  import TilePreview from './tile-preview.svelte';

  interface Props {
    src?: string;
    alt: string;
    ratio: string;
    label: string;
    theme?: 'default' | 'suggestion';
    objectFit?: 'contain' | 'cover';
    className?: string;
  }

  let {
    src,
    alt,
    ratio,
    label,
    theme = 'default',
    objectFit = 'cover',
    className
  }: Props = $props();

  let loaded = $state(false);
  let failed = $state(false);

  const showImage = $derived(Boolean(src) && !failed);
  const wrapperClasses = $derived(
    clsx('thumbnail-preview', `thumbnail-preview--${objectFit}`, className)
  );
</script>

<div class={wrapperClasses}>
  {#if showImage}
    {#if !loaded}
      <div class="thumbnail-skeleton" aria-hidden="true">
        <SkeletonPlaceholder style="width: 100%; height: 100%;" />
      </div>
    {/if}

    <img
      class="thumbnail-image"
      class:is-loaded={loaded}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onload={() => (loaded = true)}
      onerror={() => (failed = true)}
    />
  {:else}
    <TilePreview ratio={ratio} label={label} theme={theme} />
  {/if}
</div>

<style>
  .thumbnail-preview {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #ffffff;
  }

  .thumbnail-skeleton {
    position: absolute;
    inset: 0;
  }

  .thumbnail-image {
    display: block;
    width: 100%;
    height: 100%;
    background: #ffffff;
    opacity: 0;
    transition: opacity 0.2s ease-in-out;
  }

  .thumbnail-preview--cover .thumbnail-image {
    object-fit: cover;
  }

  .thumbnail-preview--contain .thumbnail-image {
    object-fit: contain;
  }

  .thumbnail-image.is-loaded {
    opacity: 1;
  }
</style>
