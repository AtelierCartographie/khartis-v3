<script lang="ts">
  import type { Snippet } from 'svelte';
  import { motionDuration } from '$lib/features/commons/utils/step-transition.svelte';

  interface Props {
    /** The content is replaced, and revealed, each time this value changes. */
    value: unknown;
    children: Snippet;
  }

  const { value, children }: Props = $props();

  let hasRendered = false;

  // The wrapper is display: contents so it never enters the host's layout;
  // its children carry the motion instead.
  function reveal(node: HTMLElement): void {
    if (!hasRendered) {
      hasRendered = true;
      return;
    }
    const duration = motionDuration(220);
    if (duration === 0) return;
    for (const child of Array.from(node.children)) {
      child.animate(
        [
          { opacity: 0, transform: 'translateY(4px)' },
          { opacity: 1, transform: 'none' }
        ],
        { duration, easing: 'cubic-bezier(0.2, 0, 0.38, 0.9)' }
      );
    }
  }
</script>

{#key value}
  <div class="switched-content" use:reveal>
    {@render children()}
  </div>
{/key}

<style>
  .switched-content {
    display: contents;
  }
</style>
