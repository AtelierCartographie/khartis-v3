<script lang="ts">
  import { ProgressBar, Tag } from 'carbon-components-svelte';
  import {
    CheckmarkFilled,
    WarningFilled,
    ErrorFilled
  } from 'carbon-icons-svelte';
  import type { UploadedFile } from '../store/create-project.types';

  let { file = $bindable() }: { file: UploadedFile } = $props();

  function getStatusIcon(status: UploadedFile['status']) {
    switch (status) {
      case 'complete':
        return CheckmarkFilled;
      case 'error':
        return ErrorFilled;
      default:
        return null;
    }
  }

  function getStatusColor(status: UploadedFile['status']) {
    switch (status) {
      case 'complete':
        return 'green';
      case 'error':
        return 'red';
      case 'processing':
        return 'blue';
      default:
        return 'gray';
    }
  }

  const hasProgress = $derived(
    file.status === 'processing' && file.uploadProgress !== undefined
  );
  const hasDuplicates = $derived(file.duplicates?.hasDuplicates);
</script>

<div class="file-progress-wrapper">
  <div class="file-info">
    <span class="file-name">{file.name}</span>
    {#if file.status === 'complete'}
      <CheckmarkFilled size={16} class="status-icon success" />
    {:else if file.status === 'error'}
      <ErrorFilled size={16} class="status-icon error" />
    {/if}
  </div>

  {#if hasProgress}
    <ProgressBar
      value={file.uploadProgress || 0}
      max={100}
      size="sm"
      helperText={`${file.uploadProgress || 0}%`}
    />
  {/if}

  {#if file.errorMessage}
    <div class="error-message">
      {file.errorMessage}
    </div>
  {/if}

  {#if hasDuplicates && file.duplicates}
    <Tag type="outline" size="sm">
      <WarningFilled size={16} />
      {file.duplicates.duplicateCount} duplicate rows
    </Tag>
  {/if}

  {#if file.statistics}
    <div class="statistics">
      <span class="stat-item">
        Columns: {Object.keys(file.statistics).length}
      </span>
      {#if file.parsedData}
        <span class="stat-item">
          Rows: {file.parsedData.length}
        </span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .file-progress-wrapper {
    padding: 8px 0;
    border-bottom: 1px solid var(--cds-ui-03);
  }

  .file-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .file-name {
    font-size: 14px;
    font-weight: 500;
  }

  :global(.status-icon) {
    margin-left: 8px;
  }

  :global(.status-icon.success) {
    fill: var(--cds-support-02);
  }

  :global(.status-icon.error) {
    fill: var(--cds-support-01);
  }

  .error-message {
    color: var(--cds-support-01);
    font-size: 12px;
    margin-top: 4px;
  }

  .statistics {
    display: flex;
    gap: 16px;
    margin-top: 8px;
    font-size: 12px;
    color: var(--cds-text-02);
  }

  .stat-item {
    display: flex;
    align-items: center;
  }
</style>
