import {useEffect,useRef,useState,type ReactNode} from 'react';
import atlas from '../../public/k2/atlas.json';
import {AtlasScene,type AtlasHandle} from './AtlasScene';
import {VIEWS,formatAltitude,type AtlasData,type Layers,type Poi,type Quality,type ViewId} from './types';
import './atlas.css';
const DATA=atlas as AtlasData;
const INITIAL:Layers={routes:true,abruzzi:true,cesen:true,labels:true,camps:true,death:false,clouds:true};
function Icon({name}:{name:'mountain'|'layers'|'points'|'help'|'reset'|'close'|'arrow'|'sun'|'source'}) {
  const paths={
    mountain:'M2 19 9 5l4 7 3-5 6 12H2Zm4-8 3 3 3-3',
    layers:'m12 3 10 6-10 6L2 9l10-6Zm-9 11 9 5 9-5M3 18l9 5 9-5',
    points:'M12 21s7-7 7-12A7 7 0 0 0 5 9c0 5 7 12 7 12Zm0-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    help:'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 17h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
    reset:'M3 10a9 9 0 1 1 1 8M3 3v7h7',close:'m6 6 12 12M6 18 18 6',
    arrow:'M5 12h14m-5-5 5 5-5 5',sun:'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
    source:'M12 5c-4-2-7-2-10 0v14c3-2 6-2 10 0 4-2 7-2 10 0V5c-3-2-6-2-10 0Zm0 0v14'
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}
function Toggle({label,value,onChange,note}:{label:string;value:boolean;onChange:()=>void;note?:string}) {
  return <button type="button" className="layer-toggle" role="switch" aria-checked={value} onClick={onChange}>
    <span>{label}{note&&<small>{note}</small>}</span><span className={'switch-track '+(value?'on':'')} aria-hidden="true"><i/></span>
  </button>;
}
function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.showModal();
    return()=>previous?.focus();},[]);
  return <dialog ref={dialog} className="atlas-dialog" onCancel={e=>{e.preventDefault();onClose();}} aria-labelledby="dialog-title">
    <div className="dialog-head"><h2 id="dialog-title">{title}</h2><button aria-label="Cerrar ventana" className="icon-button" onClick={onClose}><Icon name="close"/></button></div>
    <div className="dialog-content">{children}</div>
  </dialog>;
}
function PointCard({point,onClose,onFocus,ready}:{point:Poi;onClose:()=>void;onFocus:()=>void;ready:boolean}) {
  return <aside className="point-card" aria-labelledby="point-title">
    <div className="point-eyebrow"><span>{point.category==='camp'?'CAMPAMENTO':point.category==='summit'?'EL TECHO DEL KARAKÓRUM':'PUNTO DE INTERÉS'}</span>
      <button className="icon-button" aria-label="Cerrar ficha del punto" onClick={onClose}><Icon name="close"/></button></div>
    <h2 id="point-title">{point.name}</h2>
    <div className="point-altitude">{point.id==='summit'?'8 611':'~'+formatAltitude(point.referenceAltitude)} <span>m</span></div>
    <span className="certainty">{point.certainty==='reconstruido'?'Posición reconstruida':point.certainty==='aproximado'?'Referencia aproximada':'Documentado'}</span>
    <p>{point.description}</p>
    {Math.abs(point.position[1]+4500-point.referenceAltitude)>35&&<p className="model-altitude">Relieve en el anclaje: ~{formatAltitude(point.position[1]+4500)} m. La cota de referencia y el modelo no coinciden exactamente.</p>}
    <button className="focus-button" onClick={onFocus} disabled={!ready}>Enfocar este punto <Icon name="arrow"/></button>
    <div className="point-references">Referencias: {point.references.slice(0,3).map((id,i)=>{
      const s=DATA.sources.find(s=>s.id===id)!;return <a key={id} href={s.url} target="_blank" rel="noreferrer">{i+1}</a>;
    })}</div>
  </aside>;
}
export default function K2App(){
  const scene=useRef<AtlasHandle>(null);
  const [layers,setLayers]=useState<Layers>(INITIAL),[selected,setSelected]=useState<string|null>(null);
  const [view,setView]=useState<ViewId|null>('general'),[quality,setQuality]=useState<Quality>('auto'),[light,setLight]=useState<'day'|'evening'>('day');
  const [modal,setModal]=useState<'points'|'sources'|'help'|null>(null),[panel,setPanel]=useState(false),[ready,setReady]=useState(false);
  const [diagnostics,setDiagnostics]=useState<unknown>(null);
  const diagnosticMode=new URLSearchParams(location.search).has('diagnostics');
  useEffect(()=>{if(!diagnosticMode)return;const id=setInterval(()=>setDiagnostics(scene.current?.info()),1500);return()=>clearInterval(id);},[diagnosticMode]);
  useEffect(()=>{const close=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!modal){setSelected(null);setPanel(false);}};
    document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);},[modal]);
  const toggle=(key:keyof Layers)=>setLayers(l=>({...l,[key]:!l[key]}));
  const point=DATA.points.find(p=>p.id===selected);
  return <main className="k2-app">
    <AtlasScene ref={scene} data={DATA} settings={{layers,selected,quality,light}} onSelect={setSelected} onView={setView} onReady={setReady}/>
    <header className="atlas-header">
      <a className="atlas-brand" href="/" aria-label="K2 — Atlas interactivo, inicio"><Icon name="mountain"/><span>ATLAS <b>DE ALTURA</b></span></a>
      <div className="header-location"><span>KARAKÓRUM</span><small>Pakistán · China</small></div>
      <nav className="header-actions" aria-label="Información del atlas">
        <button onClick={()=>setModal('points')}><Icon name="points"/><span>Puntos de interés</span></button>
        <button onClick={()=>setModal('sources')}><Icon name="source"/><span>Fuentes</span></button>
        <button className="icon-button" aria-label="Ayuda de controles" onClick={()=>setModal('help')}><Icon name="help"/></button>
      </nav>
    </header>
    <section className="mountain-identity">
      <div className="overline"><span className="tiny-line"/> 35,8825° N · 76,5133° E</div>
      <h1><span>K2</span><small>Atlas interactivo</small></h1>
      <div className="summit-height">8 611 <span>m sobre el nivel del mar</span></div>
      <p>Aristas de roca. Corredores de hielo.<br/>Explora la gran pirámide del Karakórum.</p>
      <span className="region-tag">KARAKÓRUM <i>02 / 14 OCHOMILES</i></span>
    </section>
    <button className="mobile-panel-button" aria-expanded={panel} aria-controls="explore-panel" onClick={()=>setPanel(p=>!p)}>
      <Icon name="layers"/><span>Rutas y capas</span><span className="panel-chevron">{panel?'−':'+'}</span>
    </button>
    <aside id="explore-panel" className={'explore-panel '+(panel?'expanded':'')} aria-label="Rutas y capas">
      <div className="panel-section-title"><span>EXPLORAR EL MONTE</span><span>01</span></div>
      <Toggle label="Mostrar rutas" value={layers.routes} onChange={()=>toggle('routes')}/>
      <div className={'route-options '+(!layers.routes?'routes-hidden':'')}>
        <button className={'route-choice abruzzi '+(layers.abruzzi?'active':'')} aria-pressed={layers.abruzzi} onClick={()=>toggle('abruzzi')}>
          <span className="route-swatch"/><span>Espolón de los Abruzzos<small>Vertiente sureste</small></span><span className="route-check">{layers.abruzzi?'✓':'+'}</span>
        </button>
        <button className={'route-choice cesen '+(layers.cesen?'active':'')} aria-pressed={layers.cesen} onClick={()=>toggle('cesen')}>
          <span className="route-swatch"/><span>Česen / Basque<small>Espolón sur-sureste</small></span><span className="route-check">{layers.cesen?'✓':'+'}</span>
        </button>
        <div className="shared-legend"><span/> Tramo superior compartido</div>
      </div>
      <div className="panel-section-title"><span>CAPAS DEL ATLAS</span><span>02</span></div>
      <Toggle label="Etiquetas" value={layers.labels} onChange={()=>toggle('labels')}/>
      <Toggle label="Campamentos" value={layers.camps} onChange={()=>toggle('camps')}/>
      <div className="atmosphere-controls">
        <Toggle label="Zona de la muerte" note="Umbral de 8 000 m" value={layers.death} onChange={()=>toggle('death')}/>
        <Toggle label="Nubes" value={layers.clouds} onChange={()=>toggle('clouds')}/>
      </div>
      <div className="render-options">
        <label htmlFor="quality">Calidad</label><select id="quality" value={quality} onChange={e=>setQuality(e.target.value as Quality)}>
          <option value="auto">Auto</option><option value="high">Alta</option><option value="medium">Media</option><option value="low">Baja</option>
        </select>
        <button className="light-button" aria-label={light==='day'?'Cambiar a luz de tarde':'Cambiar a luz de día'} onClick={()=>setLight(l=>l==='day'?'evening':'day')}>
          <Icon name="sun"/>{light==='day'?'Día':'Tarde'}
        </button>
      </div>
    </aside>
    {point&&<PointCard point={point} onClose={()=>setSelected(null)} onFocus={()=>scene.current?.focus(point)} ready={ready}/>}
    <div className="zoom-controls" aria-label="Controles de cámara">
      <button aria-label="Acercar" onClick={()=>scene.current?.zoom(.85)} disabled={!ready}>+</button>
      <button aria-label="Alejar" onClick={()=>scene.current?.zoom(1.17)} disabled={!ready}>−</button>
      <button aria-label="Restablecer vista general" onClick={()=>scene.current?.view('general')} disabled={!ready}><Icon name="reset"/></button>
    </div>
    <nav className="view-selector" aria-label="Vistas de la montaña">
      <span className="view-label">VISTAS</span>{VIEWS.map(v=><button key={v.id} aria-label={v.label} aria-pressed={view===v.id}
        className={view===v.id?'active':''} onClick={()=>scene.current?.view(v.id)} disabled={!ready}>{v.short}</button>)}
    </nav>
    <footer className="atlas-footer">
      <button className="reconstruction-note" onClick={()=>setModal('sources')}><span className="status-dot"/> Relieve reconstruido <span className="footer-dot">·</span> Curvas de 150 m <span aria-hidden="true">↗</span></button>
      <span className="gesture-hint">Arrastra para orbitar <i>·</i> Desliza para acercar</span>
      <span className="scale-note">ESCALA DEL RELIEVE <b>1:1</b></span>
    </footer>
    {diagnosticMode&&<details className="diagnostics"><summary>Diagnóstico</summary><pre>{JSON.stringify(diagnostics,null,2)}</pre></details>}
    {modal==='points'&&<Modal title="Puntos de interés" onClose={()=>setModal(null)}>
      <p className="dialog-intro">Un itinerario por el relieve. Las cotas son referencias; las posiciones de las rutas y del hielo son orientativas.</p>
      <div className="html-point-list">{DATA.points.map(p=><button key={p.id} onClick={()=>{setSelected(p.id);setModal(null);}}>
        <span><b>{p.name}</b><small>{p.category==='camp'?(p.routes.length===2?'Ambas rutas':p.routes[0]==='abruzzi'?'Abruzzi · referencia 2023':'Česen · referencia 1996'):p.certainty}</small></span>
        <span>{p.id==='summit'?'':'~'}{formatAltitude(p.referenceAltitude)} m <Icon name="arrow"/></span>
      </button>)}</div>
    </Modal>}
    {modal==='sources'&&<Modal title="El terreno y sus fuentes" onClose={()=>setModal(null)}>
      <div className="source-lead"><span className="overline">UNA RECONSTRUCCIÓN, CON LÍMITES</span><h3>La geografía guía la imagen.</h3>
        <p>El relieve procede de curvas del K2 cada 150 m, interpoladas de forma reproducible. El recorte mide 11,6 km por lado y mantiene proporción 1:1. Se orienta al norte y se ancla aproximadamente a la cumbre.</p>
        <p>El DEM original, su resolución y su geoide no están disponibles en la fuente utilizada. La cuadrícula de 22,7 m es muestreo para renderizar, <strong>no una medición de esa resolución</strong>. Los servidores de descarga de DEM no estaban habilitados en el entorno de trabajo.</p>
        <p>La pequeña cumbre sobre 8 400 m y el serac son reconstruidos. Las rutas no proceden de GPX: son trazados orientativos ajustados al relieve. Los materiales no son fotografías satelitales ni representan el estado actual del hielo.</p>
      </div>
      <div className="source-list">{DATA.sources.map((s,i)=><article key={s.id}><span className="source-number">{String(i+1).padStart(2,'0')}</span>
        <div><a href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a><p>{s.note}</p></div></article>)}</div>
      <p className="source-end">Referencias consultadas el 7 de octubre de 2026. Procesamiento y límites documentados en el repositorio. <a href="/laboratorio/">Abrir el laboratorio de campos vectoriales conservado ↗</a></p>
    </Modal>}
    {modal==='help'&&<Modal title="Explorar el atlas" onClose={()=>setModal(null)}>
      <div className="help-intro"><Icon name="mountain"/><p>Cambia de perspectiva para leer las aristas. Selecciona un punto para conocerlo y acercarte a él.</p></div>
      <dl className="help-list"><div><dt>Orbitar</dt><dd>Arrastra con el ratón o con un dedo.</dd></div><div><dt>Acercar y alejar</dt><dd>Rueda, gesto de pinza o botones + / −.</dd></div>
        <div><dt>Desplazar</dt><dd>Botón derecho o dos dedos. El objetivo queda dentro del macizo.</dd></div><div><dt>Teclado</dt><dd>Enfoca la vista 3D con Tab: flechas para orbitar, Shift + flechas para desplazar, + / − para zoom y Home para vista general.</dd></div>
        <div><dt>Rutas</dt><dd>Abruzzi: línea azul continua. Česen: ámbar discontinua. Blanco: único tramo compartido sobre el Hombro.</dd></div>
        <div><dt>Movimiento reducido</dt><dd>Se respeta la preferencia del dispositivo. La autorrotación está desactivada.</dd></div>
      </dl>
      <p className="help-note">Las posiciones son orientativas. La cuadrícula y el hielo reconstruido no sustituyen cartografía de expedición.</p>
    </Modal>}
  </main>;
}
