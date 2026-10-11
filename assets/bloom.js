import * as THREE from './vendor/three/three.module.min.js';

// Three fullscreen passes, with both blur passes at one third resolution.
// No HDR textures, mip-chain bloom, external assets, or extra WebGL contexts.
export function createBloom(renderer) {
  const base=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false});
  base.samples=Math.min(2,renderer.capabilities.maxSamples);
  const horizontal=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false});
  const vertical=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false});
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2));
  quad.frustumCulled=false;scene.add(quad);
  const vertexShader='varying vec2 uvPosition;void main(){uvPosition=uv;gl_Position=vec4(position.xy,0.0,1.0);}';
  const blur=new THREE.ShaderMaterial({
    uniforms:{source:{value:null},step:{value:new THREE.Vector2()},extract:{value:1}},
    vertexShader,
    fragmentShader:`
      uniform sampler2D source;
      uniform vec2 step;
      uniform float extract;
      varying vec2 uvPosition;
      vec3 sampleLight(vec2 uv) {
        vec3 color=texture2D(source,uv).rgb;
        float light=max(max(color.r,color.g),color.b);
        return color*mix(1.0,smoothstep(0.18,0.65,light),extract);
      }
      void main() {
        vec3 color=sampleLight(uvPosition)*0.227027;
        color+=(sampleLight(uvPosition+step*1.384615)+sampleLight(uvPosition-step*1.384615))*0.316216;
        color+=(sampleLight(uvPosition+step*3.230769)+sampleLight(uvPosition-step*3.230769))*0.070270;
        gl_FragColor=vec4(color,1.0);
      }`,
    depthTest:false,depthWrite:false,
  });
  const combine=new THREE.ShaderMaterial({
    uniforms:{base:{value:base.texture},glow:{value:vertical.texture},strength:{value:0.42}},
    vertexShader,
    fragmentShader:`
      uniform sampler2D base;
      uniform sampler2D glow;
      uniform float strength;
      varying vec2 uvPosition;
      void main() {
        vec4 color=texture2D(base,uvPosition);
        vec3 halo=texture2D(glow,uvPosition).rgb*strength;
        // The transparent scene is premultiplied. Convert straight RGB to sRGB,
        // then premultiply again so faint lines do not brighten in the composite.
        float alpha=min(1.0,color.a+max(max(halo.r,halo.g),halo.b));
        gl_FragColor=vec4((color.rgb+halo)/max(alpha,0.0001),alpha);
        #include <colorspace_fragment>
        gl_FragColor.rgb*=alpha;
      }`,
    depthTest:false,depthWrite:false,
  });
  return {
    resize(width,height) {
      base.setSize(width,height);
      horizontal.setSize(Math.max(1,Math.round(width/3)),Math.max(1,Math.round(height/3)));
      vertical.setSize(horizontal.width,horizontal.height);
    },
    render(content,view) {
      renderer.setRenderTarget(base);renderer.render(content,view);
      quad.material=blur;
      blur.uniforms.source.value=base.texture;
      blur.uniforms.step.value.set(1/horizontal.width,0);blur.uniforms.extract.value=1;
      renderer.setRenderTarget(horizontal);renderer.render(scene,camera);
      blur.uniforms.source.value=horizontal.texture;
      blur.uniforms.step.value.set(0,1/vertical.height);blur.uniforms.extract.value=0;
      renderer.setRenderTarget(vertical);renderer.render(scene,camera);
      quad.material=combine;
      renderer.setRenderTarget(null);renderer.render(scene,camera);
    },
    dispose() {
      base.dispose();horizontal.dispose();vertical.dispose();
      quad.geometry.dispose();blur.dispose();combine.dispose();
    },
  };
}
