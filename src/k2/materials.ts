import * as THREE from 'three';
export function lowMountainMaterial(death:THREE.IUniform<number>) {
  const material=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true});
  material.onBeforeCompile=shader=>{
    shader.uniforms.deathEnabled=death;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float atlasAltitude;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\natlasAltitude=transformed.y+4500.;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float atlasAltitude;\nuniform float deathEnabled;')
      .replace('#include <color_fragment>','#include <color_fragment>\nfloat extreme=smoothstep(7998.,8005.,atlasAltitude)*deathEnabled;\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(.63,.35,.32),extreme*.23);\nfloat contour=(1.-smoothstep(2.,12.,abs(atlasAltitude-8000.)))*deathEnabled;\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(.75,.38,.33),contour*.6);');
  };
  material.customProgramCacheKey=()=> 'k2-low-diffuse-1';
  return material;
}
export function mountainMaterial(detail:THREE.Texture,death:THREE.IUniform<number>) {
  detail.colorSpace=THREE.NoColorSpace;detail.wrapS=detail.wrapT=THREE.RepeatWrapping;detail.anisotropy=2;
  const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.96,metalness:0});
  material.onBeforeCompile=shader=>{
    shader.uniforms.deathEnabled=death;shader.uniforms.rockDetail={value:detail};
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 atlasPosition;\nvarying vec3 atlasNormal;')
      .replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\natlasNormal = normalize(objectNormal);')
      .replace('#include <begin_vertex>','#include <begin_vertex>\natlasPosition = transformed;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',[
      '#include <common>',
      'varying vec3 atlasPosition; varying vec3 atlasNormal; uniform float deathEnabled; uniform sampler2D rockDetail;',
      'float atlasHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }',
      'float atlasNoise(vec2 p) { vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);',
      'return mix(mix(atlasHash(i),atlasHash(i+vec2(1.,0.)),f.x),mix(atlasHash(i+vec2(0.,1.)),atlasHash(i+vec2(1.)),f.x),f.y); }'
    ].join('\n'));
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',[
      '#include <color_fragment>',
      'vec3 p=atlasPosition; vec3 n=normalize(atlasNormal); float altitude=p.y+4500.;',
      'float large=atlasNoise(p.xz*.004), fine=atlasNoise(p.xz*.024);',
      'float strata=.5+.5*sin(p.y*.068+p.x*.009+large*3.);',
      'vec3 weights=pow(abs(n),vec3(4.)); weights/=max(dot(weights,vec3(1.)),.0001);',
      'float grain=texture2D(rockDetail,p.yz/220.).r*weights.x+texture2D(rockDetail,p.xz/220.).r*weights.y+texture2D(rockDetail,p.xy/220.).r*weights.z;',
      'vec3 stone=mix(vec3(.15,.17,.185),vec3(.29,.285,.27),large*.55+fine*.20); stone*=.88+.05*strata+.17*grain;',
      'float couloir=pow(max(0.,sin(p.x*.025+p.z*.015+large*4.)),16.)*.27;',
      'float snow=smoothstep(.52,.85,n.y+(fine-.5)*.14-n.z*.05)+couloir;',
      'snow=max(clamp(snow,0.,1.),smoothstep(8150.,8580.,altitude)*.88);',
      'snow*=smoothstep(5100.,5650.,altitude);',
      'float valley=abs(p.x-(3300.-p.z*.63));',
      'float glacier=(1.-smoothstep(400.,1000.,valley))*(1.-smoothstep(5300.,5850.,altitude))*smoothstep(.40,.70,n.y); snow=max(snow,glacier*.9);',
      'vec3 ice=mix(vec3(.62,.70,.76),vec3(.81,.855,.89),fine*.45+grain*.45); vec3 albedo=mix(stone,ice,snow);',
      'float moraine=(.5+.5*sin(p.x*.036+p.z*.026+large*2.))*glacier; albedo=mix(albedo,stone,moraine*.20);',
      'float extreme=smoothstep(7998.,8005.,altitude)*deathEnabled; albedo=mix(albedo,vec3(.63,.35,.32),extreme*.23);',
      'float contour=(1.-smoothstep(2.,12.,abs(altitude-8000.)))*deathEnabled; albedo=mix(albedo,vec3(.75,.38,.33),contour*.60);',
      'diffuseColor.rgb*=albedo;'
    ].join('\n'));
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>', [
      '#include <normal_fragment_maps>',
      'vec2 atlasGradient=vec2(dFdx(grain),dFdy(grain));',
      'vec3 atlasDx=dFdx(vViewPosition),atlasDy=dFdy(vViewPosition);',
      'vec3 atlasR1=cross(atlasDy,normal),atlasR2=cross(normal,atlasDx);',
      'float atlasDet=dot(atlasDx,atlasR1);',
      'vec3 atlasSurfaceGradient=sign(atlasDet)*(atlasGradient.x*atlasR1+atlasGradient.y*atlasR2);',
      'normal=normalize(abs(atlasDet)*normal-atlasSurfaceGradient*mix(.28,.045,snow));'
    ].join('\n'));
  };
  material.customProgramCacheKey=()=> 'k2-atlas-material-1';
  return material;
}
export function createSerac(field:{sample:(x:number,z:number)=>number},position:readonly number[]) {
  const group=new THREE.Group(),boxes:THREE.Box3[]=[];
  const material=new THREE.MeshStandardMaterial({color:0x9fbfcd,roughness:.92,metalness:0,side:THREE.DoubleSide});
  const geometry=new THREE.BufferGeometry(),vertices:number[]=[],indices:number[]=[],fractures:number[]=[];
  // One continuous reconstructed ice wall with a modest overhanging lip.
  for(let i=0;i<=12;i++) {
    const x=position[0]+(i-6)*15,z=position[2]+Math.pow(i-6,2)*1.1-13,ground=field.sample(x,z+20);
    const top=Math.max(ground+62+5*Math.sin(i*2.1),field.sample(x,z-28)+8);
    vertices.push(x,ground+1,z+20, x,top,z+37+3*Math.sin(i), x,top+6,z-28, x,field.sample(x,z-28),z-28);
    if(i<12){const a=i*4,b=a+4;
      indices.push(a,b,a+1,b,b+1,a+1,a+1,b+1,a+2,b+1,b+2,a+2,a+2,b+2,a+3,b+2,b+3,a+3);}
    if(i>0&&i<12&&i%2===0)fractures.push(x,top-2,z+39,x+3,ground+18,z+26);
    boxes.push(new THREE.Box3(new THREE.Vector3(x-10,ground,z-32),new THREE.Vector3(x+10,top+10,z+45)));
  }
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;group.add(mesh);
  const cracksGeometry=new THREE.BufferGeometry();cracksGeometry.setAttribute('position',new THREE.Float32BufferAttribute(fractures,3));
  group.add(new THREE.LineSegments(cracksGeometry,new THREE.LineBasicMaterial({color:0x526f81,transparent:true,opacity:.35})));
  return {group,boxes};
}
