<script lang="ts">
  import type { FileType } from '$lib/features/commons/store/create-project.types';
  import { m } from '$lib/paraglide/messages.js';
  import { RadioButton, Tag } from 'carbon-components-svelte';
  import { DocumentBlank, Earth } from 'carbon-icons-svelte';
  import { isTabularFileType, type DataRole } from '../types';

  interface Props {
    fileId: string;
    fileName: string;
    fileType: FileType;
    assignedRole: DataRole;
    groupName: string;
    onRoleChange: (fileId: string, role: DataRole) => void;
  }

  let {
    fileId,
    fileName,
    fileType,
    assignedRole,
    groupName,
    onRoleChange
  }: Props = $props();

  const isTabular = $derived(isTabularFileType(fileType));

  function handleRoleChange(role: DataRole) {
    onRoleChange(fileId, role);
  }

  function getFileTypeLabel(type: FileType): string {
    const labels: Record<string, string> = {
      csv: 'CSV',
      tsv: 'TSV',
      geojson: 'GeoJSON',
      shapefile: 'Shapefile',
      geopackage: 'GeoPackage',
      geoparquet: 'GeoParquet',
      kml: 'KML',
      kmz: 'KMZ',
      unknown: 'Unknown'
    };
    return labels[type] || type.toUpperCase();
  }

  function getTagType(type: FileType): 'blue' | 'green' | 'purple' | 'gray' {
    if (type === 'csv' || type === 'tsv') return 'blue';
    if (type === 'geojson') return 'green';
    if (type === 'shapefile' || type === 'geopackage') return 'purple';
    return 'gray';
  }
</script>

<div class="file-role-card">
  <div class="file-info">
    <div class="file-icon">
      {#if isTabular}
        <DocumentBlank size={24} />
      {:else}
        <Earth size={24} />
      {/if}
    </div>
    <div class="file-details">
      <span class="file-name">{fileName}</span>
      <Tag type={getTagType(fileType)} size="sm">
        {getFileTypeLabel(fileType)}
      </Tag>
    </div>
  </div>

  <div class="role-selector">
    <RadioButton
      labelText={m.data_type_role_tabular()}
      value="tabular"
      checked={assignedRole === 'tabular'}
      name={groupName}
      on:change={() => handleRoleChange('tabular')}
    />
    <RadioButton
      labelText={m.data_type_role_geographic()}
      value="geographic"
      checked={assignedRole === 'geographic'}
      name={groupName}
      on:change={() => handleRoleChange('geographic')}
    />
  </div>
</div>

<style>
  .file-role-card {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
    padding: var(--cds-spacing-05);
    background-color: var(--cds-layer-01);
    border: 1px solid var(--cds-border-subtle);
    border-radius: var(--cds-border-radius);
  }

  .file-info {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-04);
  }

  .file-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background-color: var(--cds-layer-02);
    border-radius: var(--cds-border-radius);
    color: var(--cds-icon-primary);
  }

  .file-details {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .file-name {
    font-weight: 600;
    color: var(--cds-text-primary);
    word-break: break-word;
  }

  .role-selector {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
    padding-left: var(--cds-spacing-07);
  }
</style>
