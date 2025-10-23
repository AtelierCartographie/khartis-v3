<script lang="ts">
  import { RoboticArmService } from './robotic-arm.service';
  import { RoboticArmStatus } from './robotic-arm.types';
  import type { RoboticArmResult } from './robotic-arm.types';

  interface DemoResult extends RoboticArmResult<unknown> {
    label?: string;
  }

  let results = $state<DemoResult[]>([]);
  let isRunning = $state(false);

  async function runDemo() {
    isRunning = true;
    results = [];

    try {
      addResult('Listing datasets...', null);
      const listResult = RoboticArmService.listDatasets();
      addResult('List datasets', listResult);

      if (listResult.data && listResult.data.length > 0) {
        const firstDataset = listResult.data[0];

        addResult('Selecting first dataset...', null);
        const selectResult = RoboticArmService.selectDataset(firstDataset.id);
        addResult('Select dataset', selectResult);

        addResult('Auto-detecting geographic columns...', null);
        const geoResult = RoboticArmService.autoDetectGeo();
        addResult('Auto-detect geo', geoResult);

        if (geoResult.data?.hasGeoColumns) {
          addResult('Suggesting basemaps...', null);
          const suggestResult = await RoboticArmService.suggestBasemap();
          addResult('Suggest basemap', suggestResult);

          if (suggestResult.data && suggestResult.data.length > 0) {
            const topBasemap = suggestResult.data[0];

            addResult(`Selecting basemap: ${topBasemap.basemapTitle}...`, null);
            const basemapResult = RoboticArmService.selectBasemap(
              topBasemap.basemapFile
            );
            addResult('Select basemap', basemapResult);

            addResult('Getting join statistics...', null);
            const statsResult = RoboticArmService.getJoinStatistics();
            addResult('Join statistics', statsResult);
          }
        }
      }

      addResult('Running full auto-configuration...', null);
      const autoResult = await RoboticArmService.autoConfigurePipeline();
      addResult('Auto-configure pipeline', autoResult);
    } catch (error) {
      addResult('Error', {
        status: RoboticArmStatus.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    } finally {
      isRunning = false;
    }
  }

  function addResult(label: string, result: RoboticArmResult<unknown> | null) {
    if (result) {
      results = [...results, { ...result, label }];
    } else {
      results = [
        ...results,
        {
          status: RoboticArmStatus.INFO,
          message: label,
          timestamp: new Date().toISOString()
        }
      ];
    }
  }

  function getStatusColor(status: RoboticArmStatus): string {
    switch (status) {
      case RoboticArmStatus.SUCCESS:
        return 'green';
      case RoboticArmStatus.ERROR:
        return 'red';
      case RoboticArmStatus.WARNING:
        return 'orange';
      case RoboticArmStatus.INFO:
        return 'blue';
      default:
        return 'gray';
    }
  }

  function formatTimestamp(ts: string): string {
    return new Date(ts).toLocaleTimeString();
  }
</script>

<div class="demo-container">
  <h1>Robotic Arm Service - Demo</h1>

  <div class="actions">
    <button onclick={runDemo} disabled={isRunning}>
      {isRunning ? 'Running...' : 'Run Demo'}
    </button>
  </div>

  <div class="results">
    {#each results as result, i}
      <div
        class="result-item"
        style="border-left-color: {getStatusColor(result.status)}"
      >
        <div class="result-header">
          <span
            class="result-status"
            style="color: {getStatusColor(result.status)}"
          >
            [{result.status}]
          </span>
          <span class="result-time">{formatTimestamp(result.timestamp)}</span>
        </div>

        <div class="result-message">{result.message}</div>

        {#if result.data}
          <details>
            <summary>View Data</summary>
            <pre>{JSON.stringify(result.data, null, 2)}</pre>
          </details>
        {/if}

        {#if result.error}
          <div class="result-error">Error: {result.error}</div>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .demo-container {
    padding: 2rem;
    max-width: 1200px;
    margin: 0 auto;
    font-family: 'IBM Plex Sans', sans-serif;
  }

  h1 {
    font-size: 2rem;
    margin-bottom: 2rem;
    color: #161616;
  }

  .actions {
    margin-bottom: 2rem;
  }

  button {
    background: #0f62fe;
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    font-size: 1rem;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.2s;
  }

  button:hover:not(:disabled) {
    background: #0353e9;
  }

  button:disabled {
    background: #8d8d8d;
    cursor: not-allowed;
  }

  .results {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .result-item {
    border-left: 4px solid;
    padding: 1rem;
    background: #f4f4f4;
    border-radius: 4px;
  }

  .result-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
  }

  .result-status {
    font-weight: 600;
  }

  .result-time {
    color: #525252;
  }

  .result-message {
    font-size: 1rem;
    margin-bottom: 0.5rem;
  }

  .result-error {
    color: red;
    font-size: 0.875rem;
    margin-top: 0.5rem;
  }

  details {
    margin-top: 0.5rem;
  }

  summary {
    cursor: pointer;
    font-size: 0.875rem;
    color: #0f62fe;
    user-select: none;
  }

  pre {
    background: white;
    padding: 1rem;
    border-radius: 4px;
    overflow-x: auto;
    font-size: 0.75rem;
    margin-top: 0.5rem;
  }
</style>
