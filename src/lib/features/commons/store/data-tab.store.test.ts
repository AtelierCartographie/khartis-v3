import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dataTabActions, dataTabState } from './data-tab.store.svelte';
import { GeoreferenceType, JoinStatus } from '../constants/ui.constants';

describe('data-tab store - geolocation state', () => {
  beforeEach(() => {
    dataTabActions.reset();
  });

  afterEach(() => {
    dataTabActions.reset();
  });

  describe('setGeolocationState', () => {
    it('should set geoReference to COORDINATES', () => {
      dataTabActions.setGeolocationState({
        geoReference: GeoreferenceType.COORDINATES
      });

      expect(dataTabState.geolocation.geoReference).toBe(
        GeoreferenceType.COORDINATES
      );
    });

    it('should set geoReference to ENTITIES', () => {
      dataTabActions.setGeolocationState({
        geoReference: GeoreferenceType.ENTITIES
      });

      expect(dataTabState.geolocation.geoReference).toBe(
        GeoreferenceType.ENTITIES
      );
    });

    it('should set latitudeColumn', () => {
      dataTabActions.setGeolocationState({
        latitudeColumn: 'lat'
      });

      expect(dataTabState.geolocation.latitudeColumn).toBe('lat');
    });

    it('should set longitudeColumn', () => {
      dataTabActions.setGeolocationState({
        longitudeColumn: 'lon'
      });

      expect(dataTabState.geolocation.longitudeColumn).toBe('lon');
    });

    it('should set both latitude and longitude columns', () => {
      dataTabActions.setGeolocationState({
        latitudeColumn: 'latitude',
        longitudeColumn: 'longitude'
      });

      expect(dataTabState.geolocation.latitudeColumn).toBe('latitude');
      expect(dataTabState.geolocation.longitudeColumn).toBe('longitude');
    });

    it('should set linkedVariable', () => {
      dataTabActions.setGeolocationState({
        linkedVariable: 2,
        linkedVariableName: 'country'
      });

      expect(dataTabState.geolocation.linkedVariable).toBe(2);
      expect(dataTabState.geolocation.linkedVariableName).toBe('country');
    });

    it('should clear latitudeColumn when set to undefined', () => {
      dataTabActions.setGeolocationState({
        latitudeColumn: 'lat'
      });
      expect(dataTabState.geolocation.latitudeColumn).toBe('lat');

      dataTabActions.setGeolocationState({
        latitudeColumn: undefined
      });
      expect(dataTabState.geolocation.latitudeColumn).toBeUndefined();
    });

    it('should clear longitudeColumn when set to undefined', () => {
      dataTabActions.setGeolocationState({
        longitudeColumn: 'lon'
      });
      expect(dataTabState.geolocation.longitudeColumn).toBe('lon');

      dataTabActions.setGeolocationState({
        longitudeColumn: undefined
      });
      expect(dataTabState.geolocation.longitudeColumn).toBeUndefined();
    });

    it('should clear linkedVariable when set to null', () => {
      dataTabActions.setGeolocationState({
        linkedVariable: 1,
        linkedVariableName: 'name'
      });
      expect(dataTabState.geolocation.linkedVariable).toBe(1);

      dataTabActions.setGeolocationState({
        linkedVariable: null,
        linkedVariableName: ''
      });
      expect(dataTabState.geolocation.linkedVariable).toBeNull();
      expect(dataTabState.geolocation.linkedVariableName).toBe('');
    });

    it('should set multiple geolocation properties at once', () => {
      dataTabActions.setGeolocationState({
        geoReference: GeoreferenceType.COORDINATES,
        latitudeColumn: 'lat',
        longitudeColumn: 'lon'
      });

      expect(dataTabState.geolocation.geoReference).toBe(
        GeoreferenceType.COORDINATES
      );
      expect(dataTabState.geolocation.latitudeColumn).toBe('lat');
      expect(dataTabState.geolocation.longitudeColumn).toBe('lon');
    });

    it('should preserve unmodified properties when updating', () => {
      dataTabActions.setGeolocationState({
        geoReference: GeoreferenceType.COORDINATES,
        latitudeColumn: 'lat',
        longitudeColumn: 'lon'
      });

      dataTabActions.setGeolocationState({
        latitudeColumn: 'latitude'
      });

      expect(dataTabState.geolocation.geoReference).toBe(
        GeoreferenceType.COORDINATES
      );
      expect(dataTabState.geolocation.latitudeColumn).toBe('latitude');
      expect(dataTabState.geolocation.longitudeColumn).toBe('lon');
    });
  });

  describe('reset', () => {
    it('should reset geolocation to default state', () => {
      dataTabActions.setGeolocationState({
        geoReference: GeoreferenceType.COORDINATES,
        latitudeColumn: 'lat',
        longitudeColumn: 'lon',
        linkedVariable: 1,
        linkedVariableName: 'country'
      });

      dataTabActions.reset();

      expect(dataTabState.geolocation.geoReference).toBe(
        GeoreferenceType.ENTITIES
      );
      expect(dataTabState.geolocation.linkedVariable).toBeNull();
      expect(dataTabState.geolocation.linkedVariableName).toBe('');
      expect(dataTabState.geolocation.latitudeColumn).toBeUndefined();
      expect(dataTabState.geolocation.longitudeColumn).toBeUndefined();
    });
  });

  describe('default state', () => {
    it('should have ENTITIES as default geoReference', () => {
      expect(dataTabState.geolocation.geoReference).toBe(
        GeoreferenceType.ENTITIES
      );
    });

    it('should have null linkedVariable by default', () => {
      expect(dataTabState.geolocation.linkedVariable).toBeNull();
    });

    it('should have empty linkedVariableName by default', () => {
      expect(dataTabState.geolocation.linkedVariableName).toBe('');
    });

    it('should have undefined latitudeColumn by default', () => {
      expect(dataTabState.geolocation.latitudeColumn).toBeUndefined();
    });

    it('should have undefined longitudeColumn by default', () => {
      expect(dataTabState.geolocation.longitudeColumn).toBeUndefined();
    });

    it('should have autoDetected true by default', () => {
      expect(dataTabState.geolocation.autoDetected).toBe(true);
    });
  });
});

