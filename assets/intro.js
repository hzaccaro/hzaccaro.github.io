import * as THREE from './vendor/three/three.module.min.js';
import { reducedMotion } from './motion.js';
import { createLogoGeometry, createFieldGeometry } from './logo-geometry.js';
import { createBloom } from './bloom.js';

const host = document.querySelector('[data-intro-scene]');
const stage = host?.querySelector('.intro-stage');
const canvas = host?.querySelector('canvas');
const motionButton = document.querySelector('.intro-motion');
const marker = document.querySelector('.hero-logo-space');
const hero = document.querySelector('.hero');
let renderLayout = () => {};
let scrollFrame = null;
let scrollProgress = 0;

function updateBackdrop() {
  scrollFrame = null;
  const progress = THREE.MathUtils.clamp(window.scrollY / Math.max(hero.offsetHeight * 0.65, 1), 0, 1);
  scrollProgress = progress * progress * (3 - 2 * progress);
  host.style.setProperty('--scene-blur', `${(scrollProgress * 4).toFixed(2)}px`);
  host.style.setProperty('--scene-opacity', (1 - scrollProgress * 0.18).toFixed(3));
  const rect = marker.getBoundingClientRect();
  const backdrop = stage.getBoundingClientRect();
  host.style.setProperty('--fallback-x', `${THREE.MathUtils.lerp(rect.left + rect.width / 2 - backdrop.left, backdrop.width * 0.58, scrollProgress)}px`);
  host.style.setProperty('--fallback-y', `${THREE.MathUtils.lerp(rect.top + window.scrollY + rect.height / 2, backdrop.height * 0.48, scrollProgress)}px`);
  host.style.setProperty('--fallback-width', `${rect.width * 0.9}px`);
  renderLayout();
}

if (host && canvas && stage && motionButton && marker && hero) {
  window.addEventListener('scroll', () => {
    if (scrollFrame === null) scrollFrame = requestAnimationFrame(updateBackdrop);
  }, { passive: true });
  window.addEventListener('resize', updateBackdrop);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' });
  } catch {
    host.dataset.render = document.body.dataset.sceneRender = 'fallback';
  }
  if (renderer) createLogo(renderer);
  updateBackdrop();
}

