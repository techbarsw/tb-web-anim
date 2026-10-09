import test from 'node:test';
import assert from 'node:assert/strict';
import { createParticleLayout, GATHER_END, IDLE_START, phaseAt, resolveArrivalContacts, writeParticleTransform } from '../src/particle-layout.js';
import { createRoundedCubeGeometry } from '../src/cube-geometry.js';

function fixture() {
  const width = 160, height = 240;
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const square = x >= 15 && x < 48 && y >= 15 && y < 48;
    const stem = x >= 55 && x < 90 && y >= 55 && y < 210;
    const cross = x >= 35 && x < 135 && y >= 90 && y < 120;
    const foot = x >= 55 && x < 135 && y >= 185 && y < 220;
    if (square || stem || cross || foot) pixels[y * width + x] = 1;
  }
  return { width, height, pixels };
}

test('sampling preserves both logo components and fills only the SVG mask', () => {
  const mask = fixture();
  const layout = createParticleLayout(mask, 1000, 'brand');
  assert.equal(layout.count, 1000);
  assert.equal(new Set(layout.components).size, 2);
  assert.equal(layout.driftingCount, 100);
  for (let i = 0; i < layout.count; i++) {
    const x = Math.round(layout.targets[i * 3] / (8 / mask.height) + mask.width / 2);
    const y = Math.round(mask.height / 2 - layout.targets[i * 3 + 1] / (8 / mask.height));
    assert.equal(mask.pixels[y * mask.width + x], 1);
    if (layout.components[i] !== layout.largestComponent) assert.deepEqual(Array.from(layout.drift.slice(i * 3, i * 3 + 3)), [0, 0, 0]);
  }
});

test('seeded layouts are reproducible and different seeds vary the ribbon', () => {
  const a = createParticleLayout(fixture(), 1000, 17);
  const b = createParticleLayout(fixture(), 1000, 17);
  const c = createParticleLayout(fixture(), 1000, 18);
  assert.deepEqual(a.targets, b.targets);
  assert.deepEqual(a.ribbons, b.ribbons);
  assert.notDeepEqual(a.ribbons, c.ribbons);
});

test('staggered depth layers fill both components without increasing total particle count', () => {
  for (const depthLayers of [2, 3]) {
    const layout = createParticleLayout(fixture(), 1200, 17, depthLayers);
    const front = createParticleLayout(fixture(), 1200, 17, 1);
    assert.equal(layout.count, front.count);
    assert.equal(layout.depthLayers, depthLayers);
    assert.ok(layout.cubeSide > front.cubeSide * 1.3);
    const depth = [];
    const layerPositions = [];
    for (let layer = 0; layer < depthLayers; layer++) {
      const indices = Array.from({ length: layout.count }, (_, i) => i).filter((i) => layout.layers[i] === layer);
      assert.equal(indices.length, 1200 / depthLayers);
      assert.equal(new Set(indices.map((i) => layout.components[i])).size, 2);
      depth.push(indices.reduce((sum, i) => sum + layout.targets[i * 3 + 2], 0) / indices.length);
      layerPositions.push(new Set(indices.map((i) => `${layout.targets[i * 3]},${layout.targets[i * 3 + 1]}`)));
    }
    for (let layer = 1; layer < depthLayers; layer++) {
      assert.ok(depth[layer - 1] - depth[layer] > layout.cubeSide * 0.9);
      assert.ok([...layerPositions[layer]].every((position) => !layerPositions[0].has(position)));
    }
  }
  for (const layers of [0, -1, 1.5, 7]) assert.throws(() => createParticleLayout(fixture(), 1000, 17, layers), RangeError);
  assert.equal(createParticleLayout(fixture(), 1, 17, 3).depthLayers, 1);
});

test('settled entropy stays within 20% of cube size and phases never change count', () => {
  const layout = createParticleLayout(fixture(), 1000, 17);
  const result = {};
  for (let i = 0; i < layout.count; i++) {
    writeParticleTransform(layout, i, 3.8, 1, result);
    const distance = Math.hypot(result.x - layout.targets[i * 3], result.y - layout.targets[i * 3 + 1], result.z - layout.targets[i * 3 + 2]);
    assert.ok(distance <= result.scale * 0.2 + 1e-8);
    const start = { ...writeParticleTransform(layout, i, IDLE_START, 1, result) };
    const end = { ...writeParticleTransform(layout, i, IDLE_START + 8, 1, result) };
    assert.ok(Math.hypot(start.x - end.x, start.y - end.y, start.z - end.z) <= result.scale * 0.4 + 1e-8);
    for (const time of [0, 0.04, 1.5, 3.599, 3.6, 3.999, 4.001, 8, 1000]) {
      writeParticleTransform(layout, i, time, 0.65, result);
      assert.ok(Object.values(result).every(Number.isFinite));
    }
  }
  assert.equal(layout.targets.length, 3000);
  assert.equal(phaseAt(0), 'flowing');
  assert.equal(phaseAt(0.04), 'gathering');
  assert.equal(phaseAt(GATHER_END), 'holding');
  assert.equal(phaseAt(IDLE_START), 'drifting');
});

