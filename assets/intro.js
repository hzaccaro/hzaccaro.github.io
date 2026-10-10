import * as THREE from './vendor/three/three.module.min.js';

// Three.js r180. All geometry, lighting and motion are generated locally.
const host = document.querySelector('[data-intro-scene]');
const canvas = host?.querySelector('canvas');
const motionButton = host?.querySelector('.intro-motion');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

if (host && canvas && motionButton) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    // The static sculpture and the entire portfolio remain available without WebGL.
    host.dataset.render = 'fallback';
  }
  if (renderer) createIntro(renderer);
}

function createIntro(renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 40);
  camera.position.set(0, 0.2, 8.2);
  camera.lookAt(0, 0, 0);

  // A small procedural studio gives the ice broad photographic reflections.
  // No remote HDR files, image textures, models or animation libraries.
  function createEnvironment() {
    const studio = new THREE.Scene();
    studio.background = new THREE.Color('#092732');
    const panels = [
      { color: '#e9fbff', intensity: 6, position: [-3, 3, 2], size: [3, 5] },
      { color: '#3fdbff', intensity: 4, position: [3, 1, 1], size: [2, 6] },
      { color: '#497dff', intensity: 2, position: [0, -3, -2], size: [5, 2] },
      { color: '#ffffff', intensity: 5, position: [1, 4, -3], size: [2, 3] },
    ];
    for (const panel of panels) {
      const material = new THREE.MeshBasicMaterial({ color: panel.color, side: THREE.DoubleSide });
      material.color.multiplyScalar(panel.intensity);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...panel.size), material);
      mesh.position.set(...panel.position);
      mesh.lookAt(0, 0, 0);
      studio.add(mesh);
    }
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(studio, 0.025, 0.1, 30);
    studio.traverse((object) => {
      object.geometry?.dispose();
      object.material?.dispose();
    });
    pmrem.dispose();
    return environment;
  }
  let environment = createEnvironment();
  scene.environment = environment.texture;

  scene.add(new THREE.HemisphereLight('#dafaff', '#032b43', 2));
  const key = new THREE.DirectionalLight('#e5fbff', 4);
  key.position.set(-3, 4, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#20caff', 5);
  rim.position.set(3, -1, -2);
  scene.add(rim);

  const sculpture = new THREE.Group();
  scene.add(sculpture);
  const geometry = new THREE.SphereGeometry(1, 96, 64);
  const positions = geometry.attributes.position;
  const point = new THREE.Vector3();
  for (let i = 0; i < positions.count; i += 1) {
    point.fromBufferAttribute(positions, i);
    const latitude = Math.acos(THREE.MathUtils.clamp(point.y, -1, 1));
    const longitude = Math.atan2(point.z, point.x);
    const radius = 1 + 0.19 * Math.sin(longitude * 3 + latitude * 2) * Math.sin(latitude) ** 2
      + 0.075 * Math.cos(latitude * 6 + longitude * 2) * Math.sin(latitude);
    point.multiplyScalar(radius);
    const twist = point.y * 0.65;
    const x = point.x * Math.cos(twist) - point.z * Math.sin(twist);
    const z = point.x * Math.sin(twist) + point.z * Math.cos(twist);
    positions.setXYZ(i, x * 1.16, point.y * 1.48, z * 1.12);
  }
  geometry.computeVertexNormals();
  const ice = new THREE.MeshPhysicalMaterial({
    color: '#8edce9', metalness: 0.38, roughness: 0.16,
    clearcoat: 1, clearcoatRoughness: 0.08,
    iridescence: 0.35, iridescenceIOR: 1.3,
    iridescenceThicknessRange: [80, 240], envMapIntensity: 1.65,
  });
  const core = new THREE.Mesh(geometry, ice);
  core.rotation.set(0.12, -0.4, -0.32);
  sculpture.add(core);

  const shardGeometry = new THREE.IcosahedronGeometry(0.15, 0);
  const shardMaterial = ice.clone();
  shardMaterial.roughness = 0.1;
  const shards = [];
  for (let i = 0; i < 7; i += 1) {
    const mesh = new THREE.Mesh(shardGeometry, shardMaterial);
    const angle = i * 2.39996;
    const distance = 1.85 + (i % 3) * 0.15;
    const origin = new THREE.Vector3(Math.cos(angle) * distance, Math.sin(angle) * distance * 0.92, Math.sin(i * 1.7) * 0.8);
    mesh.position.copy(origin);
    mesh.scale.setScalar(0.45 + (i % 3) * 0.25);
    mesh.rotation.set(i * 0.8, i * 0.4, i);
    sculpture.add(mesh);
    shards.push({ mesh, origin, phase: i * 1.7 });
  }

  // Seeded dust positions keep the composition consistent across page loads.
  let seed = 29;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const dustPositions = new Float32Array(180 * 3);
  for (let i = 0; i < dustPositions.length; i += 3) {
    dustPositions[i] = (random() - 0.5) * 8;
    dustPositions[i + 1] = (random() - 0.5) * 8;
    dustPositions[i + 2] = (random() - 0.5) * 5 - 1.5;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMaterial = new THREE.ShaderMaterial({
    uniforms: { pixelRatio: { value: renderer.getPixelRatio() } },
    vertexShader: `
      uniform float pixelRatio;
      varying float brightness;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        brightness = 0.2 + 0.4 * fract(position.x * 13.37);
        gl_PointSize = clamp(13.0 / -viewPosition.z, 1.0, 3.0) * pixelRatio;
        gl_Position = projectionMatrix * viewPosition;
      }`,
    fragmentShader: `
      varying float brightness;
      void main() {
        float radius = length(gl_PointCoord - 0.5);
        float alpha = (1.0 - smoothstep(0.08, 0.5, radius)) * brightness;
        gl_FragColor = vec4(0.55, 0.9, 1.0, alpha);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  scene.add(dust);

  const pointer = new THREE.Vector2();
  const follow = new THREE.Vector2();
  const neutralPointer = new THREE.Vector2();
  let elapsed = 0;
  let previousTime = null;
  let frame = null;
  let visible = true;
  let paused = false;
  let contextLost = false;
  const canAnimate = () => !paused && !reducedMotion.matches && visible && !document.hidden && !contextLost;

  function pose(delta) {
    const still = paused || reducedMotion.matches;
    if (!still) elapsed += delta;
    follow.lerp(still ? neutralPointer : pointer, 1 - Math.exp(-delta * 4));
    const reveal = reducedMotion.matches ? 1 : 1 - (1 - Math.min(elapsed / 2.4, 1)) ** 4;
    sculpture.scale.setScalar(0.72 + reveal * 0.28);
    sculpture.position.y = (1 - reveal) * -0.55 + Math.sin(elapsed * 0.55) * 0.09;
    sculpture.rotation.set(follow.y * 0.13, follow.x * 0.25 + elapsed * 0.075, follow.x * -0.06);
    core.scale.set(1 + Math.sin(elapsed * 0.45) * 0.025, 1 + Math.cos(elapsed * 0.4) * 0.02, 1);
    core.rotation.y = -0.4 + elapsed * 0.08;
    core.rotation.z = -0.32 + Math.sin(elapsed * 0.3) * 0.1;
    for (const { mesh, origin, phase } of shards) {
      mesh.position.copy(origin);
      mesh.position.y += Math.sin(elapsed * 0.65 + phase) * 0.12;
      mesh.rotation.x = phase + elapsed * 0.13;
      mesh.rotation.y = phase * 0.5 + elapsed * 0.1;
    }
    dust.rotation.y = elapsed * 0.012;
    renderer.render(scene, camera);
  }

  function tick(time) {
    frame = null;
    const delta = previousTime === null ? 0 : Math.min((time - previousTime) / 1000, 0.05);
    previousTime = time;
    pose(delta);
    if (canAnimate()) frame = requestAnimationFrame(tick);
  }

  function syncAnimation() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    previousTime = null;
    motionButton.hidden = reducedMotion.matches || contextLost;
    motionButton.setAttribute('aria-pressed', String(paused));
    motionButton.textContent = paused ? 'Retomar animação' : 'Pausar animação';
    if (contextLost) return;
    pose(0);
    if (canAnimate()) frame = requestAnimationFrame(tick);
  }

  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Keep every satellite within view in narrow portrait compositions.
    camera.position.z = Math.max(7.8, 5.1 / camera.aspect);
    camera.updateProjectionMatrix();
    if (!contextLost) pose(0);
  }

  host.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch' || !canAnimate()) return;
    const rect = host.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, (event.clientY - rect.top) / rect.height * 2 - 1);
  });
  host.addEventListener('pointerleave', () => pointer.set(0, 0));
  motionButton.addEventListener('click', () => { paused = !paused; syncAnimation(); });
  reducedMotion.addEventListener('change', syncAnimation);
  document.addEventListener('visibilitychange', syncAnimation);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    host.dataset.render = 'fallback';
    syncAnimation();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    environment.dispose();
    environment = createEnvironment();
    scene.environment = environment.texture;
    contextLost = false;
    host.dataset.render = 'ready';
    resize();
    syncAnimation();
  });
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    syncAnimation();
  }, { threshold: 0.05 });
  observer.observe(host);
  new ResizeObserver(resize).observe(host);
  resize();
  host.dataset.render = 'ready';
  syncAnimation();
}
