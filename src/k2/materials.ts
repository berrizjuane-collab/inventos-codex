import * as THREE from 'three';
/** Shared, geographically registered textures in every quality profile. */
export function mountainMaterial(albedo:THREE.Texture,normal:THREE.Texture,grain:THREE.Texture,death:THREE.IUniform<number>,low=false) {
  albedo.colorSpace=THREE.SRGBColorSpace; normal.colorSpace=THREE.NoColorSpace;
  for(const t of [albedo,normal]) {t.anisotropy=4;t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;}
  grain.colorSpace=THREE.NoColorSpace;grain.wrapS=grain.wrapT=THREE.RepeatWrapping;grain.anisotropy=4;
  const options={map:albedo,normalMap:normal,normalMapType:THREE.ObjectSpaceNormalMap,color:0xffffff};
  const material=low?new THREE.MeshLambertMaterial({map:albedo,color:0xffffff}):new THREE.MeshStandardMaterial({...options,roughness:.94,metalness:0});
  material.onBeforeCompile=shader=>{
    shader.uniforms.deathEnabled=death;
    if(low) {
      // The registered albedo already contains strata, cracks and snow detail.
      // Keep that visible without three extra grain samples per pixel on Auto's
      // smallest devices. Higher profiles add per-pixel normals and triplanar grain.
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float atlasAltitude;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\natlasAltitude=transformed.y+4500.;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float atlasAltitude;uniform float deathEnabled;')
        .replace('#include <color_fragment>',`#include <color_fragment>
          float extreme=smoothstep(7998.,8005.,atlasAltitude)*deathEnabled;
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.63,.35,.32),extreme*.20);
          float contour=(1.-smoothstep(2.,12.,abs(atlasAltitude-8000.)))*deathEnabled;
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.75,.38,.33),contour*.6);`);
      return;
    }
    shader.uniforms.rockGrain={value:grain};
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float atlasAltitude; varying vec3 atlasPosition,atlasNormal;')
      .replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\natlasNormal=objectNormal;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\natlasAltitude=transformed.y+4500.;atlasPosition=transformed;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float atlasAltitude; varying vec3 atlasPosition,atlasNormal;\nuniform float deathEnabled;uniform sampler2D rockGrain;')
      .replace('#include <color_fragment>',`#include <color_fragment>
        vec3 atlasWeights=pow(abs(normalize(atlasNormal)),vec3(4.));
        atlasWeights/=max(dot(atlasWeights,vec3(1.)),.0001);
        float atlasGrain=texture2D(rockGrain,atlasPosition.yz/128.).r*atlasWeights.x
          +texture2D(rockGrain,atlasPosition.xz/128.).r*atlasWeights.y
          +texture2D(rockGrain,atlasPosition.xy/128.).r*atlasWeights.z;
        float atlasRock=1.-smoothstep(.17,.43,dot(diffuseColor.rgb,vec3(.333)));
        diffuseColor.rgb*=1.+(atlasGrain-.5)*mix(.10,.95,atlasRock);
        float extreme=smoothstep(7998.,8005.,atlasAltitude)*deathEnabled;
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.63,.35,.32),extreme*.20);
        float contour=(1.-smoothstep(2.,12.,abs(atlasAltitude-8000.)))*deathEnabled;
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.75,.38,.33),contour*.6);`)
      .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
        vec2 atlasGradient=vec2(dFdx(atlasGrain),dFdy(atlasGrain));
        vec3 atlasDx=dFdx(vViewPosition),atlasDy=dFdy(vViewPosition);
        vec3 atlasR1=cross(atlasDy,normal),atlasR2=cross(normal,atlasDx);
        float atlasDet=dot(atlasDx,atlasR1);
        vec3 atlasSurfaceGradient=sign(atlasDet)*(atlasGradient.x*atlasR1+atlasGradient.y*atlasR2);
        normal=normalize(abs(atlasDet)*normal-atlasSurfaceGradient*mix(.06,.65,atlasRock));`);
  };
  material.customProgramCacheKey=()=> low?'k2-textured-diffuse-4':'k2-textured-relief-3';
  return material;
}
export function createSerac(field:{sample:(x:number,z:number)=>number},position:readonly number[],grain:THREE.Texture) {
  const group=new THREE.Group(),boxes:THREE.Box3[]=[];
  const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.86,metalness:0,side:THREE.DoubleSide});
  material.onBeforeCompile=shader=>{
    shader.uniforms.iceGrain={value:grain};
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 icePosition;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nicePosition=transformed;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 icePosition;uniform sampler2D iceGrain;')
      .replace('#include <color_fragment>',`#include <color_fragment>
        float iceDetail=texture2D(iceGrain,icePosition.xy/48.).r;
        float vein=pow(.5+.5*sin(icePosition.x*.23+icePosition.y*.017+iceDetail*3.),18.);
        vec3 iceColor=mix(vec3(.36,.54,.65),vec3(.72,.82,.87),.28+iceDetail*.66);
        iceColor*=1.-vein*.20;
        diffuseColor.rgb*=iceColor;`);
  };
  material.customProgramCacheKey=()=> 'k2-reconstructed-ice-2';
  const geometry=new THREE.BufferGeometry(),vertices:number[]=[],indices:number[]=[],fractures:number[]=[];
  // An eroded front, recessed base and overhanging lip form one closed volume.
  const sections=24;
  for(let i=0;i<=sections;i++) {
    const t=i/sections,x=position[0]+(t-.5)*190,z=position[2]+(t-.5)**2*65-13;
    const front=z+24,back=z-28,ground=field.sample(x,front)-3;
    const rearGround=field.sample(x,back)-3;
    const top=Math.max(ground+72,rearGround+16)+5*Math.sin(i*.91)+3*Math.sin(i*2.37);
    const span=top-ground;
    vertices.push(x,ground,front, x,ground+span*.38,front+5,
      x,ground+span*.77,front+13+Math.sin(i*.72)*3,
      x,top,front+23+Math.sin(i*.51)*4, x,top+3,back, x,rearGround,back);
    if(i<sections){const a=i*6,b=a+6;
      for(let edge=0;edge<5;edge++)indices.push(a+edge,b+edge,a+edge+1,b+edge,b+edge+1,a+edge+1);}
    if(i===0||i===sections){const a=i*6;for(let edge=1;edge<5;edge++)
      if(i===0)indices.push(a,a+edge+1,a+edge);else indices.push(a,a+edge,a+edge+1);}
    if(i>0&&i<sections&&i%3===0)fractures.push(x,top-2,front+25,x+2,ground+span*.78,front+16,x+2,ground+span*.78,front+16,x-1,ground+span*.42,front+8);
    boxes.push(new THREE.Box3(new THREE.Vector3(x-7,ground,z-32),new THREE.Vector3(x+7,top+10,front+29)));
  }
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;group.add(mesh);
  const cracksGeometry=new THREE.BufferGeometry();cracksGeometry.setAttribute('position',new THREE.Float32BufferAttribute(fractures,3));
  group.add(new THREE.LineSegments(cracksGeometry,new THREE.LineBasicMaterial({color:0x526f81,transparent:true,opacity:.35})));
  return {group,boxes};
}
