export const TAU = Math.PI * 2;
export const LOGO_HEIGHT = 8;
export const GATHER_END = 3.6;
export const IDLE_START = 4;

export function createRandom(seed = 17) {
  let value = 2166136261;
  for (const character of String(seed)) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return () => {
    value += 0x6d2b79f5;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (value) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

// Unequal angular density creates clumps and quieter stretches, rather than
// placing the same number of cubes along every arm of the starting star.
function ribbonAngleDistribution() {
  const distribution = new Float32Array(513);
  for (let i = 1; i < distribution.length; i++) {
    const angle = (i - 0.5) / 512 * TAU;
    const density = 0.24 + 1.4 * ((1 + Math.sin(angle * 3 + 0.8)) / 2) ** 3 + 0.8 * ((1 + Math.cos(angle * 2 - 0.5)) / 2) ** 4;
    distribution[i] = distribution[i - 1] + density;
  }
  const total = distribution[512];
  for (let i = 1; i < distribution.length; i++) distribution[i] /= total;
  return (fraction) => {
    let low = 0, high = 512;
    while (high - low > 1) {
      const middle = (low + high) >>> 1;
      if (distribution[middle] < fraction) low = middle;
      else high = middle;
    }
    const mix = (fraction - distribution[low]) / (distribution[high] - distribution[low]);
    return (low + mix) / 512 * TAU;
  };
}

// Label filled components so the detached square stays intact during idle motion.
function labelComponents(mask) {
  const { width, height, pixels } = mask;
  const labels = new Uint32Array(pixels.length);
  const queue = new Uint32Array(pixels.length);
  const areas = [0];
  let component = 0;
  for (let start = 0; start < pixels.length; start++) {
    if (!pixels[start] || labels[start]) continue;
    component++;
    let tail = 1;
    queue[0] = start;
    labels[start] = component;
    for (let head = 0; head < tail; head++) {
      const index = queue[head];
      const x = index % width;
      const neighbors = [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, index - width, index + width];
      for (const next of neighbors) {
        if (next >= 0 && next < width * height && pixels[next] && !labels[next]) {
          labels[next] = component;
          queue[tail++] = next;
        }
      }
    }
    areas[component] = tail;
  }
  const largest = areas.indexOf(Math.max(...areas));
  return { labels, largest, area: areas.reduce((sum, area) => sum + area, 0) };
}

export function createParticleLayout(mask, count, seed = 17, depthLayers = 3) {
  if (!Number.isInteger(count) || count < 1 || count > 12000) throw new RangeError('particleCount must be an integer between 1 and 12000.');
  if (!Number.isInteger(depthLayers) || depthLayers < 1 || depthLayers > 6) throw new RangeError('depthLayers must be an integer between 1 and 6.');
  depthLayers = Math.min(depthLayers, count);
  const { width, height, pixels } = mask;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || pixels.length !== width * height) throw new Error('Invalid logo mask.');
  const { labels, largest, area } = labelComponents(mask);
  if (area < count) throw new Error('The SVG does not contain enough filled area to sample the requested particles.');
  const random = createRandom(seed);
  const ribbonAngle = ribbonAngleDistribution();
  const occupied = (x, y) => {
    x = Math.round(x); y = Math.round(y);
    return x >= 0 && x < width && y >= 0 && y < height ? pixels[y * width + x] : 0;
  };
  const layerCounts = Array.from({ length: depthLayers }, (_, layer) => Math.floor(count / depthLayers) + (layer < count % depthLayers ? 1 : 0));
  let spacing = Math.sqrt(area * depthLayers / count) * 0.97;
  let layers;
  // Offset each layer's grid so a gap in the bright front reveals a cube in
  // the shaded interior, rather than a hole through to the white background.
  for (let attempt = 0; attempt < 30; attempt++) {
    layers = layerCounts.map((_, layer) => {
      const samples = [];
      const shiftX = ((0.5 + layer * 0.47) % 1) * spacing;
      const shiftY = ((0.5 + layer * 0.37) % 1) * spacing;
      for (let y = shiftY; y < height; y += spacing) {
        for (let x = shiftX; x < width; x += spacing) {
          const px = x + (random() - 0.5) * spacing * 0.36;
          const py = y + (random() - 0.5) * spacing * 0.36;
          if (occupied(px, py)) samples.push([px, py, layer]);
        }
      }
      return samples;
    });
    if (layers.every((samples, layer) => samples.length >= layerCounts[layer])) break;
    spacing *= 0.96;
  }
  if (layers.some((samples, layer) => samples.length < layerCounts[layer])) throw new Error('Could not sample the SVG mask.');
  // Uniformly discard excess candidates; regularly skipping every nth grid
  // point creates visible diagonal channels through the finished letter.
  for (let layer = 0; layer < depthLayers; layer++) {
    const samples = layers[layer];
    for (let i = samples.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [samples[i], samples[j]] = [samples[j], samples[i]];
    }
    samples.length = layerCounts[layer];
  }
  const candidates = layers.flat();
  candidates.sort((a, b) => a[1] - b[1]);
  const worldScale = LOGO_HEIGHT / height;
  const layout = {
    count, depthLayers, aspect: width / height, cubeSide: spacing * worldScale * 1.08,
    targets: new Float32Array(count * 3),
    rotations: new Float32Array(count * 3),
    ribbons: new Float32Array(count * 3),
    drift: new Float32Array(count * 3),
    sizes: new Float32Array(count), delays: new Float32Array(count), durations: new Float32Array(count),
    colorVariation: new Float32Array(count), components: new Uint32Array(count), layers: new Uint8Array(count),
    largestComponent: largest, driftingCount: 0,
  };
  const edges = [];
  for (let i = 0; i < count; i++) {
    const [px, py, layer] = candidates[i];
    const offset = i * 3;
    layout.targets[offset] = (px - width / 2) * worldScale;
    layout.targets[offset + 1] = (height / 2 - py) * worldScale;
    layout.targets[offset + 2] = ((depthLayers - 1) / 2 - layer) * layout.cubeSide * 0.94 + (random() - 0.5) * layout.cubeSide * 0.16;
    layout.layers[i] = layer;
    layout.components[i] = labels[Math.round(py) * width + Math.round(px)];
    for (let axis = 0; axis < 3; axis++) layout.rotations[offset + axis] = (random() - 0.5) * (axis === 2 ? 0.54 : 0.34);
    layout.ribbons[offset] = ribbonAngle((i + random() * 0.5) / count);
    // A mixture of a dense fold and scattered edges makes the wide sheet
    // cloud-like. The fold wanders off-center along the ribbon.
    const angle = layout.ribbons[offset];
    const across = random() < 0.56
      ? (random() + random() + random() - 1.5) * 0.85 - 0.18 + 0.22 * Math.sin(angle * 3 + 0.6)
      : (random() - 0.5) * 2;
    layout.ribbons[offset + 1] = Math.max(-1, Math.min(1, across));
    layout.ribbons[offset + 2] = random() * TAU;
    layout.delays[i] = py / height * 1.15 + random() * 0.14;
    layout.durations[i] = 1.1 + random() * 0.25;
    // Keep the layered destinations while reducing each cube's side by 30%.
    layout.sizes[i] = (0.92 + random() * 0.15) * 0.7;
    layout.colorVariation[i] = random();
    const distance = spacing * 2.5;
    const left = occupied(px - distance, py), right = occupied(px + distance, py);
    const above = occupied(px, py - distance), below = occupied(px, py + distance);
    if (layout.components[i] === largest && (!left || !right || !above || !below)) {
      let dx = left - right, dy = below - above;
      if (!dx && !dy) { dx = layout.targets[offset]; dy = layout.targets[offset + 1]; }
      const length = Math.hypot(dx, dy) || 1;
      edges.push({ index: i, dx: dx / length, dy: dy / length, order: random() });
    }
  }
  edges.sort((a, b) => a.order - b.order);
  layout.driftingCount = Math.min(Math.round(count * 0.1), edges.length);
  for (const { index, dx, dy } of edges.slice(0, layout.driftingCount)) {
    const distance = 0.18 + random() * 0.4;
    const offset = index * 3;
    layout.drift[offset] = dx * distance + (random() - 0.5) * 0.12;
    layout.drift[offset + 1] = dy * distance + (random() - 0.5) * 0.12;
    layout.drift[offset + 2] = (random() - 0.5) * 0.5;
  }
  layout.neighborPairs = createNeighborPairs(layout);
  return layout;
}

function createNeighborPairs(layout) {
  const cellSize = layout.cubeSide * 2.4;
  const cells = new Map();
  const pairs = [];
  for (let i = 0; i < layout.count; i++) {
    const x = layout.targets[i * 3], y = layout.targets[i * 3 + 1];
    const cx = Math.floor(x / cellSize), cy = Math.floor(y / cellSize);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const neighbors = cells.get(`${cx + dx},${cy + dy}`);
      if (!neighbors) continue;
      for (const j of neighbors) {
        const tx = x - layout.targets[j * 3], ty = y - layout.targets[j * 3 + 1];
        if (tx * tx + ty * ty < cellSize * cellSize) pairs.push(j, i);
      }
    }
    const key = `${cx},${cy}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(i);
  }
  return new Uint32Array(pairs);
}

// Short-range soft contacts give the arrival wave an impact response while
// keeping the authored outline. This is not a full rigid-body simulation.
export function resolveArrivalContacts(layout, positions, elapsed) {
  if (elapsed >= GATHER_END) return 0;
  const strength = 1 - smooth((elapsed - 2.8) / (GATHER_END - 2.8));
  let contacts = 0;
  for (let pass = 0; pass < 2; pass++) for (let pair = 0; pair < layout.neighborPairs.length; pair += 2) {
    const i = layout.neighborPairs[pair], j = layout.neighborPairs[pair + 1];
    if (elapsed < layout.delays[i] + layout.durations[i] * 0.85 || elapsed < layout.delays[j] + layout.durations[j] * 0.85) continue;
    const a = i * 3, b = j * 3;
    const dx = positions[b] - positions[a], dy = positions[b + 1] - positions[a + 1], dz = positions[b + 2] - positions[a + 2];
    const minDistance = layout.cubeSide * (layout.sizes[i] + layout.sizes[j]) * 0.475;
    const squaredDistance = dx * dx + dy * dy + dz * dz;
    if (squaredDistance >= minDistance * minDistance || squaredDistance < 1e-12) continue;
    const distance = Math.sqrt(squaredDistance);
    const push = (minDistance - distance) / distance * 0.42 * strength;
    positions[a] -= dx * push; positions[b] += dx * push;
    positions[a + 1] -= dy * push; positions[b + 1] += dy * push;
    positions[a + 2] -= dz * push; positions[b + 2] += dz * push;
    contacts++;
  }
  return contacts;
}

// Writes into a reused object: no allocations in the animation loop.
export function writeParticleTransform(layout, index, elapsed, ribbonSqueeze, out) {
  const offset = index * 3;
  const phase = layout.ribbons[offset + 2];
  let x = layout.targets[offset], y = layout.targets[offset + 1], z = layout.targets[offset + 2];
  let rx = layout.rotations[offset], ry = layout.rotations[offset + 1], rz = layout.rotations[offset + 2];
  if (elapsed < GATHER_END) {
    const angle = layout.ribbons[offset] + elapsed * 0.055;
    const across = layout.ribbons[offset + 1];
    const wave = elapsed * 0.12;
    const starRadius = 2.7 + 0.68 * Math.cos(5 * (angle - Math.PI / 2)) + 0.12 * Math.sin(angle * 2 + 0.3);
    const outerWidth = 1.25 + 0.31 * Math.sin(angle * 3 + 0.8 + wave) + 0.17 * Math.cos(angle * 2 - wave);
    const innerWidth = 2.35 + 0.33 * Math.cos(angle * 2 + 0.5 - wave) + 0.16 * Math.sin(angle * 4 + wave);
    const radius = starRadius + across * (across < 0 ? innerWidth : outerWidth) + Math.sin(phase) * 0.13;
    // Different inner/outer widths and tangential displacement keep the
    // edges asymmetric; folded depth lets the broad ribbons overlap.
    const tangent = across * across * (0.2 * Math.sin(angle * 6 + wave) + 0.1 * Math.cos(phase));
    const cx = (radius * Math.cos(angle) - tangent * Math.sin(angle)) * 0.91 * ribbonSqueeze;
    const cy = (radius * Math.sin(angle) + tangent * Math.cos(angle)) * 0.91;
    const cz = 1.1 * Math.sin(angle * 3 + 0.4 + wave) + across * 1.05 * Math.cos(angle * 2 - wave) + Math.cos(phase) * 0.13;
    const travel = Math.max(0, (elapsed - layout.delays[index]) / layout.durations[index]);
    // Accelerate into the slot instead of decelerating before contact.
    const progress = Math.min(1, travel * travel);
    const ribbonWeight = 1 - progress;
    const arc = Math.sin(progress * Math.PI) * 0.28;
    x = cx * ribbonWeight + x * progress + Math.sin(phase) * arc;
    y = cy * ribbonWeight + y * progress + Math.cos(phase) * arc;
    z = cz * ribbonWeight + z * progress + Math.sin(phase * 2) * arc;
    rx += (Math.sin(phase) * 1.2 + elapsed * 0.1) * ribbonWeight;
    ry += (Math.cos(phase) * 1.1 + elapsed * 0.13) * ribbonWeight;
    rz += Math.sin(phase * 2) * 0.8 * ribbonWeight;
    if (travel >= 1) {
      const sinceImpact = elapsed - layout.delays[index] - layout.durations[index];
      const bounce = layout.cubeSide * 1.3 * Math.exp(-6.5 * sinceImpact) * Math.sin(15 * sinceImpact) * (1 - smooth((elapsed - 2.8) / 0.8));
      const dx = layout.targets[offset] - cx, dy = layout.targets[offset + 1] - cy, dz = layout.targets[offset + 2] - cz;
      const length = Math.hypot(dx, dy, dz) || 1;
      x += dx / length * bounce; y += dy / length * bounce; z += dz / length * bounce;
      rz += Math.sin(phase) * bounce * 1.2;
    }
  } else if (elapsed > IDLE_START) {
    const breath = (1 - Math.cos((elapsed - IDLE_START) * TAU / 8)) * 0.5;
    x += layout.drift[offset] * breath;
    y += layout.drift[offset + 1] * breath;
    z += layout.drift[offset + 2] * breath;
    const isDrifting = !!(layout.drift[offset] || layout.drift[offset + 1] || layout.drift[offset + 2]);
    const turn = (isDrifting ? 0.17 : 0.015) * breath;
    rx += Math.sin(phase) * turn;
    ry += Math.cos(phase) * turn;
    rz += Math.sin(phase * 2) * turn;
  }
  // Incommensurate frequencies produce smooth, independent micro-motion,
  // bounded to 20% of the cube side in total distance from its moving center.
  const side = layout.cubeSide * layout.sizes[index];
  const entropy = side * 0.2 / Math.sqrt(3);
  const frequency = 0.7 + layout.colorVariation[index] * 0.9;
  x += Math.sin(elapsed * 0.73 * frequency + phase) * entropy;
  y += Math.sin(elapsed * 0.91 * frequency + phase * 1.9) * entropy;
  z += Math.cos(elapsed * 0.61 * frequency + phase * 0.7) * entropy;
  rz += Math.sin(elapsed * 0.8 * frequency + phase) * 0.025;
  out.x = x; out.y = y; out.z = z;
  out.rx = rx; out.ry = ry; out.rz = rz;
  out.scale = side;
  return out;
}

export function phaseAt(elapsed) {
  return elapsed < 0.04 ? 'flowing' : elapsed < GATHER_END ? 'gathering' : elapsed < IDLE_START ? 'holding' : 'drifting';
}
