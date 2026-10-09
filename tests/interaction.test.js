import test from 'node:test';
import assert from 'node:assert/strict';
import { addClickRipple, advanceInteraction, applyParticleInteraction, createInteractionState, resetInteraction, RIPPLE_DURATION, TILT_LIMIT } from '../src/particle-interaction.js';

const layout = { components: new Uint32Array([1, 1, 2]), largestComponent: 1 };
const pose = (x, y = 0) => ({ x, y, z: 0, rx: 0, ry: 0, rz: 0, scale: 0.1 });

function frame(state, delta, elapsed) {
  advanceInteraction(state, delta, elapsed);
  return [-0.5, 0.5, 3].map((x, index) => applyParticleInteraction(state, layout, index, pose(x)));
}

test('magnet attracts nearby cubes, leaves distant cubes in place, and returns smoothly', () => {
  const state = createInteractionState(3);
  state.pointerActive = true;
  state.pointerX = 0; state.pointerY = 0.3;
  state.normalizedX = 1; state.normalizedY = -1;
  let result;
  for (let i = 1; i <= 60; i++) result = frame(state, 1 / 60, 5 + i / 60);
  for (let index = 0; index < 2; index++) {
    assert.ok(Math.hypot(result[index].x, result[index].y - 0.3) < Math.hypot(0.5, 0.3));
    assert.ok(Math.hypot(result[index].x - (index ? 0.5 : -0.5), result[index].y, result[index].z) < 0.21);
  }
  assert.deepEqual(result[2], pose(3));
  assert.equal(state.affectedParticles, 2);
  assert.ok(state.tiltX > 0 && state.tiltX <= TILT_LIMIT);
  assert.ok(state.tiltY > 0 && state.tiltY <= TILT_LIMIT);
  state.pointerActive = false;
  for (let i = 1; i <= 180; i++) result = frame(state, 1 / 60, 6 + i / 60);
  assert.ok(Math.hypot(result[0].x + 0.5, result[0].y, result[0].z) < 1e-7);
  assert.ok(Math.abs(state.tiltX) < 1e-8 && Math.abs(state.tiltY) < 1e-8);
});

test('attraction remains stable and consistent across frame rates and long frames', () => {
  const results = [];
  for (const delta of [1 / 60, 1 / 30, 0.1]) {
    const state = createInteractionState(3);
    state.pointerActive = true;
    state.pointerY = 0.3;
    for (let i = 1; i <= Math.round(2 / delta); i++) frame(state, delta, 5 + i * delta);
    results.push(state.offsets[0]);
    assert.ok([...state.offsets, ...state.velocities].every(Number.isFinite));
    assert.ok(state.maxDisplacement < 0.21);
  }
  assert.ok(Math.max(...results) - Math.min(...results) < 0.00001);
});

test('a click travels outward as a wave and returns completely after its lifetime', () => {
  const state = createInteractionState(3);
  addClickRipple(state, 0, 0, 5);
  advanceInteraction(state, 0.1, 5.25);
  const near = applyParticleInteraction(state, layout, 0, pose(0.5));
  const far = applyParticleInteraction(state, layout, 1, pose(2));
  assert.ok(near.x > 0.5);
  assert.deepEqual(far, pose(2));
  advanceInteraction(state, 0.1, 5.8);
  assert.ok(applyParticleInteraction(state, layout, 1, pose(2)).x > 2);
  advanceInteraction(state, 0.1, 5 + RIPPLE_DURATION);
  assert.ok(state.ripples.every((ripple) => !ripple.active));
  assert.deepEqual(applyParticleInteraction(state, layout, 0, pose(0.5)), pose(0.5));
});

test('rapid clicks stay bounded, protect the detached square, and reset without leftover motion', () => {
  const state = createInteractionState(3);
  for (let i = 0; i < 100; i++) addClickRipple(state, 0, 0, 5);
  assert.equal(state.ripples.filter((ripple) => ripple.active).length, 4);
  advanceInteraction(state, 0.1, 5.55);
  const letter = applyParticleInteraction(state, layout, 0, pose(0.5));
  const square = applyParticleInteraction(state, layout, 2, pose(0.5));
  assert.ok(Math.hypot(letter.x - 0.5, letter.y, letter.z) <= 0.5 + 1e-8);
  assert.ok(square.x - 0.5 < letter.x - 0.5);
  state.pointerActive = true; state.normalizedX = 1;
  frame(state, 0.1, 5.6);
  resetInteraction(state);
  assert.ok(state.offsets.every((value) => value === 0));
  assert.ok(state.velocities.every((value) => value === 0));
  assert.ok(state.ripples.every((ripple) => !ripple.active));
  assert.equal(state.tiltX, 0); assert.equal(state.tiltY, 0);
  assert.equal(state.pointerActive, false);
});
