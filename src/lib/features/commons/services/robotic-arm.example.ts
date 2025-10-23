import { RoboticArmService } from './robotic-arm.service';
import { RoboticArmCommand, RoboticArmStatus } from './robotic-arm.types';

export async function exampleUsage() {
  console.log('=== ROBOTIC ARM SERVICE - EXAMPLES ===\n');

  console.log('1. LIST ALL DATASETS');
  const listResult = RoboticArmService.listDatasets();
  console.log(listResult);

  if (listResult.data && listResult.data.length > 0) {
    const firstDatasetId = listResult.data[0].id;

    console.log('\n2. SELECT FIRST DATASET');
    const selectResult = RoboticArmService.selectDataset(firstDatasetId);
    console.log(selectResult);

    console.log('\n3. AUTO-DETECT GEOGRAPHIC COLUMNS');
    const geoResult = RoboticArmService.autoDetectGeo();
    console.log(geoResult);

    if (
      geoResult.status === RoboticArmStatus.SUCCESS &&
      geoResult.data?.hasGeoColumns
    ) {
      console.log('\n4. SUGGEST BASEMAPS');
      const suggestionResult = await RoboticArmService.suggestBasemap();
      console.log(suggestionResult);

      if (suggestionResult.data && suggestionResult.data.length > 0) {
        const topBasemap = suggestionResult.data[0];

        console.log('\n5. SELECT TOP BASEMAP SUGGESTION');
        const basemapResult = RoboticArmService.selectBasemap(
          topBasemap.basemapFile
        );
        console.log(basemapResult);

        console.log('\n6. GET JOIN STATISTICS');
        const statsResult = RoboticArmService.getJoinStatistics();
        console.log(statsResult);

        if (statsResult.data?.hasErrors) {
          console.log('\n7. APPLY JOIN CORRECTIONS');
          const correctionResult = RoboticArmService.applyJoinCorrections();
          console.log(correctionResult);
        }
      }
    }
  }

  console.log('\n=== FULL AUTO-CONFIGURATION ===\n');
  const autoConfigResult = await RoboticArmService.autoConfigurePipeline();
  console.log(autoConfigResult);
}

export async function commandPatternExample() {
  console.log('=== COMMAND PATTERN EXAMPLES ===\n');

  console.log('1. LIST DATASETS VIA COMMAND');
  const listCmd = await RoboticArmService.executeCommand(
    RoboticArmCommand.LIST_DATASETS
  );
  console.log(listCmd);

  console.log('\n2. AUTO-CONFIGURE PIPELINE VIA COMMAND');
  const autoCmd = await RoboticArmService.executeCommand(
    RoboticArmCommand.AUTO_CONFIGURE_PIPELINE
  );
  console.log(autoCmd);

  console.log('\n3. RENAME DATASET VIA COMMAND');
  const renameCmd = await RoboticArmService.executeCommand(
    RoboticArmCommand.RENAME_DATASET,
    {
      datasetId: 'dataset-123',
      newName: 'My Renamed Dataset'
    }
  );
  console.log(renameCmd);
}

export async function specificScenarios() {
  console.log('=== SPECIFIC SCENARIOS ===\n');

  console.log('SCENARIO 1: Dataset with Lat/Lon Coordinates');
  const coordsResult = RoboticArmService.autoDetectGeo();
  if (coordsResult.data?.detectedType === 'coordinates') {
    RoboticArmService.configureGeolocation(
      'coordinates',
      coordsResult.data.latitudeColumn,
      coordsResult.data.longitudeColumn
    );
    console.log('Configured as coordinate-based geolocation');
  }

  console.log('\nSCENARIO 2: Dataset with Geographic Entities');
  const entitiesResult = RoboticArmService.autoDetectGeo();
  if (entitiesResult.data?.detectedType === 'location_name') {
    RoboticArmService.configureGeolocation(
      'entities',
      entitiesResult.data.locationColumn
    );
    console.log('Configured as entity-based geolocation');
  }

  console.log('\nSCENARIO 3: Dataset with ISO/NUTS Codes');
  const codesResult = RoboticArmService.autoDetectGeo();
  if (codesResult.data?.detectedType === 'geo_code') {
    RoboticArmService.configureGeolocation(
      'entities',
      codesResult.data.geoCodeColumn
    );
    console.log(
      `Configured with geo code pattern: ${codesResult.data.geoCodePattern}`
    );
  }

  console.log('\nSCENARIO 4: Reset Modified Dataset');
  const datasets = RoboticArmService.listDatasets();
  if (datasets.data) {
    const modifiedDataset = datasets.data.find((d) => d.hasModifications);
    if (modifiedDataset) {
      const resetResult = RoboticArmService.resetDataset(modifiedDataset.id);
      console.log(resetResult);
    }
  }
}
