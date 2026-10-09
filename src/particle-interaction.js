export const TILT_LIMIT = Math.PI / 60;
export const RIPPLE_DURATION = 2.6;
const MAGNET_RADIUS = 1.5;
const SPRING_FREQUENCY = 12;
const smooth = (value) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

export function createInteractionState(count) {
  return {
    offsets: new Float32Array(count * 3), velocities: new Float32Array(count * 3),
    pointerActive: false, pointerX: 0, pointerY: 0, normalizedX: 0, normalizedY: 0,
    presence: 0, tiltX: 0, tiltY: 0, delta: 0, springDecay: 1, phaseStrength: 0.25,
    ripples: Array.from({ length: 4 }, () => ({ active: false, x: 0, y: 0, start: 0, age: 0 })),
    nextRipple: 0, affectedParticles: 0, maxDisplacement: 0,
  };
}

export function resetInteraction(state) {
  state.offsets.fill(0);
  state.velocities.fill(0);
  state.pointerActive = false;
  state.presence = state.tiltX = state.tiltY = state.normalizedX = state.normalizedY = 0;
  state.affectedParticles = state.maxDisplacement = state.nextRipple = 0;
  for (const ripple of state.ripples) ripple.active = false;
}

export function addClickRipple(state, x, y, elapsed) {
  const ripple = state.ripples[state.nextRipple];
  ripple.active = true;
  ripple.x = x; ripple.y = y; ripple.start = elapsed; ripple.age = 0;
  state.nextRipple = (state.nextRipple + 1) % state.ripples.length;
}

export function advanceInteraction(state, delta, elapsed) {
  state.delta = delta;
  state.springDecay = Math.exp(-SPRING_FREQUENCY * delta);
  state.phaseStrength = 0.25 + 0.75 * smooth((elapsed - 1.5) / 2.1);
  const blend = 1 - Math.exp(-7 * delta);
  const presence = state.pointerActive ? 1 : 0;
  state.presence += (presence - state.presence) * blend;
  const tiltX = state.pointerActive ? -state.normalizedY * TILT_LIMIT * state.phaseStrength : 0;
  const tiltY = state.pointerActive ? state.normalizedX * TILT_LIMIT * state.phaseStrength : 0;
  state.tiltX += (tiltX - state.tiltX) * blend;
  state.tiltY += (tiltY - state.tiltY) * blend;
  state.affectedParticles = state.maxDisplacement = 0;
  for (const ripple of state.ripples) {
    ripple.age = elapsed - ripple.start;
    if (elapsed >= ripple.start + RIPPLE_DURATION) ripple.active = false;
  }
}

// Add offsets to the authored pose, never to the permanent destinations.
// The exact damped-spring update remains stable during slow GPU frames.
export function applyParticleInteraction(state, layout, index, transform) {
  const side = transform.scale;
  const componentStrength = layout.components[index] === layout.largestComponent ? 1 : 0.45;
  let targetX = 0, targetY = 0, targetZ = 0;
  if (state.presence > 0.0001) {
    const dx = state.pointerX - transform.x, dy = state.pointerY - transform.y;
    const squared = dx * dx + dy * dy;
    if (squared < MAGNET_RADIUS * MAGNET_RADIUS) {
      const distance = Math.sqrt(squared);
      const influence = (1 - distance / MAGNET_RADIUS) ** 2 * state.presence * state.phaseStrength * componentStrength;
      const pull = Math.min(distance * 0.3, side * 2 * influence);
      if (distance > 0.00001) { targetX = dx / distance * pull; targetY = dy / distance * pull; }
      targetZ = side * 0.35 * influence;
    }
  }
  const offset = index * 3;
  for (let axis = 0; axis < 3; axis++) {
    const target = axis === 0 ? targetX : axis === 1 ? targetY : targetZ;
    const difference = state.offsets[offset + axis] - target;
    const intermediate = (state.velocities[offset + axis] + SPRING_FREQUENCY * difference) * state.delta;
    state.offsets[offset + axis] = target + (difference + intermediate) * state.springDecay;
    state.velocities[offset + axis] = (state.velocities[offset + axis] - SPRING_FREQUENCY * intermediate) * state.springDecay;
  }
  let x = state.offsets[offset], y = state.offsets[offset + 1], z = state.offsets[offset + 2];
  for (const ripple of state.ripples) {
    if (!ripple.active) continue;
    const dx = transform.x - ripple.x, dy = transform.y - ripple.y;
    const distance = Math.hypot(dx, dy);
    const localAge = ripple.age - distance / 4.2;
    if (localAge <= 0 || localAge >= 0.85) continue;
    const envelope = Math.sin(Math.PI * localAge / 0.85) ** 2 * (1 - smooth((ripple.age - 1.8) / 0.8));
    const push = side * 4 * envelope * Math.exp(-distance * 0.12) * state.phaseStrength * componentStrength;
    if (distance > 0.00001) { x += dx / distance * push; y += dy / distance * push; }
    z += push * 0.3;
  }
  const length = Math.hypot(x, y, z);
  const limit = side * 5 * componentStrength;
  if (length > limit) { const scale = limit / length; x *= scale; y *= scale; z *= scale; }
  transform.x += x; transform.y += y; transform.z += z;
  transform.rx += Math.max(-0.14, Math.min(0.14, y / side * 0.035));
  transform.ry += Math.max(-0.14, Math.min(0.14, -x / side * 0.035));
  const displacement = Math.min(length, limit);
  if (displacement > side * 0.05) state.affectedParticles++;
  state.maxDisplacement = Math.max(state.maxDisplacement, displacement);
  return transform;
}
