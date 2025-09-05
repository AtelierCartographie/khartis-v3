<script lang="ts">
  import type { Layer } from '@deck.gl/core';
  import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers';
  import { MapboxOverlay } from '@deck.gl/mapbox';
  import {
    Button,
    Column,
    Content,
    DataTable,
    Grid,
    Row,
    Select,
    SelectItem,
    Tile,
    Toggle
  } from 'carbon-components-svelte';
  import {
    ChartBar,
    Home,
    Location,
    Map as MapIcon
  } from 'carbon-icons-svelte';
  import { Map } from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { onDestroy, onMount } from 'svelte';

  let mapContainer: HTMLDivElement;
  let map: Map;
  let deckOverlay: MapboxOverlay;
  let currentDataset = 'population';
  let showCities = true;
  let interleaved = false;

  const MAP_STYLE =
    'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
  const WORLD_COUNTRIES_URL =
    'https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson';

  const POPULATION_DATA = {
    France: 67000000,
    Germany: 83000000,
    Italy: 60000000,
    Spain: 47000000,
    'United Kingdom': 67000000,
    Poland: 38000000,
    Romania: 19000000,
    Netherlands: 17000000,
    Belgium: 11500000,
    'Czech Republic': 10700000,
    Greece: 10700000,
    Portugal: 10300000,
    Sweden: 10400000,
    Hungary: 9700000,
    Austria: 9000000,
    Belarus: 9400000,
    Switzerland: 8700000,
    Bulgaria: 6900000,
    Serbia: 6900000,
    Denmark: 5800000
  };

  const GDP_DATA = {
    Luxembourg: 95000,
    Switzerland: 85000,
    Norway: 75000,
    Denmark: 60000,
    Sweden: 55000,
    Netherlands: 52000,
    Austria: 48000,
    Germany: 46000,
    Belgium: 44000,
    France: 42000,
    'United Kingdom': 40000,
    Italy: 35000,
    Spain: 32000,
    'Czech Republic': 25000,
    Poland: 22000,
    Hungary: 18000,
    Romania: 15000,
    Bulgaria: 12000,
    Serbia: 8000
  };

  const CITIES_DATA = [
    {
      name: 'Paris',
      coordinates: [2.3522, 48.8566],
      population: 2161000,
      country: 'France'
    },
    {
      name: 'London',
      coordinates: [-0.1276, 51.5074],
      population: 8982000,
      country: 'United Kingdom'
    },
    {
      name: 'Berlin',
      coordinates: [13.405, 52.52],
      population: 3669000,
      country: 'Germany'
    },
    {
      name: 'Madrid',
      coordinates: [-3.7038, 40.4168],
      population: 3223000,
      country: 'Spain'
    },
    {
      name: 'Rome',
      coordinates: [12.4964, 41.9028],
      population: 2873000,
      country: 'Italy'
    },
    {
      name: 'Warsaw',
      coordinates: [21.0122, 52.2297],
      population: 1790000,
      country: 'Poland'
    },
    {
      name: 'Vienna',
      coordinates: [16.3738, 48.2082],
      population: 1897000,
      country: 'Austria'
    },
    {
      name: 'Amsterdam',
      coordinates: [4.9041, 52.3676],
      population: 873000,
      country: 'Netherlands'
    },
    {
      name: 'Budapest',
      coordinates: [19.0402, 47.4979],
      population: 1752000,
      country: 'Hungary'
    },
    {
      name: 'Barcelona',
      coordinates: [2.1734, 41.3851],
      population: 1620000,
      country: 'Spain'
    }
  ];

  let geoJsonData: any;

  function getCurrentData() {
    switch (currentDataset) {
      case 'gdp':
        return GDP_DATA;
      default:
        return POPULATION_DATA;
    }
  }

  const COUNTRY_NAME_MAPPING: { [key: string]: string } = {
    'Republic of Serbia': 'Serbia',
    'Czech Republic': 'Czech Republic',
    England: 'United Kingdom'
  };

  function getColorByData(
    countryName: string
  ): [number, number, number, number] {
    const data = getCurrentData();
    const mappedName = COUNTRY_NAME_MAPPING[countryName] || countryName;
    const value = data[mappedName as keyof typeof data] || 0;

    if (value === 0 && mappedName !== countryName) {
      console.log(`Mapped country not found: ${countryName} -> ${mappedName}`);
    } else if (value === 0) {
      console.log(`Country not found in data: ${countryName}`);
    }

    if (currentDataset === 'population') {
      if (value > 60000000) return [24, 78, 119, 200];
      if (value > 30000000) return [15, 98, 254, 200];
      if (value > 10000000) return [69, 137, 148, 200];
      if (value > 5000000) return [166, 200, 255, 200];
      return [224, 242, 254, 200];
    } else {
      if (value > 60000) return [22, 135, 78, 200];
      if (value > 40000) return [36, 161, 72, 200];
      if (value > 25000) return [66, 190, 101, 200];
      if (value > 15000) return [163, 240, 163, 200];
      return [221, 243, 221, 200];
    }
  }

  function updateLayers() {
    console.log('updateLayers called with dataset:', currentDataset);

    if (!deckOverlay) return;

    const layers = createLayers();

    deckOverlay.setProps({ layers });
  }

  function createLayers(): Layer[] {
    const layers: Layer[] = [
      new GeoJsonLayer({
        id: 'countries-layer',
        data: geoJsonData,
        pickable: true,
        stroked: true,
        filled: true,
        extruded: false,
        lineWidthMinPixels: 1,
        getFillColor: (d: any) => getColorByData(d.properties.name),
        getLineColor: [161, 161, 161, 255],
        getLineWidth: 1,
        beforeId: interleaved ? 'country-label' : undefined
      })
    ];

    if (showCities) {
      layers.push(
        new ScatterplotLayer({
          id: 'cities-layer',
          data: CITIES_DATA,
          pickable: true,
          opacity: 0.9,
          stroked: true,
          filled: true,
          radiusScale: 1000,
          radiusMinPixels: 6,
          radiusMaxPixels: 25,
          lineWidthMinPixels: 2,
          getPosition: (d: any) => d.coordinates,
          getRadius: (d: any) => Math.sqrt(d.population) / 60,
          getFillColor: [218, 30, 40, 230],
          getLineColor: [255, 255, 255, 255],
          beforeId: interleaved ? 'poi-label' : undefined
        })
      );
    }

    return layers;
  }

  function getDatasetLabel() {
    switch (currentDataset) {
      case 'gdp':
        return 'PIB par habitant';
      default:
        return 'Population';
    }
  }

  function resetView() {
    if (map) {
      map.flyTo({
        center: [10, 54],
        zoom: 4,
        duration: 1000
      });
    }
  }

  function focusOnFrance() {
    if (map) {
      map.flyTo({
        center: [2.3522, 46.6034],
        zoom: 6,
        duration: 1000
      });
    }
  }

  onMount(async () => {
    try {
      const response = await fetch(WORLD_COUNTRIES_URL);
      geoJsonData = await response.json();
    } catch (error) {
      console.error('Error loading data:', error);
      geoJsonData = { type: 'FeatureCollection', features: [] };
    }

    map = new Map({
      container: mapContainer,
      style: MAP_STYLE,
      center: [10, 54],
      zoom: 4,
      pitch: 0,
      bearing: 0
    });

    await map.once('load');

    deckOverlay = new MapboxOverlay({
      interleaved: interleaved,
      layers: createLayers()
    });

    map.addControl(deckOverlay);
  });

  onDestroy(() => {
    if (deckOverlay) {
      map.removeControl(deckOverlay);
    }
    if (map) {
      map.remove();
    }
  });
