import * as THREE from './vendor/three/three.module.min.js';

const contours = [
  [[-1.85,-1.15],[-1.47,-1.15],[-1.47,-0.19],[-0.65,-0.19],[-0.65,-1.15],[-0.27,-1.15],[-0.27,1.15],[-0.65,1.15],[-0.65,0.19],[-1.47,0.19],[-1.47,1.15],[-1.85,1.15]],
  [[0.12,1.15],[1.85,1.15],[1.85,0.79],[0.63,-0.77],[1.85,-0.77],[1.85,-1.15],[0.12,-1.15],[0.12,-0.79],[1.34,0.77],[0.12,0.77]],
];

// Static vertex attributes let twelve pieces assemble entirely on the GPU.
// All pieces share one line draw and one point draw, rather than separate meshes.
export function createLogoGeometry() {
  const lines = [], points = [], offsets = [], centers = [], motions = [];
  const lineOffsets = [], lineCenters = [], lineMotions = [];
  const edges = new Set(), nodes = new Set(), outlines = [], faces = [];
  const nodeSets = [];
  contours.forEach((contour, letter) => {
    const letterNodes = [];
    const mesh = lattice(contour, 0.14);
    const input = mesh.attributes.position;
    for (let i = 0; i < input.count; i += 3) {
      const triangle = [0,1,2].map(n => [input.getX(i+n),input.getY(i+n),input.getZ(i+n)]);
      const y = triangle.reduce((sum,p)=>sum+p[1],0)/3;
      const band = THREE.MathUtils.clamp(Math.floor((y+1.15)/(2.3/6)),0,5);
      const id = letter*6+band;
      const center = [letter ? 0.985 : -1.06, -1.15+(band+0.5)*2.3/6];
      const offset = [(letter ? 1 : -1)*(0.55+0.55*Math.sin(id*2.17)**2),Math.sin(id*1.7)*0.85,-0.4-Math.cos(id*1.3)**2];
      const motion = [(band%3)*0.09+letter*0.12,Math.sin(id*2.4)*0.5];
      for (let vertex = 0; vertex < 3; vertex++) {
        const a = triangle[vertex], b = triangle[(vertex+1)%3];
        const key = p => p.map(v=>v.toFixed(4)).join(',');
        const nodeKey = `${id}:${key(a)}`;
        if (!nodes.has(nodeKey)) {
          nodes.add(nodeKey);points.push(...a);offsets.push(...offset);centers.push(...center);motions.push(...motion);
          letterNodes.push(a);
        }
        const edgeKey = `${id}:${[key(a),key(b)].sort().join('|')}`;
        if (!edges.has(edgeKey)) {
          edges.add(edgeKey);lines.push(...a,...b);lineOffsets.push(...offset,...offset);lineCenters.push(...center,...center);lineMotions.push(...motion,...motion);
        }
      }
    }
    mesh.dispose();
    nodeSets.push(letterNodes);
    contour.forEach(([x,y],index)=>outlines.push(x,y,0,...contour[(index+1)%contour.length],0));
    const shape = new THREE.ShapeGeometry(new THREE.Shape(contour.map(([x,y])=>new THREE.Vector2(x,y))));
    faces.push(...shape.attributes.position.array);
    shape.dispose();
  });
  const bridges = [];
  const hEdge = nodeSets[0].filter(([x])=>x>-0.5).sort((a,b)=>a[1]-b[1]);
  const zEdge = nodeSets[1].filter(([x])=>x<0.5);
  for (let i=0;i<hEdge.length;i+=4) {
    const start=hEdge[i];let nearest,distance=Infinity;
    for(const end of zEdge) {
      const candidate=Math.hypot(start[0]-end[0],start[1]-end[1]);
      if(candidate<distance){nearest=end;distance=candidate;}
    }
    if(nearest&&distance<0.75)bridges.push(...start,...nearest);
  }
  const attributes = (geometry, offset, center, motion) => geometry
    .setAttribute('pieceOffset',new THREE.Float32BufferAttribute(offset,3))
    .setAttribute('pieceCenter',new THREE.Float32BufferAttribute(center,2))
    .setAttribute('pieceMotion',new THREE.Float32BufferAttribute(motion,2));
  return {
    lines: attributes(geometry(lines),lineOffsets,lineCenters,lineMotions),
    points: attributes(geometry(points),offsets,centers,motions),
    outlines: geometry(outlines), bridges: geometry(bridges), veil: geometry(faces),
  };
}

// A small, deterministic network covers the viewport, including space outside HZ.
export function createFieldGeometry(width,height,coarse) {
  const spacing = coarse ? 60 : 72;
  const columns = Math.ceil(width/spacing)+2, rows=Math.ceil(height/spacing)+2;
  const points=[],lines=[];
  let seed=41;
  const random=()=>{seed=seed*16807%2147483647;return seed/2147483647;};
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++) {
    points.push((column*spacing-width/2-spacing/2+(random()-0.5)*spacing*0.45)/100,
      (row*spacing-height/2-spacing/2+(random()-0.5)*spacing*0.45)/100,-0.35-random()*0.65);
  }
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++) {
    const index=row*columns+column;
    const neighbors=[];
    if(column+1<columns)neighbors.push(index+1);
    if(row+1<rows)neighbors.push(index+columns);
    if(column+1<columns&&row+1<rows&&(row+column)%3===0)neighbors.push(index+columns+1);
    for(const neighbor of neighbors)lines.push(...points.slice(index*3,index*3+3),...points.slice(neighbor*3,neighbor*3+3));
  }
  return {points:geometry(points),lines:geometry(lines)};
}
function geometry(vertices) {
  return new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
}
function inside([x,y],contour) {
  let result=false;
  for(let i=0,j=contour.length-1;i<contour.length;j=i++) {
    const [a,b]=contour[i],[c,d]=contour[j];
    if(Math.abs((x-a)*(d-b)-(y-b)*(c-a))<1e-7&&x>=Math.min(a,c)-1e-7&&x<=Math.max(a,c)+1e-7&&y>=Math.min(b,d)-1e-7&&y<=Math.max(b,d)+1e-7)return true;
    if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)result=!result;
  }
  return result;
}
function lattice(contour,spacing) {
  const vertices=[],low=Math.min(...contour.map(p=>p[0])),high=Math.max(...contour.map(p=>p[0]));
  const vertical=spacing*Math.sqrt(3)/2;
  const triangle=points=>{
    if(!points.every(point=>inside(point,contour)))return;
    const center=[points.reduce((sum,p)=>sum+p[0],0)/3,points.reduce((sum,p)=>sum+p[1],0)/3];
    if(!inside(center,contour))return;
    for(const [x,y]of points)vertices.push(x,y,0.045*Math.sin(x*1.8+y*0.7));
  };
  for(let row=0,y=-1.15;y+vertical<=1.15;row++,y+=vertical)for(let x=low-spacing+(row%2)*spacing/2;x<=high;x+=spacing) {
    const a=[x,y],b=[x+spacing,y],c=[x+spacing/2,y+vertical],d=[x-spacing/2,y+vertical];
    triangle([a,b,c]);triangle([a,c,d]);
  }
  return geometry(vertices);
}
