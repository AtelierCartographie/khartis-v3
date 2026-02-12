<script lang="ts">
  import type { Component } from 'svelte';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnyIconComponent = Component<any>;

  interface Props {
    title: string;
    icon?: AnyIconComponent;
    showDivider?: boolean;
  }

  let { title, icon, showDivider = false }: Props = $props();
</script>

<header class="section-header" class:with-divider={showDivider}>
  <div class="header-content">
    {#if icon}
      {@const Icon = icon}
      <div class="header-icon">
        <Icon size={24} />
      </div>
    {/if}
    <h5 class="header-title">{title}</h5>
  </div>
  {#if showDivider}
    <div class="header-divider"></div>
  {/if}
</header>

<style lang="scss">
  .section-header {
    margin-bottom: 12px;
  }

  .section-header.with-divider {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05, 16px);
    margin-bottom: 0;
  }

  .header-content {
    display: flex;
    align-items: flex-start;
    gap: var(--cds-spacing-04, 12px);
  }

  .with-divider .header-content {
    padding: 0 16px;
  }

  .header-icon {
    display: flex;
    align-items: center;
    padding-top: var(--cds-spacing-02, 4px);
    color: var(--cds-text-primary, #161616);
  }

  .header-title {
    font-size: 20px;
    font-weight: 400;
    line-height: 28px;
    color: var(--cds-text-primary, #161616);
    margin: 0;
    flex: 1;
  }

  .header-divider {
    width: 100%;
    height: 1px;
    background: var(--cds-border-subtle-00, #e0e0e0);
  }
</style>
