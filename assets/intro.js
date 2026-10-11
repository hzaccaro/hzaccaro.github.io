import * as THREE from './vendor/three/three.module.min.js';
import { reducedMotion } from './motion.js';

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
  host.style.setProperty('--scene-blur', `${(scrollProgress * 8).toFixed(2)}px`);
  host.style.setProperty('--scene-opacity', (1 - scrollProgress * 0.28).toFixed(3));
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
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    host.dataset.render = 'fallback';
    document.body.dataset.sceneRender = 'fallback';
  }
  if (renderer) createLogo(renderer);
  updateBackdrop();
}

function createLogo(renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 30);
  camera.position.z = 8;
  const logo = new THREE.Group();
  scene.add(logo);
  const uniforms = {
    time: { value: 0 }, pointer: { value: new THREE.Vector2() },
    interaction: { value: 0 }, motion: { value: reducedMotion.matches ? 0 : 1 },
    colorA: { value: new THREE.Color('#83dbeb') },
    colorB: { value: new THREE.Color('#afaee8') },
    colorC: { value: new THREE.Color('#9ee5d0') },
  };
  const field = `
    uniform float time;
    uniform vec2 pointer;
    uniform float interaction;
    uniform float motion;
    float gravity(vec2 p) {
      vec2 offset = p - pointer;
      // A softened inverse-square field: finite at the center, gentle at the edges.
      return (1.0 / (1.0 + dot(offset, offset) * 3.2)) * interaction * motion;
    }
    vec3 deform(vec3 p) {
      float attraction = gravity(p.xy);
      p.xy -= (p.xy - pointer) * attraction * 0.12;
      p.z += attraction * 0.85 + motion * 0.025 * sin(p.x * 2.0 + p.y + time * 0.6);
      return p;
    }`;
  const palette = `
    uniform vec3 colorA;
    uniform vec3 colorB;
    uniform vec3 colorC;
    uniform float time;
    varying vec2 localPosition;
    vec3 gradient() {
      float phase = time * 0.13 + localPosition.x * 0.38 + localPosition.y * 0.18;
      vec3 first = mix(colorA, colorB, 0.5 + 0.5 * sin(phase));
      return mix(first, colorC, 0.3 + 0.25 * sin(phase + 2.1));
    }`;
  function lineMaterial(opacity, backdrop = false) {
    return new THREE.ShaderMaterial({
      uniforms: { ...uniforms, opacity: { value: opacity }, backdrop: { value: backdrop ? 1 : 0 } },
      vertexShader: `${field}
        uniform float backdrop;
        varying vec2 localPosition;
        varying float alpha;
        void main() {
          localPosition = position.xy;
          float fade = mix(1.0, 1.0 - smoothstep(1.3, 4.4, length(position.xy)), backdrop);
          alpha = fade * (1.0 + gravity(position.xy) * 0.2);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(deform(position), 1.0);
        }`,
      fragmentShader: `${palette}
        uniform float opacity;
        varying float alpha;
        void main() {
          gl_FragColor = vec4(gradient(), opacity * alpha);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    });
  }
  const pointMaterial = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, pixelRatio: { value: renderer.getPixelRatio() } },
    vertexShader: `${field}
      uniform float pixelRatio;
      varying vec2 localPosition;
      varying float intensity;
      void main() {
        localPosition = position.xy;
        float force = gravity(position.xy);
        float eased = force * force * (3.0 - 2.0 * force);
        vec4 viewPosition = modelViewMatrix * vec4(deform(position), 1.0);
        float depth = clamp(8.0 / -viewPosition.z, 0.65, 1.5);
        // Size and opacity use different nonlinear curves, rather than a flat hover radius.
        gl_PointSize = (1.15 + 5.3 * pow(eased, 1.35)) * pixelRatio * depth;
        intensity = (0.23 + 0.72 * pow(eased, 0.7)) * depth;
        gl_Position = projectionMatrix * viewPosition;
      }`,
    fragmentShader: `${palette}
      varying float intensity;
      void main() {
        float circle = 1.0 - smoothstep(0.15, 0.5, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(gradient(), circle * intensity);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false,
  });
  const contours = [
    [[-1.85,-1.15],[-1.47,-1.15],[-1.47,-0.19],[-0.65,-0.19],[-0.65,-1.15],[-0.27,-1.15],[-0.27,1.15],[-0.65,1.15],[-0.65,0.19],[-1.47,0.19],[-1.47,1.15],[-1.85,1.15]],
    [[0.12,1.15],[1.85,1.15],[1.85,0.79],[0.63,-0.77],[1.85,-0.77],[1.85,-1.15],[0.12,-1.15],[0.12,-0.79],[1.34,0.77],[0.12,0.77]],
  ];
  const nodeSets = [];
  const veilMaterials = [];
  for (const contour of contours) {
    const mesh = lattice(contour, 0.14);
    logo.add(new THREE.LineSegments(new THREE.WireframeGeometry(mesh), lineMaterial(0.19)));
    const outline = new THREE.BufferGeometry().setFromPoints(contour.map(([x,y]) => new THREE.Vector3(x,y,0)));
    logo.add(new THREE.LineLoop(outline, lineMaterial(0.5)));
    // A faint wash becomes visible only behind the panels as the wireframe blurs.
    const veil = lineMaterial(0);
    veil.side = THREE.DoubleSide;
    veilMaterials.push(veil);
    logo.add(new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(contour.map(([x,y])=>new THREE.Vector2(x,y)))),veil));
    const unique = new Map();
    const positions = mesh.attributes.position;
    for (let i = 0; i < positions.count; i += 1) {
      const point = [positions.getX(i), positions.getY(i), positions.getZ(i)];
      unique.set(point.map(value => value.toFixed(4)).join(','), point);
    }
    const nodes = [...unique.values()];
    nodeSets.push(nodes);
    logo.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(nodes.flat(), 3)), pointMaterial));
    mesh.dispose();
  }
  // Sparse connections bridge H and Z without turning the strokes into solid ribbons.
  const bridges = [];
  const hEdge = nodeSets[0].filter(([x]) => x > -0.5).sort((a,b) => a[1] - b[1]);
  const zEdge = nodeSets[1].filter(([x]) => x < 0.5);
  for (let i = 0; i < hEdge.length; i += 3) {
    const start = hEdge[i];
    let nearest; let distance = Infinity;
    for (const end of zEdge) {
      const candidate = Math.hypot(start[0]-end[0],start[1]-end[1]);
      if (candidate < distance) { nearest = end; distance = candidate; }
    }
    if (nearest && distance < 0.75) bridges.push(...start,...nearest);
  }
  logo.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(bridges,3)),lineMaterial(0.08)));
  const grid = new THREE.PlaneGeometry(10,7,30,21);
  grid.translate(0,0,-0.5);
  logo.add(new THREE.LineSegments(new THREE.WireframeGeometry(grid),lineMaterial(0.027,true)));
  grid.dispose();

  const pointerTarget = new THREE.Vector2();
  const tilt = new THREE.Vector2();
  const tiltTarget = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0,0,1),0);
  const intersection = new THREE.Vector3();
  let targetInteraction = 0;
  let elapsed = 0;
  let previousTime = null;
  let frame = null;
  let paused = false;
  let contextLost = false;
  let touchReleaseTimer;
  let lastReducedMotion = reducedMotion.matches;
  let baseScale = 1;
  const frameDuration = 1000 / (window.matchMedia('(pointer: coarse)').matches ? 30 : 60);
  const canAnimate = () => !paused && !reducedMotion.matches && !document.hidden && !contextLost;

  function pose(delta) {
    if (canAnimate()) elapsed += delta;
    const smoothing = 1 - Math.exp(-delta * 5.5);
    uniforms.pointer.value.lerp(pointerTarget,smoothing);
    uniforms.interaction.value = THREE.MathUtils.lerp(uniforms.interaction.value,targetInteraction,smoothing);
    uniforms.time.value = elapsed;
    uniforms.motion.value = reducedMotion.matches ? 0 : 1;
    for (const material of veilMaterials) material.uniforms.opacity.value = scrollProgress * 0.14;
    tilt.lerp(tiltTarget,smoothing);
    const reveal = reducedMotion.matches ? 1 : 1 - Math.exp(-elapsed * 2.6);
    logo.scale.setScalar(baseScale * (0.96 + reveal * 0.04));
    logo.rotation.set(reducedMotion.matches ? 0 : tilt.y * 0.1, reducedMotion.matches ? 0 : tilt.x * 0.14,0);
    renderer.render(scene,camera);
  }
  function tick(time) {
    frame = null;
    if (lastReducedMotion !== reducedMotion.matches) { syncAnimation(); return; }
    if (previousTime !== null && time - previousTime < frameDuration - 0.5) {
      frame = requestAnimationFrame(tick);
      return;
    }
    const delta = previousTime === null ? 0 : Math.min((time-previousTime)/1000,0.05);
    previousTime = time;
    pose(delta);
    if (canAnimate()) frame = requestAnimationFrame(tick);
  }
  function syncAnimation() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null; previousTime = null;
    lastReducedMotion = reducedMotion.matches;
    motionButton.hidden = contextLost || reducedMotion.matches;
    host.dataset.motion = document.body.dataset.sceneMotion = reducedMotion.matches || paused ? 'still' : 'active';
    motionButton.setAttribute('aria-pressed',String(paused));
    motionButton.textContent = paused ? 'Retomar animação' : 'Pausar animação';
    if (contextLost) return;
    pose(0);
    if (canAnimate()) frame = requestAnimationFrame(tick);
  }
  function layout() {
    const {width,height,left} = stage.getBoundingClientRect();
    if (!width || !height) return;
    const rect = marker.getBoundingClientRect();
    const originX = rect.left + rect.width/2 - left;
    const originY = rect.top + window.scrollY + rect.height/2;
    logo.position.set((THREE.MathUtils.lerp(originX,width*0.58,scrollProgress)-width/2)/100,
      (height/2-THREE.MathUtils.lerp(originY,height*0.48,scrollProgress))/100,0);
    baseScale = Math.min(rect.width*0.9,420)/370;
    // Active frames already paint the new layout; scroll should not double GPU work.
    if (!contextLost && (!canAnimate() || frame === null)) pose(0);
  }
  function resize() {
    const {width,height} = stage.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width,height,false);
    camera.left=-width/200; camera.right=width/200;
    camera.top=height/200; camera.bottom=-height/200;
    camera.updateProjectionMatrix();
    layout();
  }
  function updatePointer(event) {
    if (lastReducedMotion !== reducedMotion.matches) syncAnimation();
    if (!canAnimate() || document.body.classList.contains('menu-open') || scrollProgress > 0.5) return;
    window.clearTimeout(touchReleaseTimer);
    const rect=canvas.getBoundingClientRect();
    const x=(event.clientX-rect.left)/rect.width*2-1;
    const y=1-(event.clientY-rect.top)/rect.height*2;
    raycaster.setFromCamera(new THREE.Vector2(x,y),camera);
    if (raycaster.ray.intersectPlane(plane,intersection)) {
      logo.worldToLocal(intersection);
      pointerTarget.set(intersection.x,intersection.y);
    }
    tiltTarget.set(x,y);
    targetInteraction=1;
  }
  function releasePointer() {
    window.clearTimeout(touchReleaseTimer);
    targetInteraction=0; tiltTarget.set(0,0);
  }
  // Passive document listeners reach the backdrop through text and panels without capturing gestures.
  document.addEventListener('pointermove',updatePointer,{passive:true});
  document.addEventListener('pointerdown',updatePointer,{passive:true});
  document.addEventListener('pointerup',event=>{if(event.pointerType!=='mouse')touchReleaseTimer=window.setTimeout(releasePointer,850)},{passive:true});
  document.addEventListener('pointercancel',releasePointer);
  document.documentElement.addEventListener('pointerleave',event=>{
    if(event.pointerType==='mouse')releasePointer();
  });
  motionButton.addEventListener('click',()=>{paused=!paused;releasePointer();syncAnimation()});
  reducedMotion.addEventListener('change',()=>{releasePointer();syncAnimation()});
  document.addEventListener('visibilitychange',syncAnimation);
  window.addEventListener('pageshow',syncAnimation);
  canvas.addEventListener('webglcontextlost',event=>{
    event.preventDefault();contextLost=true;
    host.dataset.render=document.body.dataset.sceneRender='fallback';syncAnimation();
  });
  canvas.addEventListener('webglcontextrestored',()=>{
    contextLost=false;host.dataset.render=document.body.dataset.sceneRender='ready';resize();syncAnimation();
  });
  renderLayout=()=>{if(scrollProgress>0.5)releasePointer();layout()};
  new ResizeObserver(()=>{resize();updateBackdrop()}).observe(stage);
  new ResizeObserver(updateBackdrop).observe(hero);
  resize();
  host.dataset.render=document.body.dataset.sceneRender='ready';
  syncAnimation();
}

