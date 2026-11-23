import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildNativeGeoArrowGeometrySql,
  type CatalogGeometryKind
} from '$lib/features/map/services/catalog-geometry-sql';
import {
  createTestInstance,
  destroyTestInstance,
  query,
  type TestDuckDB
} from '../pipeline/duckdb-node-helper';

const COORD = 'STRUCT(x DOUBLE, y DOUBLE)';
const square = (x: number) =>
  `[{'x':${x},'y':0},{'x':${x + 1},'y':0},{'x':${x + 1},'y':1},{'x':${x},'y':0}]`;
const hole =
  "[{'x':0.2,'y':0.2},{'x':0.4,'y':0.2},{'x':0.4,'y':0.4},{'x':0.2,'y':0.2}]";

interface Case {
  kind: CatalogGeometryKind;
  type: string;
  values: string[];
  expected: Array<string | null>;
}

const CASES: Case[] = [
  {
    kind: 'point',
    type: COORD,
    values: ["{'x':1.5,'y':2}", 'NULL'],
    expected: ['POINT (1.5 2)', null]
  },
  {
    kind: 'linestring',
    type: `${COORD}[]`,
    values: [square(0), '[]'],
    expected: ['LINESTRING (0 0, 1 0, 1 1, 0 0)', null]
  },
  {
    kind: 'polygon',
    type: `${COORD}[][]`,
    values: [`[${square(0)}, ${hole}]`],
    expected: [
      'POLYGON ((0 0, 1 0, 1 1, 0 0), (0.2 0.2, 0.4 0.2, 0.4 0.4, 0.2 0.2))'
    ]
  },
  {
    kind: 'multipoint',
    type: `${COORD}[]`,
    values: [square(0)],
    expected: ['MULTIPOINT (0 0, 1 0, 1 1, 0 0)']
  },
  {
    kind: 'multilinestring',
    type: `${COORD}[][]`,
    values: [`[${square(0)}]`],
    expected: ['MULTILINESTRING ((0 0, 1 0, 1 1, 0 0))']
  },
  {
    kind: 'multipolygon',
    type: `${COORD}[][][]`,
    values: [
      `[[${square(0)}, ${hole}], [${square(2)}]]`,
      `[[${square(0)}]]`,
      '[]',
      'NULL'
    ],
    expected: [
      'MULTIPOLYGON (((0 0, 1 0, 1 1, 0 0), (0.2 0.2, 0.4 0.2, 0.4 0.4, 0.2 0.2)), ((2 0, 3 0, 3 1, 2 0)))',
      'MULTIPOLYGON (((0 0, 1 0, 1 1, 0 0)))',
      null,
      null
    ]
  }
];

describe('catalog native GeoArrow geometry SQL', () => {
  let db: TestDuckDB;

  beforeAll(async () => {
    db = await createTestInstance();
    await db.connection.run('LOAD spatial');
  });

  afterAll(async () => {
    await destroyTestInstance(db);
  });

  it.each(CASES)(
    'should rebuild $kind geometries and keep empty or missing ones NULL',
    async ({ kind, type, values, expected }) => {
      const rows = values
        .map((value, index) => `(${index}, ${value}::${type})`)
        .join(', ');
      await db.connection.run(
        `CREATE OR REPLACE TABLE raw_${kind} AS SELECT * FROM (VALUES ${rows}) AS t(id, geometry)`
      );
      await db.connection.run(
        buildNativeGeoArrowGeometrySql(
          `raw_${kind}`,
          `out_${kind}`,
          { column_name: 'geometry', data_type: type },
          kind
        )
      );

      const result = await query(
        db,
        `SELECT ST_AsText(geom) AS wkt FROM out_${kind} ORDER BY id`
      );
      expect(result.map((row) => row.wkt)).toEqual(expected);
    }
  );
});
