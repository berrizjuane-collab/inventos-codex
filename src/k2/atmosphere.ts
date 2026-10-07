import * as THREE from 'three';

/** A view-dependent clear mountain sky, with authored distant cloud volumes. */
export function createAtmosphere(cloudTexture:THREE.Texture) {
  const skyMaterial=new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,depthTest:false,toneMapped:false,
    uniforms:{horizon:{value:new THREE.Color(0xa1bbcc)},zenith:{value:new THREE.Color(0x214e78)},
      sunDirection:{value:new THREE.Vector3(-.66,.52,.4).normalize()},warmth:{value:new THREE.Color(0xe1d9c5)}},
    vertexShader:'varying vec3 skyDirection; void main(){skyDirection=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 skyDirection;
      uniform vec3 horizon,zenith,sunDirection,warmth;
      void main(){
        vec3 direction=normalize(skyDirection);
        float elevation=pow(clamp(direction.y,0.,1.),.38);
        vec3 color=mix(horizon,zenith,elevation);
        float glow=pow(max(dot(direction,sunDirection),0.),18.);
        color=mix(color,warmth,glow*.15);
        gl_FragColor=vec4(color,1.);
        #include <colorspace_fragment>
      }`
  });
  const sky=new THREE.Mesh(new THREE.SphereGeometry(32000,32,20),skyMaterial);
  sky.frustumCulled=false;sky.renderOrder=-1000;
  cloudTexture.colorSpace=THREE.SRGBColorSpace;cloudTexture.anisotropy=2;
  const clouds=new THREE.Group();
  const locations=[
    [-9500,4900,-14000,10000,3100,.58], [7700,5200,-17000,12500,3300,.44],
    [-15500,4550,4200,11000,3000,.43], [16000,4750,3000,10500,2800,.48],
    [-6000,5100,17000,12500,3200,.40]
  ];
  const cloudMaterials:THREE.SpriteMaterial[]=[];
  for(const [x,y,z,w,h,opacity] of locations) {
    const material=new THREE.SpriteMaterial({map:cloudTexture,transparent:true,opacity,
      depthTest:true,depthWrite:false,alphaTest:.004,toneMapped:false,fog:false});
    cloudMaterials.push(material);
    const cloud=new THREE.Sprite(material);cloud.position.set(x,y,z);cloud.scale.set(w,h,1);
    cloud.renderOrder=-10;clouds.add(cloud);
  }
  const update=(camera:THREE.Camera,evening:boolean,visible:boolean)=>{
    sky.position.copy(camera.position);clouds.visible=visible;
    skyMaterial.uniforms.horizon.value.set(evening?0xc4b7aa:0xa1bbcc);
    skyMaterial.uniforms.zenith.value.set(evening?0x38596e:0x214e78);
    cloudMaterials.forEach(m=>m.color.set(evening?0xefd9c4:0xffffff));
  };
  return {sky,clouds,update};
}
