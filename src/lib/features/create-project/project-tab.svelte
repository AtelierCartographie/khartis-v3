<script lang="ts">
  import { RadioButton } from 'carbon-components-svelte';
  import clsx from 'clsx';
  import type { Snippet } from 'svelte';

  interface ProjectCardProps {
    title: string;
    icon: Snippet;
    selected?: boolean;
    name?: string;
    onclick?: (e: Event) => void | undefined;
  }

  let {
    title,
    icon,
    selected = false,
    name = 'project-type',
    onclick
  }: ProjectCardProps = $props();
</script>

<div
  class={clsx(
    'project-card w-full relative cursor-pointer pl-5 pt-5 pb-5',
    selected && 'selected'
  )}
  role="button"
  tabindex={0}
  onclick={onclick}
  onkeydown={onclick}
>
  <div class="flex justify-between w-full items-start pb-3">
    <div
      class={clsx(
        'flex items-center justify-center icon-primary opacity-80',
        selected && 'icon-interactive opacity-100'
      )}
    >
      {@render icon()}
    </div>

    <div class="flex justify-end">
      <RadioButton name={name} checked={selected} />
    </div>
  </div>

  <div class="self-start mt-3 mb-5">
    <h6 class="text-left">{title}</h6>
  </div>
</div>

<style>
  .project-card {
    background: linear-gradient(
      0deg,
      rgba(230, 20, 45, 0.14) 0%,
      var(--cds-layer) 100%
    );
    box-sizing: border-box;
  }

  .project-card.selected {
    background: linear-gradient(
      0deg,
      rgba(230, 20, 45, 0.35) 0%,
      rgba(230, 20, 45, 0.05) 100%
    );
  }
</style>
