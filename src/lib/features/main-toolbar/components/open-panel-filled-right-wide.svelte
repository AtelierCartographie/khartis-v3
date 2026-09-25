<script lang="ts">
  import type { SVGAttributes } from 'svelte/elements';

  interface Props extends SVGAttributes<SVGSVGElement> {
    size?: number;
  }

  // The Carbon set stops at open-panel--filled--right, whose panel is narrow;
  // this is the same glyph on the same 32 grid with the wide panel.
  const { size = 16, ...restProps }: Props = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 32 32"
  fill="currentColor"
  preserveAspectRatio="xMidYMid meet"
  width={size}
  height={size}
  aria-hidden="true"
  {...restProps}
>
  <path
    d="M28,4H4A2,2,0,0,0,2,6V26a2,2,0,0,0,2,2H28a2,2,0,0,0,2-2V6A2,2,0,0,0,28,4ZM4,6H12V26H4Z"
  />
</svg>
