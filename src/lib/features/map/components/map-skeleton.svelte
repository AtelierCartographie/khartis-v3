<script lang="ts">
  interface Props {
    width?: string;
    height?: string;
    paused?: boolean;
  }

  let { width = '100%', height = '100%', paused = false }: Props = $props();
</script>

<div
  class="map-skeleton"
  class:paused
  style="width: {width}; height: {height};"
></div>

<style>
  .map-skeleton {
    background-color: #e8e8e8;
    position: relative;
    overflow: hidden;
    will-change: transform;
  }

  .map-skeleton::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      #f5f5f5 50%,
      transparent 100%
    );
    animation: shimmer 2s linear infinite;
    will-change: transform;
  }

  .map-skeleton.paused::before {
    animation: none;
  }

  @keyframes shimmer {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }
</style>
