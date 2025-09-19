import { Matrix4 } from '@math.gl/core';

/**
 * General purpose of this module is to keep the basemap
 * in his projected coordinate system (like Lambert 93)
 * and use the GPU to apply the transformation matrix (scale and translate)
 * to center the basemap in the screen coordinate system (like pixels).
 * All layers in Deck.gl have a model matrix property who expect a 4x4 matrix.
 */

type BoundingBox = [number, number, number, number]; // [x_min, y_min, x_max, y_max]
type CanvasSize = [number, number]; // [width, height]
type Point = [number, number]; // [x, y]

interface GeoParquetMetadata {
	primary_column: string;
	columns: Record<string, { bbox: BoundingBox }>;
}

/**
 * Generates a model matrix based on the provided metadata and canvas size.
 *
 * @param {Object} metadata - The metadata containing geographical information.
 * @param {number[]} canvas_size - An array representing the size of the canvas [width, height].
 * @returns {Object} The model matrix.
 */
export function get_model_matrix(metadata: string, canvas_size: CanvasSize): Matrix4 {
	const bbox = get_bbox_from_geoparquet(metadata);
	const [bbox_cx, bbox_cy] = get_bbox_center(bbox);
	const max_scale = get_max_scale(canvas_size, bbox);
	const model_matrix = get_matrix(max_scale, -bbox_cx, -bbox_cy);

	return model_matrix;
}

/**
 * Generates a transformation matrix with the given scale and translation values.
 *
 * @param {number} scale - The scale factor to apply to the matrix.
 * @param {number} tx - The translation value along the x-axis.
 * @param {number} ty - The translation value along the y-axis.
 * @returns {Matrix4} A new transformation matrix with the specified scale and translation.
 */
function get_matrix(scale: number, tx: number, ty: number): Matrix4 {
	return new Matrix4().scale([scale, scale, 0]).translate([tx, ty, 0]);
}

/**
 * Calculates the center point of a bounding box.
 *
 * @param {number[]} bbox - An array representing the bounding box [x_min, y_min, x_max, y_max].
 * @returns {number[]} An array containing the x and y coordinates of the center point.
 */
function get_bbox_center(bbox: BoundingBox): Point {
	const [x_min, y_min, x_max, y_max] = bbox;
	const x = (x_max + x_min) / 2;
	const y = (y_max + y_min) / 2;
	return [x, y];
}

function get_max_scale(size: CanvasSize, bbox: BoundingBox): number {
	// Facteur d'agrandissement ou de réduction
	// pour passer de l'échelle de la carte à l'échelle de l'écran
	// size = dimensions du canvas
	const x = size[0] / (bbox[2] - bbox[0]);
	const y = size[1] / (bbox[3] - bbox[1]);

	return Math.min(x, y);
}

/**
 * Extracts the bounding box (bbox) from the given GeoParquet metadata.
 *
 * @param {Object} metadata - The metadata object containing GeoParquet information.
 * @returns {Array<number>} The bounding box (bbox) as an array of numbers.
 */
function get_bbox_from_geoparquet(metadata: string): BoundingBox {
	const json: GeoParquetMetadata = JSON.parse(metadata);
	const geo_column = json.primary_column;
	const bbox = json.columns[geo_column].bbox;
	return bbox;
}
