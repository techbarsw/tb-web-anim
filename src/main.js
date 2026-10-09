import './styles.css';
import { createParticleLogo } from './particle-logo.js';

const container = document.querySelector('#animation');
const pauseButton = document.querySelector('#pause');
const replayButton = document.querySelector('#replay');
const phaseLabel = document.querySelector('#phase-label');
const particleLabel = document.querySelector('#particle-label');
const interactionHint = document.querySelector('#interaction-hint');
let animation;
let disposed = false;
const events = new AbortController();
let lastControlState = '';

function updateControls(state) {
  const signature = `${state.mode}/${state.paused}/${state.phase}/${state.particleCount}/${state.interactive}`;
  if (signature === lastControlState) return;
  lastControlState = signature;
  const isStatic = state.mode === 'static';
  interactionHint.innerHTML = state.interactive && !state.paused
    ? matchMedia('(any-hover: hover)').matches ? 'Move to attract. <br />Click to send a ripple.' : 'One familiar shape. <br />Tap to send a ripple.'
    : 'A thousand little movements. <br />One familiar shape.';
  phaseLabel.textContent = isStatic ? 'Still mark' : state.paused ? 'Paused' : state.phase[0].toUpperCase() + state.phase.slice(1);
  particleLabel.textContent = isStatic ? 'Ready for the homepage' : `${state.particleCount.toLocaleString()} cubes`;
  pauseButton.disabled = isStatic;
  replayButton.disabled = isStatic;
  pauseButton.setAttribute('aria-label', state.paused ? 'Resume animation' : 'Pause animation');
  pauseButton.querySelector('span').textContent = state.paused ? 'Resume' : 'Pause';
  pauseButton.querySelector('svg').innerHTML = state.paused ? '<path d="m5 3 7 5-7 5z" />' : '<path d="M5 3v10M11 3v10" />';
}

container.addEventListener('particlelogo:state', (event) => updateControls(event.detail), { signal: events.signal });
pauseButton.addEventListener('click', () => {
  if (!animation) return;
  if (animation.getState().paused) animation.resume();
  else animation.pause();
}, { signal: events.signal });
replayButton.addEventListener('click', () => animation?.replay(), { signal: events.signal });

try {
  animation = await createParticleLogo(container, { logoUrl: `${import.meta.env.BASE_URL}logo.svg` });
  if (disposed) animation.destroy();
  else {
    container.particleLogo = animation;
    container.querySelector('.initial-mark')?.remove();
    updateControls(animation.getState());
  }
} catch (error) {
  console.error('Particle animation could not start:', error);
  phaseLabel.textContent = 'Still mark';
  particleLabel.textContent = 'Animation unavailable';
}

window.addEventListener('pagehide', (event) => { if (!event.persisted) animation?.destroy(); }, { signal: events.signal });
if (import.meta.hot) import.meta.hot.dispose(() => {
  disposed = true;
  events.abort();
  animation?.destroy();
  delete container.particleLogo;
});
