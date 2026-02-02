<script lang="ts">
  import type { Component } from 'svelte';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnyIconComponent = Component<any>;

  interface Props {
    title: string;
    icon?: AnyIconComponent;
  }

  let { title, icon }: Props = $props();
</script>

<header class="section-header">
  <div class="header-content">
    {#if icon}
      {@const Icon = icon}
      <div class="header-icon">
        <Icon size={24} />
      </div>
    {/if}
    <h5 class="header-title">{title}</h5>
  </div>
</header>

<style lang="scss">
  .section-header {
    margin-bottom: var(--cds-spacing-05);
  }

  .header-content {
    display: flex;
    align-items: flex-start;
    gap: var(--cds-spacing-04);
    margin-bottom: var(--cds-spacing-03);
    padding: 0 var(--cds-spacing-05);
  }

  .header-icon {
    display: flex;
    align-items: center;
    color: var(--cds-icon-primary);
    padding-top: var(--cds-spacing-02);
  }

  .header-title {
    font-size: 1.25rem;
    font-weight: 400;
    line-height: 1.75rem;
    color: var(--cds-text-primary);
    margin: 0;
    flex: 1;
  }
</style>
