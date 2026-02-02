<script lang="ts">
  /**
   * StatusIcon - Composant d'icône de statut
   * Basé sur l'analyse Figma du panneau de données
   *
   * Usage:
   *   <StatusIcon status="success" />
   *   <StatusIcon status="warning" size="md" withLabel />
   */

  import type { StatusIconProps } from '../types';
  import {
    CheckmarkFilled,
    WarningAltFilled,
    ErrorFilled,
    InformationFilled
  } from 'carbon-icons-svelte';

  type Props = StatusIconProps;

  let { status, size = 'md', withLabel = false }: Props = $props();

  // Mapping des statuts vers les icônes Carbon
  const iconMap = {
    success: CheckmarkFilled,
    warning: WarningAltFilled,
    error: ErrorFilled,
    info: InformationFilled
  };

  // Mapping des statuts vers les couleurs
  const colorMap = {
    success: 'var(--color-success)',
    warning: 'var(--color-warning)',
    error: 'var(--color-error)',
    info: 'var(--interactive-primary)'
  };

  // Mapping des tailles (en pixels pour les icônes Carbon)
  const sizeMap = {
    sm: 16,
    md: 20,
    lg: 24
  } as const;

  // Mapping des labels
  const labelMap = {
    success: 'Success',
    warning: 'Warning',
    error: 'Error',
    info: 'Info'
  };

  const IconComponent = $derived(iconMap[status]);
  const color = $derived(colorMap[status]);
  const iconSize = $derived(sizeMap[size]);
  const label = $derived(labelMap[status]);
</script>

<div class="status-icon" class:with-label={withLabel}>
  <IconComponent size={iconSize} style="color: {color};" aria-label={label} />

  {#if withLabel}
    <span class="label" style="color: {color};">
      {label}
    </span>
  {/if}
</div>

<style>
  .status-icon {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-02);
  }

  .label {
    font-size: var(--font-size-label);
    font-weight: var(--font-weight-semibold);
  }

  /* States for better accessibility */
  .status-icon:focus-within {
    outline: 2px solid var(--interactive-primary);
    outline-offset: 2px;
    border-radius: var(--border-radius-sm);
  }
</style>