function inside([x,y],contour) {
  let result=false;
  for(let i=0,j=contour.length-1;i<contour.length;j=i++) {
    const [a,b]=contour[i], [c,d]=contour[j];
    if(Math.abs((x-a)*(d-b)-(y-b)*(c-a))<1e-7 && x>=Math.min(a,c)-1e-7 && x<=Math.max(a,c)+1e-7 && y>=Math.min(b,d)-1e-7 && y<=Math.max(b,d)+1e-7)return true;
    if((b>y)!==(d>y) && x<(c-a)*(y-b)/(d-b)+a)result=!result;
  }
  return result;
}
function lattice(contour,spacing) {
  const vertices=[];
  const low=Math.min(...contour.map(p=>p[0]));
  const high=Math.max(...contour.map(p=>p[0]));
  const vertical=spacing*Math.sqrt(3)/2;
  const triangle=(points)=>{
    if(!points.every(point=>inside(point,contour)))return;
    const center=[points.reduce((sum,p)=>sum+p[0],0)/3,points.reduce((sum,p)=>sum+p[1],0)/3];
    if(!inside(center,contour))return;
    for(const [x,y] of points)vertices.push(x,y,0.045*Math.sin(x*1.8+y*0.7));
  };
  for(let row=0,y=-1.15;y+vertical<=1.15;row++,y+=vertical) {
    for(let x=low-spacing+(row%2)*spacing/2;x<=high;x+=spacing) {
      const a=[x,y],b=[x+spacing,y],c=[x+spacing/2,y+vertical],d=[x-spacing/2,y+vertical];
      triangle([a,b,c]);triangle([a,c,d]);
    }
  }
  return new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
}
