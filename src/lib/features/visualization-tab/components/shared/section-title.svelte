<script lang="ts">
  interface Props {
    title: string;
  }

  let { title }: Props = $props();
</script>

<p class="section-title">{title}</p>

<style lang="scss">
  .section-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-primary);
    margin: var(--cds-spacing-02) 0;
    padding-bottom: var(--cds-spacing-02);
    border-bottom: 1px solid var(--cds-border-subtle);
  }
</style>
