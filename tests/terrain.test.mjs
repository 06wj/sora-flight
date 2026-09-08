import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const compiled = mkdtempSync(join(tmpdir(), 'sora-terrain-tests-'));
writeFileSync(join(compiled, 'package.json'), '{"type":"module"}');
execFileSync(process.execPath, [join(projectRoot, 'node_modules/typescript/bin/tsc'), '--ignoreConfig', join(projectRoot, 'src/terrain.ts'), '--target', 'ES2022', '--module', 'ESNext', '--strict', '--outDir', compiled], { cwd: projectRoot });
const { ROAD_TILE_LENGTH, roadTileZ } = await import(pathToFileURL(join(compiled, 'terrain.js')).href);
after(() => rmSync(compiled, { recursive: true, force: true }));

/** Decode the shipped mesh, not exporter metadata or a duplicate of its authoring recipe. */
function readRoadGeometry() {
  const bytes = readFileSync(join(projectRoot, 'public/assets/road.glb'));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'road asset must be a GLB');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB must be complete');
  let gltf;
  let binary;
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    assert.equal(chunk.length, length);
    if (type === 0x4e4f534a) gltf = JSON.parse(chunk.toString('utf8'));
    if (type === 0x004e4942) binary = chunk;
    offset += length + 8;
  }
  assert.ok(gltf && binary, 'GLB requires JSON and embedded binary chunks');
  const formats = {
    5121: { size: 1, read: offset => binary.readUInt8(offset) },
    5123: { size: 2, read: offset => binary.readUInt16LE(offset) },
    5125: { size: 4, read: offset => binary.readUInt32LE(offset) },
    5126: { size: 4, read: offset => binary.readFloatLE(offset) },
  };
  const accessorCache = new Map();
  const readAccessor = index => {
    if (accessorCache.has(index)) return accessorCache.get(index);
    const accessor = gltf.accessors[index];
    const view = gltf.bufferViews[accessor.bufferView];
    assert.equal(view.buffer, 0, 'terrain geometry must use its embedded GLB buffer');
    assert.equal(accessor.sparse, undefined, 'sparse terrain requires extending this binary reader');
    const format = formats[accessor.componentType];
    assert.ok(format, `unsupported component type ${accessor.componentType}`);
    const components = { SCALAR: 1, VEC3: 3 }[accessor.type];
    assert.ok(components, `unexpected terrain accessor ${accessor.type}`);
    const stride = view.byteStride ?? components * format.size;
    assert.ok(stride >= components * format.size);
    const viewOffset = view.byteOffset ?? 0;
    const start = viewOffset + (accessor.byteOffset ?? 0);
    const end = start + Math.max(0, accessor.count - 1) * stride + components * format.size;
    assert.ok(end <= viewOffset + view.byteLength && end <= binary.length, 'accessor must stay inside its buffer view');
    const values = Array.from({ length: accessor.count }, (_, row) => Array.from({ length: components }, (_, column) => format.read(start + row * stride + column * format.size)));
    accessorCache.set(index, values);
    return values;
  };
  const transformPoint = (position, node) => {
    const [x, y, z] = position;
    if (node.matrix) {
      const m = node.matrix;
      return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
    }
    const scale = node.scale ?? [1, 1, 1];
    const [sx, sy, sz] = [x * scale[0], y * scale[1], z * scale[2]];
    const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
    const tx = 2 * (qy * sz - qz * sy), ty = 2 * (qz * sx - qx * sz), tz = 2 * (qx * sy - qy * sx);
    const [px, py, pz] = node.translation ?? [0, 0, 0];
    return [sx + qw * tx + qy * tz - qz * ty + px, sy + qw * ty + qz * tx - qx * tz + py, sz + qw * tz + qx * ty - qy * tx + pz];
  };
  const primitives = [];
  const visit = (index, parents = []) => {
    const node = gltf.nodes[index];
    const chain = [...parents, node];
    if (node.mesh !== undefined) {
      for (const primitive of gltf.meshes[node.mesh].primitives) {
        assert.equal(primitive.mode ?? 4, 4, 'road is expected to use triangle primitives');
        assert.equal(gltf.accessors[primitive.attributes.POSITION].componentType, 5126);
        const positions = readAccessor(primitive.attributes.POSITION).map(position => chain.reduceRight(transformPoint, position));
        const indices = primitive.indices === undefined ? positions.map((_, i) => i) : readAccessor(primitive.indices).map(value => value[0]);
        assert.equal(indices.length % 3, 0);
        primitives.push({ positions, indices, name: node.name });
      }
    }
    for (const child of node.children ?? []) visit(child, chain);
  };
  for (const node of gltf.scenes[gltf.scene ?? 0].nodes) visit(node);
  assert.ok(primitives.length > 0);
  return primitives;
}

