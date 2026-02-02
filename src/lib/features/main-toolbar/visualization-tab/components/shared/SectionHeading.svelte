<script lang="ts">
  interface Props {
    title: string;
  }

  let { title }: Props = $props();
</script>

<div class="section-heading">
  <span class="section-heading-text">{title}</span>
  <div class="section-heading-line"></div>
</div>

<style lang="scss">
  .section-heading {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    margin: var(--cds-spacing-05) 0 var(--cds-spacing-04);

    &:first-child {
      margin-top: 0;
    }
  }

  .section-heading-text {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-primary);
    white-space: nowrap;
  }

  .section-heading-line {
    flex: 1;
    height: 1px;
    background-color: var(--cds-border-subtle-01);
    min-width: 40px;
  }
</style>
