type PointTransform = (point: [number, number]) => [number, number] | null;

/**
 * Rewrites the XY coordinates of a WKB geometry (little or big endian, any
 * dimension) into a little-endian copy. Null when a coordinate is not finite
 * or falls outside the transform: a partial geometry would draw wrong.
 */
export function transformWkb(
  wkb: Uint8Array,
  transform: PointTransform
): Uint8Array | null {
  const input = new DataView(wkb.buffer, wkb.byteOffset, wkb.byteLength);
  const output = new Uint8Array(wkb.byteLength);
  const out = new DataView(output.buffer);
  let offset = 0;

  const copyGeometry = (): boolean => {
    const littleEndian = input.getUint8(offset) === 1;
    const rawType = input.getUint32(offset + 1, littleEndian);
    out.setUint8(offset, 1);
    out.setUint32(offset + 1, rawType, true);
    offset += 5;
    const type = rawType % 1000;
    const dimensions = rawType >= 3000 ? 4 : rawType >= 1000 ? 3 : 2;

    const copyCount = (): number => {
      const count = input.getUint32(offset, littleEndian);
      out.setUint32(offset, count, true);
      offset += 4;
      return count;
    };
    const copyPoint = (): boolean => {
      const point = transform([
        input.getFloat64(offset, littleEndian),
        input.getFloat64(offset + 8, littleEndian)
      ]);
      if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
        return false;
      }
      out.setFloat64(offset, point[0], true);
      out.setFloat64(offset + 8, point[1], true);
      for (let extra = 2; extra < dimensions; extra += 1) {
        out.setFloat64(
          offset + 8 * extra,
          input.getFloat64(offset + 8 * extra, littleEndian),
          true
        );
      }
      offset += 8 * dimensions;
      return true;
    };
    const copyPoints = (): boolean => {
      for (let count = copyCount(); count > 0; count -= 1) {
        if (!copyPoint()) return false;
      }
      return true;
    };

    switch (type) {
      case 1:
        return copyPoint();
      case 2:
        return copyPoints();
      case 3:
        for (let rings = copyCount(); rings > 0; rings -= 1) {
          if (!copyPoints()) return false;
        }
        return true;
      case 4:
      case 5:
      case 6:
      case 7:
        for (let parts = copyCount(); parts > 0; parts -= 1) {
          if (!copyGeometry()) return false;
        }
        return true;
      default:
        return false;
    }
  };

  try {
    return copyGeometry() ? output : null;
  } catch {
    return null;
  }
}