test('gather and drift boundaries are continuous rather than teleporting', () => {
  const layout = createParticleLayout(fixture(), 1000, 17);
  for (const boundary of [0.04, GATHER_END, IDLE_START, IDLE_START + 8]) for (let i = 0; i < layout.count; i += 11) {
    const before = writeParticleTransform(layout, i, boundary - 0.00001, 1, {});
    const after = writeParticleTransform(layout, i, boundary + 0.00001, 1, {});
    assert.ok(Math.hypot(before.x - after.x, before.y - after.y, before.z - after.z) < 0.001);
  }
});

test('wave arrivals are continuous at impact and settle in order from top to bottom', () => {
  const layout = createParticleLayout(fixture(), 1000, 17);
  assert.ok(layout.delays[0] < layout.delays[999]);
  for (let i = 0; i < layout.count; i += 13) {
    const impact = layout.delays[i] + layout.durations[i];
    const before = writeParticleTransform(layout, i, impact - 0.00001, 1, {});
    const after = writeParticleTransform(layout, i, impact + 0.00001, 1, {});
    assert.ok(Math.hypot(before.x - after.x, before.y - after.y, before.z - after.z) < 0.001);
  }
});

test('arrival contacts separate overlapping neighbors and retain the pair center', () => {
  const layout = { cubeSide: 1, sizes: [1, 1], delays: [0, 0], durations: [1, 1], neighborPairs: [0, 1] };
  const positions = new Float32Array([0, 0, 0, 0.3, 0, 0]);
  const contacts = resolveArrivalContacts(layout, positions, 1.1);
  assert.ok(contacts > 0);
  assert.ok(positions[3] - positions[0] > 0.8);
  assert.ok(Math.abs((positions[0] + positions[3]) / 2 - 0.15) < 1e-6);
  const settled = positions.slice();
  assert.equal(resolveArrivalContacts(layout, positions, GATHER_END), 0);
  assert.deepEqual(positions, settled);
});

test('invalid counts and empty outlines fail clearly', () => {
  for (const count of [0, -1, 1.5, 12001]) assert.throws(() => createParticleLayout(fixture(), count), RangeError);
  assert.throws(() => createParticleLayout({ width: 10, height: 10, pixels: new Uint8Array(100) }, 10), /filled area/);
});

test('starting cloud has uneven angular density, a broad radial span, and bounded edges', () => {
  const layout = createParticleLayout(fixture(), 1000, 17);
  const bins = new Uint32Array(10);
  let nearCenter = 0, nearOutside = 0;
  for (let i = 0; i < layout.count; i++) {
    bins[Math.min(9, Math.floor(layout.ribbons[i * 3] / (Math.PI * 2) * 10))]++;
    const point = writeParticleTransform(layout, i, 0, 1, {});
    const radius = Math.hypot(point.x, point.y);
    if (radius < 1.5) nearCenter++;
    if (radius > 3.5) nearOutside++;
    assert.ok(Math.abs(point.x) < 4.9 && Math.abs(point.y) < 4.9);
  }
  assert.ok(Math.max(...bins) / Math.min(...bins) > 3);
  assert.ok(nearCenter > 20 && nearOutside > 20);
});

test('the softened cube is a closed mesh with a small shared vertex budget', () => {
  const geometry = createRoundedCubeGeometry();
  assert.equal(geometry.attributes.position.count, 48);
  assert.equal(geometry.index.count / 3, 92);
  const edges = new Map();
  const indices = geometry.index.array;
  for (let i = 0; i < indices.length; i += 3) for (let side = 0; side < 3; side++) {
    const a = indices[i + side], b = indices[i + (side + 1) % 3];
    const edge = [Math.min(a, b), Math.max(a, b)].join(',');
    edges.set(edge, (edges.get(edge) ?? 0) + 1);
  }
  assert.ok([...edges.values()].every((faces) => faces === 2));
  geometry.dispose();
});