function createLogo(renderer) {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 30);
  camera.position.z = 8;
  const logo = new THREE.Group();
  scene.add(logo);
  let bloom = createBloom(renderer);
  const uniforms = {
    time: { value: 0 }, introTime: { value: 0 }, pointer: { value: new THREE.Vector2() },
    interaction: { value: 0 }, motion: { value: reducedMotion.matches ? 0 : 1 },
    pixelRatio: { value: 1 },
    colorA: { value: new THREE.Color('#83dbeb') },
    colorB: { value: new THREE.Color('#afaee8') },
    colorC: { value: new THREE.Color('#9ee5d0') },
  };
  const fieldUniforms = { ...uniforms, pointer: { value: new THREE.Vector2() } };
  const field = `
    uniform float time, introTime, interaction, motion, fragmented;
    uniform vec2 pointer;
    attribute vec3 pieceOffset;
    attribute vec2 pieceCenter, pieceMotion;
    float gravity(vec2 p) {
      vec2 offset = p - pointer;
      return interaction * motion / (1.0 + dot(offset, offset) * 2.8);
    }
    vec3 assemble(vec3 p) {
      float progress = clamp((introTime - pieceMotion.x) / 2.6, 0.0, 1.0);
      float remaining = pow(1.0 - progress, 3.0) * fragmented;
      float angle = pieceMotion.y * remaining;
      mat2 rotate = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
      p.xy = pieceCenter + rotate * (p.xy - pieceCenter);
      p += pieceOffset * remaining;
      p.y += sin(progress * 3.141593) * pieceMotion.y * fragmented * 0.25;
      return p;
    }
    vec3 deform(vec3 p) {
      float attraction = gravity(p.xy);
      p.xy += (pointer - p.xy) * attraction * 0.15;
      p.z += attraction * 1.1 + motion * 0.025 * sin(p.x * 2.0 + p.y + time * 0.6);
      return p;
    }`;
  const palette = `
    uniform vec3 colorA, colorB, colorC;
    uniform float time;
    varying vec2 localPosition;
    vec3 gradient() {
      float phase = time * 0.13 + localPosition.x * 0.38 + localPosition.y * 0.18;
      vec3 first = mix(colorA, colorB, 0.5 + 0.5 * sin(phase));
      return mix(first, colorC, 0.3 + 0.25 * sin(phase + 2.1));
    }`;
  const defaults = { pieceOffset: [0,0,0], pieceCenter: [0,0], pieceMotion: [0,0] };
  function lineMaterial(opacity, fragmented = false, ambient = false) {
    return new THREE.ShaderMaterial({
      uniforms: { ...(ambient ? fieldUniforms : uniforms), opacity: { value: opacity }, fragmented: { value: fragmented ? 1 : 0 } },
      defaultAttributeValues: defaults,
      vertexShader: `${field}
        varying vec2 localPosition;
        varying float alpha;
        void main() {
          vec3 p = assemble(position);
          localPosition = p.xy;
          alpha = 1.0 + gravity(p.xy) * 1.4;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(deform(p), 1.0);
        }`,
      fragmentShader: `${palette}
        uniform float opacity;
        varying float alpha;
        void main() {
          gl_FragColor = vec4(gradient(), opacity * alpha);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthTest: false, depthWrite: false,
    });
  }
  function pointMaterial(ambient = false) {
    return new THREE.ShaderMaterial({
      uniforms: { ...(ambient ? fieldUniforms : uniforms), fragmented: { value: ambient ? 0 : 1 }, ambient: { value: ambient ? 1 : 0 } },
      defaultAttributeValues: defaults,
      vertexShader: `${field}
        uniform float pixelRatio, ambient;
        varying vec2 localPosition;
        varying float intensity;
        void main() {
          vec3 p = assemble(position);
          localPosition = p.xy;
          float force = gravity(p.xy);
          float eased = force * force * (3.0 - 2.0 * force);
          vec4 viewPosition = modelViewMatrix * vec4(deform(p), 1.0);
          float depth = clamp(8.0 / -viewPosition.z, 0.65, 1.5);
          gl_PointSize = (mix(1.35, 1.9, ambient) + mix(5.8, 9.0, ambient) * pow(eased, 1.35)) * pixelRatio * depth;
          intensity = (mix(0.28, 0.24, ambient) + 0.72 * pow(eased, 0.7)) * depth;
          gl_Position = projectionMatrix * viewPosition;
        }`,
      fragmentShader: `${palette}
        varying float intensity;
        void main() {
          float circle = 1.0 - smoothstep(0.12, 0.5, length(gl_PointCoord - 0.5));
          gl_FragColor = vec4(gradient(), circle * intensity);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthTest: false, depthWrite: false,
    });
  }
  const geometry = createLogoGeometry();
  const outlineMaterial = lineMaterial(0.5);
  const bridgeMaterial = lineMaterial(0.08);
  const veilMaterial = lineMaterial(0);
  veilMaterial.side = THREE.DoubleSide;
  logo.add(new THREE.LineSegments(geometry.lines, lineMaterial(0.19, true)),
    new THREE.LineSegments(geometry.outlines, outlineMaterial),
    new THREE.LineSegments(geometry.bridges, bridgeMaterial),
    new THREE.Mesh(geometry.veil, veilMaterial),
    new THREE.Points(geometry.points, pointMaterial()));
  // GPU displacement exceeds the static geometry bounds during the opening.
  logo.children.forEach(object => { object.frustumCulled = false; });
  const ambientLines = new THREE.LineSegments(new THREE.BufferGeometry(), lineMaterial(0.037, false, true));
  const ambientPoints = new THREE.Points(new THREE.BufferGeometry(), pointMaterial(true));
  scene.add(ambientLines, ambientPoints);

  const worldTarget = new THREE.Vector2();
  const intersection = new THREE.Vector3();
  const tilt = new THREE.Vector2(), tiltTarget = new THREE.Vector2();
  let targetInteraction = 0;
  let elapsed = 0, introElapsed = 0;
  let previousTime = null, frame = null;
  let paused = false, contextLost = false;
  let touchReleaseTimer;
  let lastReducedMotion = reducedMotion.matches;
  let baseScale = 1;
  let viewport = { width: 1, height: 1, left: 0, top: 0 };
  let pointerX = 0, pointerY = 0, hasPointer = false;
  const canAnimate = () => !paused && !reducedMotion.matches && !document.hidden && !contextLost;

  function pose(delta) {
    if (canAnimate()) { elapsed += delta; introElapsed = Math.min(3.1, introElapsed + delta); }
    uniforms.introTime.value = reducedMotion.matches ? 3.1 : introElapsed;
    uniforms.motion.value = reducedMotion.matches ? 0 : 1;
    uniforms.time.value = elapsed;
    const smoothing = 1 - Math.exp(-delta * 7.5);
    if (hasPointer) {
      worldTarget.set((pointerX - viewport.left - viewport.width/2)/100,
        (viewport.height/2 - pointerY + viewport.top)/100);
      tiltTarget.set(worldTarget.x / (viewport.width/200), worldTarget.y / (viewport.height/200));
    }
    fieldUniforms.pointer.value.lerp(worldTarget, smoothing);
    tilt.lerp(tiltTarget, smoothing);
    logo.scale.setScalar(baseScale);
    logo.rotation.set(reducedMotion.matches ? 0 : tilt.y * 0.07, reducedMotion.matches ? 0 : tilt.x * 0.1, 0);
    logo.updateWorldMatrix(true, false);
    intersection.set(fieldUniforms.pointer.value.x, fieldUniforms.pointer.value.y, 0);
    logo.worldToLocal(intersection);
    uniforms.pointer.value.set(intersection.x, intersection.y);
    uniforms.interaction.value = reducedMotion.matches ? 0 : THREE.MathUtils.lerp(uniforms.interaction.value, targetInteraction, smoothing);
    const assembled = reducedMotion.matches ? 1 : THREE.MathUtils.smoothstep(introElapsed, 1.8, 3.1);
    outlineMaterial.uniforms.opacity.value = assembled * 0.5;
    bridgeMaterial.uniforms.opacity.value = assembled * 0.08;
    veilMaterial.uniforms.opacity.value = scrollProgress * assembled * 0.09;
    bloom.render(scene, camera);
  }
  function tick(time) {
    frame = null;
    if (lastReducedMotion !== reducedMotion.matches) { syncAnimation(); return; }
    const frameDuration = 1000 / (coarse || scrollProgress > 0.5 ? 30 : 60);
    if (previousTime !== null && time - previousTime < frameDuration - 0.5) {
      frame = requestAnimationFrame(tick); return;
    }
    const delta = previousTime === null ? 0 : Math.min((time-previousTime)/1000, 0.05);
    previousTime = time;
    pose(delta);
    if (canAnimate()) frame = requestAnimationFrame(tick);
  }
  function syncAnimation() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null; previousTime = null;
    lastReducedMotion = reducedMotion.matches;
    if (reducedMotion.matches) introElapsed = 3.1;
    motionButton.hidden = contextLost || reducedMotion.matches;
    host.dataset.motion = document.body.dataset.sceneMotion = reducedMotion.matches || paused ? 'still' : 'active';
    motionButton.setAttribute('aria-pressed', String(paused));
    motionButton.textContent = paused ? 'Retomar animação' : 'Pausar animação';
    if (contextLost) return;
    pose(0);
    if (canAnimate()) frame = requestAnimationFrame(tick);
  }
  function layout() {
    const { width, height, left } = viewport;
    const rect = marker.getBoundingClientRect();
    const originX = rect.left + rect.width/2 - left;
    const originY = rect.top + window.scrollY + rect.height/2;
    logo.position.set((THREE.MathUtils.lerp(originX,width*0.58,scrollProgress)-width/2)/100,
      (height/2-THREE.MathUtils.lerp(originY,height*0.48,scrollProgress))/100, 0);
    baseScale = Math.min(rect.width*0.9,420)/370;
    if (scrollProgress > 0.5) introElapsed = 3.1;
    if (!contextLost && (!canAnimate() || frame === null)) pose(0);
  }
  function resize() {
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height || contextLost) return;
    viewport = { width: rect.width, height: rect.height, left: rect.left, top: rect.top };
    // Bound fill rate independently of display resolution and device pixel ratio.
    const ratio = Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 1.5, Math.sqrt(1600000/(rect.width*rect.height)));
    renderer.setPixelRatio(ratio);
    uniforms.pixelRatio.value = ratio;
    renderer.setSize(rect.width, rect.height, false);
    bloom.resize(canvas.width, canvas.height);
    camera.left = -rect.width/200; camera.right = rect.width/200;
    camera.top = rect.height/200; camera.bottom = -rect.height/200;
    camera.updateProjectionMatrix();
    const network = createFieldGeometry(rect.width, rect.height, coarse);
    ambientLines.geometry.dispose(); ambientPoints.geometry.dispose();
    ambientLines.geometry = network.lines; ambientPoints.geometry = network.points;
    layout();
  }
  function updatePointer(event) {
    if (lastReducedMotion !== reducedMotion.matches) syncAnimation();
    if (!canAnimate() || document.body.classList.contains('menu-open')) return;
    if (event.clientX < viewport.left || event.clientX > viewport.left + viewport.width) { releasePointer(); return; }
    window.clearTimeout(touchReleaseTimer);
    pointerX = event.clientX; pointerY = event.clientY; hasPointer = true;
    targetInteraction = 1;
  }
  function releasePointer() {
    window.clearTimeout(touchReleaseTimer);
    targetInteraction = 0; hasPointer = false; tiltTarget.set(0,0);
  }
  function releaseTouch(event) {
    if (event.pointerType !== 'mouse') touchReleaseTimer = window.setTimeout(releasePointer, 950);
  }
  // Capture sees events through panels; passive handlers keep native touch scrolling.
  // Only coordinates are stored here; GPU uniforms update once per rendered frame.
  document.addEventListener('pointermove', updatePointer, { passive: true, capture: true });
  document.addEventListener('pointerdown', updatePointer, { passive: true, capture: true });
  document.addEventListener('pointerup', releaseTouch, { passive: true, capture: true });
  document.addEventListener('pointercancel', releaseTouch, { passive: true, capture: true });
  document.documentElement.addEventListener('pointerleave', event => {
    if (event.pointerType === 'mouse') releasePointer();
  });
  motionButton.addEventListener('click', () => { paused = !paused; releasePointer(); syncAnimation(); });
  reducedMotion.addEventListener('change', () => { releasePointer(); syncAnimation(); });
  document.addEventListener('visibilitychange', () => { releasePointer(); syncAnimation(); });
  window.addEventListener('pageshow', syncAnimation);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); contextLost = true;
    host.dataset.render = document.body.dataset.sceneRender = 'fallback'; syncAnimation();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    bloom.dispose(); bloom = createBloom(renderer);
    host.dataset.render = document.body.dataset.sceneRender = 'ready'; resize(); syncAnimation();
  });
  renderLayout = layout;
  new ResizeObserver(() => { resize(); updateBackdrop(); }).observe(stage);
  new ResizeObserver(updateBackdrop).observe(hero);
  resize();
  host.dataset.render = document.body.dataset.sceneRender = 'ready';
  syncAnimation();
}
