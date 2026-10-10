import * as THREE from './vendor/three/three.module.min.js';
import { reducedMotion } from './motion.js';

const host = document.querySelector('[data-intro-scene]');
const stage = host?.querySelector('.intro-stage');
const canvas = host?.querySelector('canvas');
const motionButton = host?.querySelector('.intro-motion');

if (host && canvas && stage && motionButton) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    host.dataset.render = 'fallback';
  }
  if (renderer) createLogo(renderer);
}

function createLogo(renderer) {
  // A bounded pixel ratio and unlit materials keep the mesh light on mobile GPUs.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-2.6, 2.6, 2.6, -2.6, 0.1, 20);
  camera.position.z = 6;
  const logo = new THREE.Group();
  scene.add(logo);

  const uniforms = {
    time: { value: 0 },
    pointer: { value: new THREE.Vector2(0, 0) },
    interaction: { value: 0 },
    motion: { value: reducedMotion.matches ? 0 : 1 },
  };
  const deformation = `
    uniform float time;
    uniform vec2 pointer;
    uniform float interaction;
    uniform float motion;
    vec3 deform(vec3 p) {
      vec2 offset = p.xy - pointer;
      float distance = length(offset);
      float influence = exp(-distance * distance * 1.4) * interaction;
      p.z += motion * (0.04 * sin(p.x * 3.0 + p.y * 2.0 + time)
        + influence * 0.25 * cos(distance * 5.0 - time * 4.0));
      p.xy += motion * offset * influence * 0.07;
      return p;
    }`;
  const vertexShader = `${deformation}
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(deform(position), 1.0);
    }`;
  function material(color, opacity, wireframe = false) {
    return new THREE.ShaderMaterial({
      uniforms: { ...uniforms, color: { value: new THREE.Color(color) }, opacity: { value: opacity } },
      vertexShader,
      fragmentShader: `
        uniform vec3 color;
        uniform float opacity;
        void main() {
          gl_FragColor = vec4(color, opacity);
          #include <colorspace_fragment>
        }`,
      wireframe, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
  }

  // Block letter contours follow the site's HZ identity, with real front/back faces.
  const contours = [
    { color: '#d8f7ff', points: [
      [-1.85, -1.15], [-1.47, -1.15], [-1.47, -0.19], [-0.65, -0.19],
      [-0.65, -1.15], [-0.27, -1.15], [-0.27, 1.15], [-0.65, 1.15],
      [-0.65, 0.19], [-1.47, 0.19], [-1.47, 1.15], [-1.85, 1.15],
    ] },
    { color: '#30d6ff', points: [
      [0.12, 1.15], [1.85, 1.15], [1.85, 0.79], [0.63, -0.77],
      [1.85, -0.77], [1.85, -1.15], [0.12, -1.15], [0.12, -0.79],
      [1.34, 0.77], [0.12, 0.77],
    ] },
  ];
  for (const { color, points } of contours) {
    const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    const outline = new THREE.ExtrudeGeometry(shape, { depth: 0.32, bevelEnabled: false, steps: 1, curveSegments: 1 });
    outline.translate(0, 0, -0.16);
    const surface = subdivide(outline, 5);
    logo.add(new THREE.Mesh(surface, material(color, 0.32, true)));
    logo.add(new THREE.Mesh(outline, material(color, 0.035)));
    logo.add(new THREE.LineSegments(new THREE.EdgesGeometry(outline, 15), material(color, 0.95)));

    const nodes = new THREE.BufferGeometry();
    const unique = new Map();
    const positions = surface.attributes.position;
    for (let i = 0; i < positions.count; i += 1) {
      const point = [positions.getX(i), positions.getY(i), positions.getZ(i)];
      unique.set(point.map((value) => value.toFixed(4)).join(','), point);
    }
    nodes.setAttribute('position', new THREE.Float32BufferAttribute([...unique.values()].flat(), 3));
    const nodeMaterial = new THREE.ShaderMaterial({
      uniforms: { ...uniforms, color: { value: new THREE.Color(color) }, pixelRatio: { value: renderer.getPixelRatio() } },
      vertexShader: `${deformation}
        uniform float pixelRatio;
        varying float highlight;
        void main() {
          highlight = exp(-length(position.xy - pointer) * 1.5) * interaction * motion;
          gl_PointSize = (1.8 + highlight * 2.5) * pixelRatio;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(deform(position), 1.0);
        }`,
      fragmentShader: `
        uniform vec3 color;
        varying float highlight;
        void main() {
          float alpha = 1.0 - smoothstep(0.2, 0.5, length(gl_PointCoord - 0.5));
          gl_FragColor = vec4(color, alpha * (0.45 + highlight * 0.55));
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    });
    logo.add(new THREE.Points(nodes, nodeMaterial));
  }

  const gridGeometry = new THREE.PlaneGeometry(6.4, 5.2, 28, 22);
  gridGeometry.translate(0, 0, -0.8);
  logo.add(new THREE.Mesh(gridGeometry, material('#30d6ff', 0.045, true)));

  const pointerTarget = new THREE.Vector2();
  const tilt = new THREE.Vector2();
  const tiltTarget = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const intersection = new THREE.Vector3();
  let targetInteraction = 0;
  let elapsed = 0;
  let previousTime = null;
  let frame = null;
  let visible = false;
  let paused = false;
  let contextLost = false;
  let touchReleaseTimer;
  let lastReducedMotion = reducedMotion.matches;
  const canAnimate = () => !paused && !reducedMotion.matches && visible && !document.hidden && !contextLost;

  function pose(delta) {
    if (canAnimate()) elapsed += delta;
    const smoothing = 1 - Math.exp(-delta * 7);
    uniforms.pointer.value.lerp(pointerTarget, smoothing);
    uniforms.interaction.value = THREE.MathUtils.lerp(uniforms.interaction.value, targetInteraction, smoothing);
    uniforms.time.value = elapsed;
    uniforms.motion.value = reducedMotion.matches ? 0 : 1;
    tilt.lerp(tiltTarget, smoothing);
    const reveal = reducedMotion.matches ? 1 : 1 - (1 - Math.min(elapsed / 1.4, 1)) ** 3;
    logo.scale.setScalar(0.92 + reveal * 0.08);
    logo.rotation.set(reducedMotion.matches ? 0 : tilt.y * 0.14 + Math.sin(elapsed * 0.35) * 0.025,
      reducedMotion.matches ? 0 : -0.1 + tilt.x * 0.22 + Math.sin(elapsed * 0.25) * 0.035, 0);
    renderer.render(scene, camera);
  }
  function tick(time) {
    frame = null;
    // Some mobile browsers update matches before delivering the change event.
    if (lastReducedMotion !== reducedMotion.matches) {
      syncAnimation();
      return;
    }
    const delta = previousTime === null ? 0 : Math.min((time - previousTime) / 1000, 0.05);
    previousTime = time;
    pose(delta);
    if (canAnimate()) frame = requestAnimationFrame(tick);
  }
  function syncAnimation() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    previousTime = null;
    lastReducedMotion = reducedMotion.matches;
    motionButton.hidden = contextLost || reducedMotion.matches;
    host.dataset.motion = reducedMotion.matches || paused ? 'still' : 'active';
    motionButton.setAttribute('aria-pressed', String(paused));
    motionButton.textContent = paused ? 'Retomar animação' : 'Pausar animação';
    if (contextLost) return;
    pose(0);
    if (canAnimate()) frame = requestAnimationFrame(tick);
  }
  function resize() {
    const { width, height } = stage.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const halfWidth = Math.max(2.6, 1.9 * aspect);
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = halfWidth / aspect;
    camera.bottom = -camera.top;
    camera.updateProjectionMatrix();
    if (!contextLost) pose(0);
  }
  function updatePointer(event) {
    if (lastReducedMotion !== reducedMotion.matches) syncAnimation();
    if (!canAnimate()) return;
    window.clearTimeout(touchReleaseTimer);
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * 2 - 1;
    const y = 1 - (event.clientY - rect.top) / rect.height * 2;
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    if (raycaster.ray.intersectPlane(plane, intersection)) {
      logo.worldToLocal(intersection);
      pointerTarget.set(intersection.x, intersection.y);
    }
    tiltTarget.set(x, y);
    targetInteraction = 1;
  }
  function releasePointer() {
    window.clearTimeout(touchReleaseTimer);
    targetInteraction = 0;
    tiltTarget.set(0, 0);
  }
  canvas.addEventListener('pointermove', updatePointer, { passive: true });
  canvas.addEventListener('pointerdown', updatePointer, { passive: true });
  canvas.addEventListener('pointerup', (event) => {
    // Let quick taps produce a visible ripple before returning to the resting pose.
    if (event.pointerType !== 'mouse') touchReleaseTimer = window.setTimeout(releasePointer, 650);
  }, { passive: true });
  canvas.addEventListener('pointercancel', releasePointer);
  canvas.addEventListener('pointerleave', (event) => { if (event.pointerType === 'mouse') releasePointer(); });
  motionButton.addEventListener('click', () => { paused = !paused; releasePointer(); syncAnimation(); });
  reducedMotion.addEventListener('change', () => { releasePointer(); syncAnimation(); });
  document.addEventListener('visibilitychange', syncAnimation);
  window.addEventListener('pageshow', syncAnimation);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    host.dataset.render = 'fallback';
    syncAnimation();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    host.dataset.render = 'ready';
    resize();
    syncAnimation();
  });
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    syncAnimation();
  }, { threshold: 0.05 }).observe(stage);
  new ResizeObserver(resize).observe(stage);
  resize();
  host.dataset.render = 'ready';
  syncAnimation();
}

// Subdivide the original faces instead of overlaying an unrelated grid on the logo.
function subdivide(geometry, divisions) {
  const input = geometry.attributes.position;
  const vertices = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const sample = (i, j) => [
    a.x + (b.x - a.x) * i / divisions + (c.x - a.x) * j / divisions,
    a.y + (b.y - a.y) * i / divisions + (c.y - a.y) * j / divisions,
    a.z + (b.z - a.z) * i / divisions + (c.z - a.z) * j / divisions,
  ];
  for (let face = 0; face < input.count; face += 3) {
    a.fromBufferAttribute(input, face);
    b.fromBufferAttribute(input, face + 1);
    c.fromBufferAttribute(input, face + 2);
    for (let i = 0; i < divisions; i += 1) {
      for (let j = 0; j < divisions - i; j += 1) {
        vertices.push(...sample(i, j), ...sample(i + 1, j), ...sample(i, j + 1));
        if (i + j < divisions - 1) vertices.push(...sample(i + 1, j), ...sample(i + 1, j + 1), ...sample(i, j + 1));
      }
    }
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  return result;
}
