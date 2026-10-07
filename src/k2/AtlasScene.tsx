import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {Line2} from 'three/examples/jsm/lines/Line2.js';
import {LineGeometry} from 'three/examples/jsm/lines/LineGeometry.js';
import {LineMaterial} from 'three/examples/jsm/lines/LineMaterial.js';
import {Heightfield} from './terrain';
import {constrainCamera,CAMERA_LIMITS,PRESETS} from './camera';
import {BUDGETS,AutoQuality,effectiveDpr,requestedProfile} from './quality';
import {mountainMaterial,lowMountainMaterial,createSerac} from './materials';
import type {AtlasData,Poi,Profile,SceneSettings,TerrainMeta,ViewId} from './types';
import {formatAltitude} from './types';
export interface AtlasHandle { view:(id:ViewId)=>void; focus:(point:Poi)=>void; zoom:(factor:number)=>void; info:()=>unknown; }
interface Props {data:AtlasData;settings:SceneSettings;onSelect:(id:string)=>void;onView:(id:ViewId|null)=>void;onReady:(ready:boolean)=>void;}
interface Runtime { apply:(s:SceneSettings)=>void;view:(id:ViewId,point?:Poi)=>void;zoom:(factor:number)=>void;info:()=>unknown; }
const asset=(p:string)=>import.meta.env.BASE_URL+'k2/'+p;
const profiles:Profile[]=['low','medium','high'];
export const AtlasScene=forwardRef<AtlasHandle,Props>(function AtlasScene({data,settings,onSelect,onView,onReady},ref){
  const container=useRef<HTMLDivElement>(null),runtime=useRef<Runtime|null>(null),markerRefs=useRef(new Map<string,HTMLButtonElement>());
  const callbacks=useRef({onSelect,onView,onReady});callbacks.current={onSelect,onView,onReady};
  const settingsRef=useRef(settings);settingsRef.current=settings;
  const [status,setStatus]=useState('Cargando el relieve…'),[error,setError]=useState<string|null>(null),[attempt,setAttempt]=useState(0),[compass,setCompass]=useState(0);
  useImperativeHandle(ref,()=>({view:id=>runtime.current?.view(id),focus:p=>runtime.current?.view(p.view,p),
    zoom:f=>runtime.current?.zoom(f),info:()=>runtime.current?.info()}),[]);
  useEffect(()=>runtime.current?.apply(settings),[settings]);
  useEffect(()=>{
    const host=container.current!;
    let cancelled=false,frame=0,disposed=false,renderer:THREE.WebGLRenderer|undefined,controls:OrbitControls|undefined;
    let observer:ResizeObserver|undefined,scene:THREE.Scene|undefined;
    const abort=new AbortController();
    let cleanupExtra=()=>{};
    setError(null);setStatus('Cargando el relieve…');callbacks.current.onReady(false);
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
    const disposeTree=(object:THREE.Object3D)=>object.traverse(o=>{
      const mesh=o as THREE.Mesh;if(mesh.geometry)geometries.add(mesh.geometry);
      if(mesh.material)(Array.isArray(mesh.material)?mesh.material:[mesh.material]).forEach(m=>materials.add(m));
    });
    const fail=(message:string)=>{if(!cancelled){setError(message);setStatus('');callbacks.current.onReady(false);}};
    const init=async()=>{
      try{
        if(new URLSearchParams(location.search).has('no-webgl'))throw new Error('WebGL2 no disponible.');
        renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',alpha:false});
      }catch{fail('No se pudo iniciar WebGL2. La lista de puntos y las fuentes siguen disponibles.');return;}
      renderer.domElement.className='atlas-canvas';renderer.domElement.setAttribute('aria-hidden','true');
      host.prepend(renderer.domElement);renderer.outputColorSpace=THREE.SRGBColorSpace;
      renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.03;
      renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
      const rr=renderer;
      try{
        const [metaResponse,heightsResponse]=await Promise.all([fetch(asset('terrain.json'),{signal:abort.signal}),fetch(asset('heights.bin'),{signal:abort.signal})]);
        if(!metaResponse.ok||!heightsResponse.ok)throw new Error('No se pudo descargar el relieve local.');
        const meta:TerrainMeta=await metaResponse.json(),raw=await heightsResponse.arrayBuffer();
        if(cancelled)return;
        const field=new Heightfield(meta,new Uint16Array(raw));
        setStatus('Preparando la geometría…');
        const loader=new GLTFLoader(),first=await loader.loadAsync(asset('terrain-low.glb'));
        if(cancelled){disposeTree(first.scene);return;}
        scene=new THREE.Scene();const ss=scene;
        ss.background=new THREE.Color(0x132431);ss.fog=new THREE.FogExp2(0x132431,.000029);
        const camera=new THREE.PerspectiveCamera(39,1,10,40000);
        controls=new OrbitControls(camera,rr.domElement);const cc=controls;
        cc.enableDamping=true;cc.dampingFactor=.085;cc.rotateSpeed=.6;cc.zoomSpeed=.68;cc.panSpeed=.5;
        cc.minDistance=CAMERA_LIMITS.minDistance;cc.maxDistance=CAMERA_LIMITS.maxDistance;
        cc.minPolarAngle=CAMERA_LIMITS.minPolar;cc.maxPolarAngle=CAMERA_LIMITS.maxPolar;
        camera.position.set(...PRESETS.general.position);cc.target.set(...PRESETS.general.target);
        const hemisphere=new THREE.HemisphereLight(0xaecbdd,0x222b34,.75);ss.add(hemisphere);
        const sun=new THREE.DirectionalLight(0xffe8ce,2.7);sun.position.set(-6500,10000,4700);
        sun.target.position.set(0,1800,0);ss.add(sun,sun.target);
        sun.shadow.camera.left=-4200;sun.shadow.camera.right=4200;sun.shadow.camera.top=4200;sun.shadow.camera.bottom=-4200;
        sun.shadow.camera.near=100;sun.shadow.camera.far=22000;sun.shadow.normalBias=7;sun.shadow.bias=-.00015;
        const death={value:settingsRef.current.layers.death?1:0};
        const detail=await new THREE.TextureLoader().loadAsync(asset('rock-detail.png'));
        textures.add(detail);if(cancelled){disposeTree(first.scene);return;}
        const material=mountainMaterial(detail,death),lowMaterial=lowMountainMaterial(death);materials.add(material);materials.add(lowMaterial);
        const terrain:Partial<Record<Profile,THREE.Object3D>>={low:first.scene};
        const prepare=(obj:THREE.Object3D,profile:Profile)=>{
          disposeTree(obj);obj.traverse(o=>{if(o instanceof THREE.Mesh){o.material=profile==='low'?lowMaterial:material;o.receiveShadow=true;o.castShadow=true;}});
          ss.add(obj);obj.visible=false;
        };
        prepare(first.scene,'low');first.scene.visible=true;
        const loading=new Set<Profile>(),ready=new Set<Profile>(['low']);
        let active:Profile='low',desired:Profile='low';
        const auto=new AutoQuality(navigator.hardwareConcurrency||4,(navigator as Navigator&{deviceMemory?:number}).deviceMemory||8,innerWidth*innerHeight*devicePixelRatio);
        let currentSettings=settingsRef.current,width=1,height=1,rendered=0,terrainBuilds=1,lastFrame=0,lastLabels=0,lastCompass=0;
        let renderTimes:number[]=[],intervals:number[]=[];
        let transition:null|{start:number;duration:number;fromTarget:THREE.Vector3;toTarget:THREE.Vector3;from:THREE.Spherical;to:THREE.Spherical}=null;
        let visible=!document.hidden,contextLost=false,hiddenAt=0;
        const ice=createSerac(field,data.points.find(p=>p.id==='serac')!.position);ss.add(ice.group);disposeTree(ice.group);
        const lines=data.segments.map(segment=>{
          const geometry=new LineGeometry();geometries.add(geometry);
          const lm=new LineMaterial({color:segment.shared?0xe7eff2:segment.id==='cesen'?0xe8b86d:0x78d1e2,linewidth:3,worldUnits:false,
            dashed:segment.id==='cesen',dashSize:75,gapSize:45,depthTest:true,depthWrite:false,transparent:true,opacity:.94});
          lm.resolution.set(width,height);materials.add(lm);
          const line=new Line2(geometry,lm);line.userData.segment=segment;line.renderOrder=2;ss.add(line);return line;
        });
        const updateLines=()=>{
          for(const line of lines){
            const positions:number[]=[];for(const p of (line.userData.segment as AtlasData['segments'][number]).positions)
              positions.push(p[0],field.sample(p[0],p[2],BUDGETS[active].step)+20,p[2]);
            line.geometry.setPositions(positions);line.computeLineDistances();
          }
        };
        const request=()=>{if(!frame&&!disposed&&visible&&!contextLost)frame=requestAnimationFrame(draw);};
        const resize=()=>{
          width=host.clientWidth;height=host.clientHeight;if(!width||!height)return;
          rr.setPixelRatio(effectiveDpr(desired,width,height,devicePixelRatio));rr.setSize(width,height);
          camera.aspect=width/height;camera.fov=width<650?49:39;
          camera.setViewOffset(width,height,width<850?0:-width*.095,0,width,height);camera.updateProjectionMatrix();
          lines.forEach(l=>(l.material as LineMaterial).resolution.set(width,height));request();
        };
        const lodProfile=()=>{
          const quality=requestedProfile(currentSettings.quality,auto),distance=camera.position.distanceTo(cc.target);
          if(distance>(desired==='low'?11800:13000))return 'low' as Profile;
          return quality==='high'&&distance>(desired==='high'?6500:5300)?'medium' as Profile:quality;
        };
        const chooseGeometry=(profile:Profile)=>{
          desired=profile;
          const available=profiles[Math.min(profiles.indexOf(profile),profiles.indexOf(ready.has(profile)?profile:ready.has('medium')?'medium':'low'))];
          if(active!==available){terrain[active]!.visible=false;active=available;terrain[active]!.visible=true;updateLines();rr.shadowMap.needsUpdate=true;}
          const shadows=profile==='high';
          if(rr.shadowMap.enabled!==shadows){rr.shadowMap.enabled=shadows;sun.castShadow=shadows;
            sun.shadow.mapSize.set(1024,1024);rr.shadowMap.needsUpdate=true;material.needsUpdate=true;}
          resize();
          if(!ready.has(profile)&&!loading.has(profile)&&profile!=='low'){
            loading.add(profile);
            loader.loadAsync(asset('terrain-'+profile+'.glb')).then(g=>{
              loading.delete(profile);
              if(cancelled){disposeTree(g.scene);geometries.forEach(x=>x.dispose());materials.forEach(x=>x.dispose());return;}
              prepare(g.scene,profile);terrain[profile]=g.scene;ready.add(profile);terrainBuilds++;apply(currentSettings);request();
            }).catch(()=>{loading.delete(profile);if(!cancelled)setStatus('Detalle adicional no disponible · el relieve básico sigue activo.');});
          }
        };
        const apply=(s:SceneSettings)=>{
          currentSettings=s;death.value=s.layers.death?1:0;
          for(const line of lines){
            const segment=line.userData.segment as AtlasData['segments'][number];
            line.visible=s.layers.routes&&segment.routes.some(id=>s.layers[id]);(line.material as LineMaterial).opacity=.94;
          }
          if(s.light==='evening'){sun.position.set(-7500,5600,3600);sun.color.set(0xf6d2ac);sun.intensity=2.4;hemisphere.intensity=.55;}
          else{sun.position.set(-6500,10000,4700);sun.color.set(0xffe8ce);sun.intensity=2.7;hemisphere.intensity=.75;}
          rr.shadowMap.needsUpdate=true;chooseGeometry(lodProfile());lastLabels=0;request();
        };
        const projectLabels=(now:number)=>{
          const occupied:{x:number;y:number;w:number;h:number}[]=[],selected=currentSettings.selected;
          document.querySelectorAll('.zoom-controls,.view-selector,.point-card,.mountain-identity,.mobile-panel-button,.explore-panel.expanded').forEach(el=>{
            const r=el.getBoundingClientRect();if(r.width&&r.height)occupied.push({x:r.x,y:r.y,w:r.width,h:r.height});
          });
          const sorted=[...data.points].sort((a,b)=>{
            const rank=(p:Poi)=>p.id===selected?100:p.id==='summit'?90:p.id==='bottleneck'?75:p.id==='camp4'?65:p.category==='camp'?45:30;
            return rank(b)-rank(a);
          });
          const cam=camera.position.toArray(),distance=camera.position.distanceTo(cc.target);
          for(const p of sorted){
            const el=markerRefs.current.get(p.id);if(!el)continue;
            let show=p.category==='summit'||p.category==='zone'||p.routes.some(id=>currentSettings.layers[id]);
            if(p.category==='camp'&&!currentSettings.layers.camps)show=false;
            if(p.category==='zone'&&!currentSettings.layers.death)show=false;
            if(distance>6000&&p.category==='landform'&&!['glacier','shoulder','bottleneck'].includes(p.id)&&p.id!==selected)show=false;
            const anchor=new THREE.Vector3(p.position[0],field.sample(p.position[0],p.position[2],BUDGETS[active].step)+(p.id==='serac'?100:40),p.position[2]);
            const point=anchor.clone().project(camera),x=(point.x*.5+.5)*width,y=(-point.y*.5+.5)*height;
            if(point.z>=1||point.z<=-1||x<24||x>width-100||y<92||y>height-(width<650?150:104))show=false;
            if(show&&field.occluded(cam,anchor.toArray()))show=false;
            const labels=currentSettings.layers.labels||p.id===selected,rect={x:x-8,y:y-14,w:labels?Math.min(166,55+p.shortName.length*5):32,h:44};
            if(show&&width>=900&&x<326&&y>95&&y<height-75)show=false;
            if(show&&occupied.some(r=>rect.x<r.x+r.w+8&&rect.x+rect.w+8>r.x&&rect.y<r.y+r.h&&rect.y+rect.h>r.y))show=false;
            el.style.visibility=show?'visible':'hidden';el.style.pointerEvents=show?'auto':'none';
            el.style.transform='translate('+Math.round(x)+'px,'+Math.round(y)+'px)';el.classList.toggle('marker-minimal',!labels);
            if(show)occupied.push(rect);
          }
          lastLabels=now;
        };
        const previous=camera.position.clone();
        const draw=(now:number)=>{
          frame=0;if(disposed||!visible||contextLost)return;
          if(transition){
            const t=Math.min(1,(now-transition.start)/transition.duration),smooth=t*t*(3-2*t);
            cc.target.copy(transition.fromTarget).lerp(transition.toTarget,smooth);
            const s=new THREE.Spherical(THREE.MathUtils.lerp(transition.from.radius,transition.to.radius,smooth),
              THREE.MathUtils.lerp(transition.from.phi,transition.to.phi,smooth),THREE.MathUtils.lerp(transition.from.theta,transition.to.theta,smooth));
            camera.position.copy(cc.target).add(new THREE.Vector3().setFromSpherical(s));if(t>=1)transition=null;
          }
          const changed=cc.update();constrainCamera(camera.position,cc.target,field,previous,ice.boxes);
          camera.lookAt(cc.target);previous.copy(camera.position);
          const begin=performance.now();rr.render(ss,camera);const ms=performance.now()-begin;
          rendered++;renderTimes.push(ms);if(renderTimes.length>12000)renderTimes.shift();
          if(lastFrame&&now-lastFrame<2000&&(changed||transition)){
            intervals.push(now-lastFrame);if(intervals.length>12000)intervals.shift();
            if(currentSettings.quality==='auto'){const before=auto.profile;auto.measure(now-lastFrame,now);if(before!==auto.profile)apply(currentSettings);}
          }
          lastFrame=now;
          if(now-lastLabels>120||!changed&&!transition){if(desired!==lodProfile())chooseGeometry(lodProfile());projectLabels(now);}
          if(now-lastCompass>180){setCompass(Math.atan2(camera.position.x-cc.target.x,camera.position.z-cc.target.z)*180/Math.PI);lastCompass=now;}
          if(transition||changed)request();
        };
        const view=(id:ViewId,point?:Poi)=>{
          cc.update();callbacks.current.onView(id);
          const preset=PRESETS[id],toTarget=new THREE.Vector3(...preset.target),end=new THREE.Vector3(...preset.position);
          if(point){const base=new THREE.Vector3(...point.position);toTarget.copy(base).add(new THREE.Vector3(0,55,0));
            const direction=end.clone().sub(new THREE.Vector3(...preset.target)).normalize();
            end.copy(toTarget).add(direction.multiplyScalar(point.category==='camp'?2200:point.id==='glacier'?6000:1500));}
          constrainCamera(end,toTarget,field,undefined,ice.boxes);
          const from=new THREE.Spherical().setFromVector3(camera.position.clone().sub(cc.target)),to=new THREE.Spherical().setFromVector3(end.clone().sub(toTarget));
          while(to.theta-from.theta>Math.PI)to.theta-=Math.PI*2;while(to.theta-from.theta< -Math.PI)to.theta+=Math.PI*2;
          if(matchMedia('(prefers-reduced-motion: reduce)').matches){
            transition=null;camera.position.copy(end);cc.target.copy(toTarget);constrainCamera(camera.position,cc.target,field,previous,ice.boxes);previous.copy(camera.position);
          }else transition={start:performance.now(),duration:950,fromTarget:cc.target.clone(),toTarget,from,to};
          apply(currentSettings);request();
        };
        const quantile=(a:number[],q:number)=>{const sorted=[...a].sort((a,b)=>a-b);return sorted.length?sorted[Math.floor((sorted.length-1)*q)]:null;};
        const info=()=>({
          profile:desired,geometryProfile:active,loadedLevels:[...ready],terrainBuilds,dpr:rr.getPixelRatio(),width,height,
          resolution:[Math.round(width*rr.getPixelRatio()),Math.round(height*rr.getPixelRatio())],
          frames:rendered,drawCalls:rr.info.render.calls,triangles:rr.info.render.triangles,
          geometries:rr.info.memory.geometries,textures:rr.info.memory.textures,programs:rr.info.programs?.length,
          camera:{position:camera.position.toArray(),target:cc.target.toArray(),distance:camera.position.distanceTo(cc.target),
            clearance:field.contains(camera.position.x,camera.position.z)?camera.position.y-field.sample(camera.position.x,camera.position.z):null},
          renderCpuMs:{median:quantile(renderTimes,.5),p95:quantile(renderTimes,.95),samples:renderTimes.length},
          frameIntervalMs:{median:quantile(intervals,.5),p95:quantile(intervals,.95),samples:intervals.length},
          measurementNote:'Intervalos RAF durante movimiento. renderCpuMs es envío CPU, no tiempo GPU. Conteos no equivalen a memoria GPU.',
          estimatedTextureMiB:rr.shadowMap.enabled?8.34:.34,selected:currentSettings.selected,layers:{...currentSettings.layers},transition:!!transition
        });
        runtime.current={apply,view,zoom:factor=>{transition=null;camera.position.sub(cc.target).multiplyScalar(factor).add(cc.target);
          constrainCamera(camera.position,cc.target,field,previous,ice.boxes);apply(currentSettings);request();},info};
        const api={info,view,focus:(id:string)=>{const p=data.points.find(p=>p.id===id);if(p)view(p.view,p);},
          sampleHeight:(x:number,z:number)=>field.sample(x,z),orbit:(radians:number)=>{
            transition=null;const s=new THREE.Spherical().setFromVector3(camera.position.clone().sub(cc.target));s.theta+=radians;
            camera.position.copy(cc.target).add(new THREE.Vector3().setFromSpherical(s));constrainCamera(camera.position,cc.target,field,previous,ice.boxes);request();},
          clearMetrics:()=>{renderTimes=[];intervals=[];lastFrame=0;}
        };
        (window as unknown as {__K2?:typeof api}).__K2=api;
        const controlStart=()=>{transition=null;callbacks.current.onView(null);request();};
        cc.addEventListener('start',controlStart);cc.addEventListener('change',request);
        const lost=(e:Event)=>{e.preventDefault();contextLost=true;cancelAnimationFrame(frame);frame=0;
          fail('Se perdió el contexto gráfico. Puedes reintentar; las rutas y selecciones se conservarán.');};
        const restored=()=>{if(cancelled)return;contextLost=false;setError(null);callbacks.current.onReady(true);rr.shadowMap.needsUpdate=true;request();};
        rr.domElement.addEventListener('webglcontextlost',lost);rr.domElement.addEventListener('webglcontextrestored',restored);
        const visibility=()=>{
          visible=!document.hidden;lastFrame=0;
          if(!visible){hiddenAt=performance.now();cancelAnimationFrame(frame);frame=0;}
          else{if(transition&&hiddenAt)transition.start+=performance.now()-hiddenAt;hiddenAt=0;request();}
        };
        document.addEventListener('visibilitychange',visibility);
        const key=(e:KeyboardEvent)=>{
          if(e.target!==host)return;
          if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(e.key))e.preventDefault();else return;
          transition=null;
          if(e.key==='Home')view('general');else if(['+','=','-'].includes(e.key))runtime.current?.zoom(e.key==='-'?1.12:.88);
          else{const s=new THREE.Spherical().setFromVector3(camera.position.clone().sub(cc.target));
            if(e.shiftKey){const d=new THREE.Vector3(e.key==='ArrowLeft'?-90:e.key==='ArrowRight'?90:0,0,e.key==='ArrowUp'?-90:e.key==='ArrowDown'?90:0);cc.target.add(d);camera.position.add(d);}
            else{s.theta+=(e.key==='ArrowLeft'?-.06:e.key==='ArrowRight'?.06:0);
              s.phi=Math.max(CAMERA_LIMITS.minPolar,Math.min(CAMERA_LIMITS.maxPolar,s.phi+(e.key==='ArrowUp'?-.035:e.key==='ArrowDown'?.035:0)));
              camera.position.copy(cc.target).add(new THREE.Vector3().setFromSpherical(s));}request();}
        };
        host.addEventListener('keydown',key);observer=new ResizeObserver(resize);observer.observe(host);
        cleanupExtra=()=>{cc.removeEventListener('start',controlStart);cc.removeEventListener('change',request);
          document.removeEventListener('visibilitychange',visibility);host.removeEventListener('keydown',key);
          rr.domElement.removeEventListener('webglcontextlost',lost);rr.domElement.removeEventListener('webglcontextrestored',restored);
          delete (window as unknown as {__K2?:unknown}).__K2;};
        updateLines();resize();apply(currentSettings);cc.update();setStatus('');callbacks.current.onReady(true);request();
      }catch(e){if(!cancelled)fail(e instanceof Error?e.message:'No se pudo preparar la escena.');}
    };
    void init();
    return()=>{
      cancelled=true;disposed=true;abort.abort();cancelAnimationFrame(frame);observer?.disconnect();cleanupExtra();
      runtime.current=null;controls?.dispose();if(scene)disposeTree(scene);
      geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
      renderer?.dispose();renderer?.domElement.remove();
    };
  },[data,attempt]);
  return <div ref={container} className="scene-host" role="region" aria-label="Vista tridimensional del K2. Arrastra para orbitar. Con foco, usa las flechas, más, menos y Home." tabIndex={0}>
    <div className="marker-layer">{data.points.map(p=><button key={p.id} ref={el=>{if(el)markerRefs.current.set(p.id,el);else markerRefs.current.delete(p.id);}}
      className={'poi-marker '+p.category+(settings.selected===p.id?' selected':'')} style={{visibility:'hidden'}}
      aria-label={p.name+', aproximadamente '+p.referenceAltitude+' metros'} onClick={()=>onSelect(p.id)}>
      <span className="marker-anchor" aria-hidden="true">{p.category==='camp'?'△':p.category==='summit'?'◇':'·'}</span>
      <span className="marker-text">{p.shortName}<small>{p.id==='summit'?'8 611':'~'+formatAltitude(p.referenceAltitude)} m</small></span>
    </button>)}</div>
    {status&&!error&&<div className="scene-status" role="status"><span className="load-indicator"/>{status}</div>}
    {error&&<div className="scene-error" role="alert"><strong>Vista 3D no disponible</strong><p>{error}</p><button onClick={()=>setAttempt(n=>n+1)}>Reintentar</button></div>}
    <div className="compass" aria-label={'Norte geográfico. Orientación de cámara '+Math.round(compass)+' grados.'}>
      <div className="compass-rose" style={{transform:'rotate('+compass+'deg)'}}><span className="north">N</span><span className="south">S</span>
        <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 13 38 37 32 33 26 37Z" fill="#eef3f6"/><path d="M32 51 26 27 32 31 38 27Z" fill="#6a8395"/></svg>
      </div><small>NORTE REAL</small>
    </div>
  </div>;
});