describe('data-tab store - join state', () => {
  beforeEach(() => {
    dataTabActions.reset();
  });

  afterEach(() => {
    dataTabActions.reset();
  });

  describe('setJoinStats', () => {
    it('should set join statistics', () => {
      dataTabActions.setJoinStats({
        joinedCount: 10,
        toVerifyCount: 2,
        duplicateCount: 1,
        unrecognizedCount: 1,
        totalEntities: 14,
        entities: [
          { dataValue: 'France', status: JoinStatus.JOINED, matches: [] },
          {
            dataValue: 'Germany',
            status: JoinStatus.DUPLICATE,
            matches: ['Germany', 'GER']
          },
          {
            dataValue: 'Unknown',
            status: JoinStatus.UNRECOGNIZED,
            matches: []
          },
          {
            dataValue: 'Spain',
            status: JoinStatus.TO_VERIFY,
            matches: ['Spain', 'ESP']
          }
        ]
      });

      expect(dataTabState.basemapJoin.joinedEntities).toBe(10);
      expect(dataTabState.basemapJoin.entitiesToVerify).toBe(2);
      expect(dataTabState.basemapJoin.duplicateEntities).toEqual(['Germany']);
      expect(dataTabState.basemapJoin.unrecognizedEntities).toEqual([
        'Unknown'
      ]);
      expect(dataTabState.basemapJoin.joinMappings).toHaveLength(1);
      expect(dataTabState.basemapJoin.joinMappings[0].dataValue).toBe('Spain');
    });
  });

  describe('clearJoinStats', () => {
    it('should clear join statistics but keep selectedBasemap and basemapSource', () => {
      dataTabActions.selectBasemap('world-countries');
      dataTabActions.setJoinStats({
        joinedCount: 10,
        toVerifyCount: 2,
        duplicateCount: 0,
        unrecognizedCount: 1,
        totalEntities: 13,
        entities: [
          {
            dataValue: 'Unknown',
            status: JoinStatus.UNRECOGNIZED,
            matches: []
          }
        ]
      });

      dataTabActions.clearJoinStats();

      expect(dataTabState.basemapJoin.joinedEntities).toBe(0);
      expect(dataTabState.basemapJoin.entitiesToVerify).toBe(0);
      expect(dataTabState.basemapJoin.duplicateEntities).toEqual([]);
      expect(dataTabState.basemapJoin.unrecognizedEntities).toEqual([]);
      expect(dataTabState.basemapJoin.joinMappings).toEqual([]);
      expect(dataTabState.basemapJoin.selectedBasemap).toBe('world-countries');
    });
  });

  describe('reset', () => {
    it('should reset basemapJoin to default state', () => {
      dataTabActions.selectBasemap('world-countries');
      dataTabActions.setJoinStats({
        joinedCount: 50,
        toVerifyCount: 5,
        duplicateCount: 1,
        unrecognizedCount: 0,
        totalEntities: 56,
        entities: [
          {
            dataValue: 'Duplicate1',
            status: JoinStatus.DUPLICATE,
            matches: ['A', 'B']
          }
        ]
      });

      dataTabActions.reset();

      expect(dataTabState.basemapJoin.selectedBasemap).toBe('');
      expect(dataTabState.basemapJoin.basemapSource).toBe('catalog');
      expect(dataTabState.basemapJoin.joinedEntities).toBe(0);
      expect(dataTabState.basemapJoin.entitiesToVerify).toBe(0);
      expect(dataTabState.basemapJoin.duplicateEntities).toEqual([]);
      expect(dataTabState.basemapJoin.unrecognizedEntities).toEqual([]);
      expect(dataTabState.basemapJoin.joinMappings).toEqual([]);
    });

    it('should reset enrichData state', () => {
      dataTabActions.setEnrichDataState({
        enrichmentDatasetId: 'enrich-1',
        enrichmentColumn: 'country',
        targetColumn: 'name',
        isEnrichmentActive: true
      });

      dataTabActions.reset();

      expect(dataTabState.enrichData.enrichmentDatasetId).toBeUndefined();
      expect(dataTabState.enrichData.enrichmentColumn).toBeUndefined();
      expect(dataTabState.enrichData.targetColumn).toBeUndefined();
      expect(dataTabState.enrichData.isEnrichmentActive).toBe(false);
    });
  });

  describe('updateJoinMapping', () => {
    it('should update selected mapping at index', () => {
      dataTabActions.setJoinStats({
        joinedCount: 0,
        toVerifyCount: 1,
        duplicateCount: 0,
        unrecognizedCount: 0,
        totalEntities: 1,
        entities: [
          {
            dataValue: 'Spain',
            status: JoinStatus.TO_VERIFY,
            matches: ['Spain', 'ESP', 'Espana']
          }
        ]
      });

      dataTabActions.updateJoinMapping(0, 'ESP');

      expect(dataTabState.basemapJoin.joinMappings[0].selectedMapping).toBe(
        'ESP'
      );
    });

    it('should do nothing for invalid index', () => {
      dataTabActions.setJoinStats({
        joinedCount: 0,
        toVerifyCount: 1,
        duplicateCount: 0,
        unrecognizedCount: 0,
        totalEntities: 1,
        entities: [
          {
            dataValue: 'Spain',
            status: JoinStatus.TO_VERIFY,
            matches: ['Spain']
          }
        ]
      });

      expect(() => dataTabActions.updateJoinMapping(99, 'test')).not.toThrow();
    });
  });
});