</script>

<svelte:head>
  <title>Khartis v3 - Cartographie avec deck.gl et MapLibre</title>
  <meta
    name="description"
    content="Application de cartographie thématique moderne avec deck.gl et MapLibre"
  />
</svelte:head>

<Content id="khartis-deck-gl-page">
  <Grid>
    <Row>
      <Column lg={16}>
        <div class="header-section">
          <div class="title-section">
            <h1 class="main-title">
              <MapIcon size={32} />
              Cartographie Européenne Interactive
            </h1>
            <p class="subtitle">
              Exploration de données géographiques avec deck.gl et MapLibre
            </p>
          </div>

          <div class="controls-section">
            <Tile class="controls-tile">
              <div class="control-group">
                <Select
                  labelText="Dataset"
                  bind:selected={currentDataset}
                  on:change={() => updateLayers()}
                >
                  <SelectItem value="population" text="Population" />
                  <SelectItem value="gdp" text="PIB par habitant" />
                </Select>

                <Toggle
                  bind:toggled={showCities}
                  labelText="Afficher les villes"
                  on:toggle={() => updateLayers()}
                />

                <Toggle
                  bind:toggled={interleaved}
                  labelText="Mode entrelacé"
                  on:toggle={() => {
                    if (deckOverlay) {
                      deckOverlay.setProps({ interleaved });
                    }
                  }}
                />
              </div>

              <div class="action-buttons">
                <Button
                  kind="secondary"
                  size="small"
                  icon={Home}
                  on:click={resetView}
                >
                  Vue Europe
                </Button>
                <Button
                  kind="secondary"
                  size="small"
                  icon={Location}
                  on:click={focusOnFrance}
                >
                  Focus France
                </Button>
              </div>
            </Tile>
          </div>
        </div>
      </Column>
    </Row>

    <Row>
      <Column lg={4}>
        <Tile class="legend-tile">
          <h3 class="legend-title">
            <ChartBar size={20} />
            {getDatasetLabel()}
          </h3>

          {#if currentDataset === 'population'}
            <div class="legend-items">
              <div class="legend-item">
                <div
                  class="legend-color"
                  style="background: rgb(24, 78, 119);"
                ></div>
                <span>> 60M hab.</span>
              </div>
              <div class="legend-item">
                <div
                  class="legend-color"
                  style="background: rgb(15, 98, 254);"
                ></div>
                <span>30-60M hab.</span>
              </div>
              <div class="legend-item">
                <div
                  class="legend-color"
                  style="background: rgb(69, 137, 148);"
                ></div>
                <span>10-30M hab.</span>
              </div>
              <div class="legend-item">
                <div
                  class="legend-color"
                  style="background: rgb(166, 200, 255);"
                ></div>
                <span>5-10M hab.</span>
              </div>
              <div class="legend-item">
                <div
                  class="legend-color"
                  style="background: rgb(224, 242, 254);"
                ></div>
                <span>&lt; 5M hab.</span>
              </div>
            </div>
          {:else}
            <div class="legend-items">
              <div class="legend-item">
                <div
                  class="legend-color"
                  style="background: rgb(22, 135, 78);"
                ></div>
                <span>> 60k€</span>
              </div>
              <div class="legend-item">
                <div
                  class="legend-color"
                  style="background: rgb(36, 161, 72);"
                ></div>
                <span>40-60k€</span>
              </div>
              <div class="legend-item">
                <div
                  class="legend-color"
                  style="background: rgb(66, 190, 101);"
                ></div>
                <span>25-40k€</span>
              </div>
              <div class="legend-item">
                <div
                  class="legend-color"
                  style="background: rgb(163, 240, 163);"
                ></div>
                <span>15-25k€</span>
              </div>
              <div class="legend-item">
                <div
                  class="legend-color"
                  style="background: rgb(221, 243, 221);"
                ></div>
                <span>&lt; 15k€</span>
              </div>
            </div>
          {/if}

          {#if showCities}
            <div class="cities-legend">
              <div class="legend-item">
                <div class="legend-point"></div>
                <span>Villes principales</span>
              </div>
            </div>
          {/if}
        </Tile>
      </Column>

      <Column lg={12}>
        <div class="map-container">
          <div bind:this={mapContainer} class="map"></div>
        </div>
      </Column>
    </Row>

    <Row>
      <Column lg={16}>
        <Tile>
          <h3>Données des principales villes européennes</h3>
          <DataTable
            headers={[
              { key: 'name', value: 'Ville' },
              { key: 'country', value: 'Pays' },
              { key: 'population', value: 'Population' }
            ]}
            rows={CITIES_DATA.map((city, i) => ({
              id: i,
              name: city.name,
              country: city.country,
              population: (city.population / 1000000).toFixed(1) + 'M'
            }))}
          />
        </Tile>
      </Column>
    </Row>
  </Grid>
</Content>

<style>
  .header-section {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    gap: 2rem;
  }

  .title-section {
    flex: 1;
  }

  .main-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 2rem;
    font-weight: 400;
    margin: 0;
    color: var(--cds-text-primary);
  }

  .subtitle {
    margin: 0.5rem 0 0 0;
    color: var(--cds-text-secondary);
    font-size: 1rem;
  }

  .controls-section {
    flex: 0 0 auto;
  }

  .control-group {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .action-buttons {
    display: flex;
    gap: 0.5rem;
  }

  .legend-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0 0 1rem 0;
    font-size: 1.125rem;
    font-weight: 500;
    color: var(--cds-text-primary);
  }

  .legend-items {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--cds-text-secondary);
  }

  .legend-color {
    width: 20px;
    height: 16px;
    border-radius: 2px;
    border: 1px solid var(--cds-border-subtle);
  }

  .legend-point {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: rgb(218, 30, 40);
    border: 2px solid white;
    box-shadow: 0 0 0 1px var(--cds-border-subtle);
  }

  .cities-legend {
    border-top: 1px solid var(--cds-border-subtle);
    padding-top: 1rem;
  }

  .map-container {
    position: relative;
    height: 500px;
    border-radius: 4px;
    overflow: hidden;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
  }

  .map {
    width: 100%;
    height: 100%;
  }

  @media (max-width: 1056px) {
    .header-section {
      flex-direction: column;
      align-items: stretch;
    }

    .control-group {
      flex-direction: row;
      flex-wrap: wrap;
    }

    .action-buttons {
      justify-content: center;
    }
  }

  @media (max-width: 672px) {
    .main-title {
      font-size: 1.5rem;
    }

    .control-group {
      flex-direction: column;
    }

    .map-container {
      height: 400px;
    }
  }
</style>