const primitives = readRoadGeometry();
const allZ = primitives.flatMap(primitive => primitive.positions.map(position => position[2]));
const minimumZ = Math.min(...allZ), maximumZ = Math.max(...allZ);
const epsilon = 0.0001;

test('shipped road triangles stay on one bank and leave the full canal opening clear', () => {
  let triangles = 0;
  let hasLeftBank = false;
  let hasRightBank = false;
  for (const primitive of primitives) {
    for (let offset = 0; offset < primitive.indices.length; offset += 3) {
      const triangle = primitive.indices.slice(offset, offset + 3).map(index => primitive.positions[index]);
      assert.ok(triangle.every(Boolean), 'triangle indices must reference actual position data');
      const left = triangle.every(position => position[0] <= -11.8 + epsilon);
      const right = triangle.every(position => position[0] >= 11.8 - epsilon);
      assert.ok(left || right, `${primitive.name} triangle ${offset / 3} crosses the canal opening: ${JSON.stringify(triangle)}`);
      hasLeftBank ||= left;
      hasRightBank ||= right;
      triangles += 1;
    }
  }
  assert.ok(triangles > 100 && hasLeftBank && hasRightBank);
});

test('actual 160m road extents meet exactly with no overlap or gap throughout the looping route', () => {
  assert.ok(Math.abs(maximumZ - minimumZ - ROAD_TILE_LENGTH) < epsilon, 'placement spacing must match the shipped GLB geometry');
  assert.ok(Math.abs(minimumZ + 80) < epsilon && Math.abs(maximumZ - 80) < epsilon, 'road origin must remain centered for streaming');
  for (const cameraZ of [0, -159, -160, -3500, -7000]) {
    const intervals = Array.from({ length: 16 }, (_, index) => {
      const center = roadTileZ(cameraZ, index);
      return [center + minimumZ, center + maximumZ];
    }).sort((left, right) => left[0] - right[0]);
    for (let index = 1; index < intervals.length; index += 1) {
      const gap = intervals[index][0] - intervals[index - 1][1];
      assert.ok(Math.abs(gap) < epsilon, `at camera Z=${cameraZ}, adjacent geometry has ${gap}m gap/overlap`);
    }
    assert.ok(intervals[0][0] <= cameraZ - 1400, 'road coverage must extend beyond the visible forward scenery');
    assert.ok(intervals.at(-1)[1] >= cameraZ + 160, 'road must continue behind the camera');
  }
});

test('camera travel preserves tile world positions and replaces only one tile at a grid boundary', () => {
  const atOrigin = Array.from({ length: 16 }, (_, index) => roadTileZ(0, index));
  const beforeBoundary = Array.from({ length: 16 }, (_, index) => roadTileZ(-159, index));
  const afterBoundary = Array.from({ length: 16 }, (_, index) => roadTileZ(-160, index));
  assert.deepEqual(beforeBoundary, atOrigin, 'tiles must not slide with the camera between boundaries');
  const retained = afterBoundary.filter(position => atOrigin.includes(position));
  assert.equal(retained.length, 15, 'streaming should retain every still-visible tile on its original world grid');
  assert.equal(new Set(afterBoundary).size, afterBoundary.length);
});
