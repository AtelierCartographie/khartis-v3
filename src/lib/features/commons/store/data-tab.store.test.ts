import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dataTabActions, dataTabState } from './data-tab.store.svelte';
import { GeoreferenceType } from '../constants/ui.constants';

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
