/** Length of the authored road GLB along game Z, shared by placement and geometry regression. */
export const ROAD_TILE_LENGTH = 160;

/** Stable world-grid placement; neighbouring tiles meet only at their boundary planes. */
export function roadTileZ(cameraZ: number, index: number): number {
  return -Math.floor(-cameraZ / ROAD_TILE_LENGTH) * ROAD_TILE_LENGTH + 320 - index * ROAD_TILE_LENGTH;
}
