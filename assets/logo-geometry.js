import * as THREE from './vendor/three/three.module.min.js';

const contours = [
  [[-1.85,-1.15],[-1.47,-1.15],[-1.47,-0.19],[-0.65,-0.19],[-0.65,-1.15],[-0.27,-1.15],[-0.27,1.15],[-0.65,1.15],[-0.65,0.19],[-1.47,0.19],[-1.47,1.15],[-1.85,1.15]],
  [[0.12,1.15],[1.85,1.15],[1.85,0.79],[0.63,-0.77],[1.85,-0.77],[1.85,-1.15],[0.12,-1.15],[0.12,-0.79],[1.34,0.77],[0.12,0.77]],
];
const bandAt = y => THREE.MathUtils.clamp(Math.floor((y+1.15)/(2.3/6)),0,5);

// Each rigid fragment carries its own phase, frequency, amplitude and direction.
// Static attributes keep the entire animation on the GPU, with no vertex uploads.
export function createLogoGeometry() {
  const batches = Object.fromEntries(['lines','points','outlines','bridges','veil'].map(name =>
    [name, {positions:[],offsets:[],centers:[],motions:[],waves:[]} ]));
  const edges = new Set(), nodes = new Set(), nodeSets = [];
  const pieces = contours.map((_,letter) => Array.from({length:6},(_,band) => {
    const id = letter*6+band;
    return {
      id,
      center:[letter ? 0.985 : -1.06, -1.15+(band+0.5)*2.3/6],
      offset:[(letter ? 1 : -1)*(0.55+0.55*Math.sin(id*2.17)**2),Math.sin(id*1.7)*0.85,-0.4-Math.cos(id*1.3)**2],
      motion:[(band%3)*0.09+letter*0.12,Math.sin(id*2.4)*0.5],
      // Deterministic parameters avoid synchronized motion or per-frame randomness.
      wave:[id*2.399963,0.58+0.25*(0.5+0.5*Math.sin(id*1.91)),0.08+0.065*(0.5+0.5*Math.sin(id*2.73)),id*1.618034],
    };
  }));
  function append(name, point, piece) {
    const batch=batches[name];
    batch.positions.push(...point);batch.offsets.push(...piece.offset);
    batch.centers.push(...piece.center);batch.motions.push(...piece.motion);batch.waves.push(...piece.wave);
  }
  contours.forEach((contour,letter) => {
    const letterNodes = [];
    const mesh = lattice(contour,0.14), input=mesh.attributes.position;
    const key = point => point.map(value=>value.toFixed(4)).join(',');
    for(let i=0;i<input.count;i+=3) {
      const triangle=[0,1,2].map(n=>[input.getX(i+n),input.getY(i+n),input.getZ(i+n)]);
      const piece=pieces[letter][bandAt(triangle.reduce((sum,p)=>sum+p[1],0)/3)];
      for(let vertex=0;vertex<3;vertex++) {
        const a=triangle[vertex],b=triangle[(vertex+1)%3];
        append('veil',a,piece);
        const nodeKey=`${piece.id}:${key(a)}`;
        if(!nodes.has(nodeKey)) {
          nodes.add(nodeKey);append('points',a,piece);letterNodes.push({point:a,piece});
        }
        const edgeKey=`${piece.id}:${[key(a),key(b)].sort().join('|')}`;
        if(!edges.has(edgeKey)) {edges.add(edgeKey);append('lines',a,piece);append('lines',b,piece);}
      }
    }
    mesh.dispose();nodeSets.push(letterNodes);
    // Split contours at fragment boundaries so outlines travel with their pieces.
    contour.forEach(([x,y],index) => {
      const [nextX,nextY]=contour[(index+1)%contour.length],cuts=[0,1];
      if(nextY!==y)for(let band=1;band<6;band++) {
        const t=(-1.15+band*2.3/6-y)/(nextY-y);
        if(t>0&&t<1)cuts.push(t);
      }
      cuts.sort((a,b)=>a-b);
      for(let i=0;i<cuts.length-1;i++) {
        const start=cuts[i],end=cuts[i+1];
        const piece=pieces[letter][bandAt(y+(nextY-y)*(start+end)/2)];
        append('outlines',[x+(nextX-x)*start,y+(nextY-y)*start,0],piece);
        append('outlines',[x+(nextX-x)*end,y+(nextY-y)*end,0],piece);
      }
    });
  });
  const hEdge=nodeSets[0].filter(({point})=>point[0]>-0.5).sort((a,b)=>a.point[1]-b.point[1]);
  const zEdge=nodeSets[1].filter(({point})=>point[0]<0.5);
  for(let i=0;i<hEdge.length;i+=4) {
    const start=hEdge[i];let nearest,distance=Infinity;
    for(const end of zEdge) {
      const candidate=Math.hypot(start.point[0]-end.point[0],start.point[1]-end.point[1]);
      if(candidate<distance){nearest=end;distance=candidate;}
    }
    if(nearest&&distance<0.75) {
      append('bridges',start.point,start.piece);append('bridges',nearest.point,nearest.piece);
    }
  }
  return Object.fromEntries(Object.entries(batches).map(([name,batch]) => [name,
    geometry(batch.positions)
      .setAttribute('pieceOffset',new THREE.Float32BufferAttribute(batch.offsets,3))
      .setAttribute('pieceCenter',new THREE.Float32BufferAttribute(batch.centers,2))
      .setAttribute('pieceMotion',new THREE.Float32BufferAttribute(batch.motions,2))
      .setAttribute('pieceWave',new THREE.Float32BufferAttribute(batch.waves,4)),
  ]));
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
