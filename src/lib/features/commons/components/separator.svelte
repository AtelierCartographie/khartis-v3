<script lang="ts">
  import clsx from 'clsx';

  interface Props {
    orientation: 'horizontal' | 'vertical';
    class?: string;
  }

  let { orientation, class: className }: Props = $props();
</script>

<div
  class={clsx('kh-separator', className)}
  class:horizontal={orientation === 'horizontal'}
  class:vertical={orientation === 'vertical'}
></div>

<style>
  .kh-separator {
    background-color: var(--cds-ui-03);
  }

  .kh-separator.horizontal {
    width: 100%;
    height: 1px;
  }

  .kh-separator.vertical {
    width: 1px;
    height: 100%;
  }
</style>