describe('data-tab store - coordinate mode flow', () => {
  beforeEach(() => {
    dataTabActions.reset();
  });

  afterEach(() => {
    dataTabActions.reset();
  });

  it('should support switching from ENTITIES to COORDINATES mode', () => {
    expect(dataTabState.geolocation.geoReference).toBe(
      GeoreferenceType.ENTITIES
    );

    dataTabActions.setGeolocationState({
      geoReference: GeoreferenceType.COORDINATES
    });

    expect(dataTabState.geolocation.geoReference).toBe(
      GeoreferenceType.COORDINATES
    );
  });

  it('should support setting coordinate columns after switching mode', () => {
    dataTabActions.setGeolocationState({
      geoReference: GeoreferenceType.COORDINATES,
      latitudeColumn: 'lat',
      longitudeColumn: 'lon'
    });

    expect(dataTabState.geolocation.geoReference).toBe(
      GeoreferenceType.COORDINATES
    );
    expect(dataTabState.geolocation.latitudeColumn).toBe('lat');
    expect(dataTabState.geolocation.longitudeColumn).toBe('lon');
  });

  it('should support switching back to ENTITIES mode', () => {
    dataTabActions.setGeolocationState({
      geoReference: GeoreferenceType.COORDINATES,
      latitudeColumn: 'lat',
      longitudeColumn: 'lon'
    });

    dataTabActions.setGeolocationState({
      geoReference: GeoreferenceType.ENTITIES,
      linkedVariable: 0,
      linkedVariableName: 'country'
    });

    expect(dataTabState.geolocation.geoReference).toBe(
      GeoreferenceType.ENTITIES
    );
    expect(dataTabState.geolocation.linkedVariable).toBe(0);
    expect(dataTabState.geolocation.linkedVariableName).toBe('country');
  });

  it('should preserve coordinate columns when switching back to ENTITIES', () => {
    dataTabActions.setGeolocationState({
      geoReference: GeoreferenceType.COORDINATES,
      latitudeColumn: 'lat',
      longitudeColumn: 'lon'
    });

    dataTabActions.setGeolocationState({
      geoReference: GeoreferenceType.ENTITIES
    });

    expect(dataTabState.geolocation.latitudeColumn).toBe('lat');
    expect(dataTabState.geolocation.longitudeColumn).toBe('lon');
  });
});
