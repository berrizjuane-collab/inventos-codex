import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),execute=promisify(execFile);
const reportPath=path.join(root,'evidence/native-zoom.json'),capturePath=path.join(root,'evidence/captures/h4-native-zoom-200.png');
const display=process.env.DISPLAY;if(!display)throw new Error('An existing local X display (DISPLAY) is required; this script installs and starts no display server.');
// Native XTest keyboard events reach real browser chrome. No device-metrics,
// page-scale or CSS zoom emulation is used; the context has viewport:null.
const nativeInput=String.raw`
import ctypes,json,os,sys,time
X=ctypes.CDLL('libX11.so.6');T=ctypes.CDLL('libXtst.so.6');Window=ctypes.c_ulong
class XWindowAttributes(ctypes.Structure):
 _fields_=[('x',ctypes.c_int),('y',ctypes.c_int),('width',ctypes.c_int),('height',ctypes.c_int),('border_width',ctypes.c_int),('depth',ctypes.c_int),('visual',ctypes.c_void_p),('root',Window),('window_class',ctypes.c_int),('bit_gravity',ctypes.c_int),('win_gravity',ctypes.c_int),('backing_store',ctypes.c_int),('backing_planes',ctypes.c_ulong),('backing_pixel',ctypes.c_ulong),('save_under',ctypes.c_int),('colormap',ctypes.c_ulong),('map_installed',ctypes.c_int),('map_state',ctypes.c_int),('all_event_masks',ctypes.c_long),('your_event_mask',ctypes.c_long),('do_not_propagate_mask',ctypes.c_long),('override_redirect',ctypes.c_int),('screen',ctypes.c_void_p)]
X.XOpenDisplay.argtypes=[ctypes.c_char_p];X.XOpenDisplay.restype=ctypes.c_void_p
X.XDefaultRootWindow.argtypes=[ctypes.c_void_p];X.XDefaultRootWindow.restype=Window
X.XQueryTree.argtypes=[ctypes.c_void_p,Window,ctypes.POINTER(Window),ctypes.POINTER(Window),ctypes.POINTER(ctypes.POINTER(Window)),ctypes.POINTER(ctypes.c_uint)]
X.XFetchName.argtypes=[ctypes.c_void_p,Window,ctypes.POINTER(ctypes.c_void_p)];X.XFree.argtypes=[ctypes.c_void_p]
X.XGetWindowAttributes.argtypes=[ctypes.c_void_p,Window,ctypes.POINTER(XWindowAttributes)];X.XGetWindowAttributes.restype=ctypes.c_int
X.XInternAtom.argtypes=[ctypes.c_void_p,ctypes.c_char_p,ctypes.c_int];X.XInternAtom.restype=ctypes.c_ulong
X.XGetWindowProperty.argtypes=[ctypes.c_void_p,Window,ctypes.c_ulong,ctypes.c_long,ctypes.c_long,ctypes.c_int,ctypes.c_ulong,ctypes.POINTER(ctypes.c_ulong),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_ulong),ctypes.POINTER(ctypes.c_ulong),ctypes.POINTER(ctypes.c_void_p)];X.XGetWindowProperty.restype=ctypes.c_int
X.XRaiseWindow.argtypes=[ctypes.c_void_p,Window];X.XSetInputFocus.argtypes=[ctypes.c_void_p,Window,ctypes.c_int,ctypes.c_ulong]
X.XGetInputFocus.argtypes=[ctypes.c_void_p,ctypes.POINTER(Window),ctypes.POINTER(ctypes.c_int)]
X.XStringToKeysym.argtypes=[ctypes.c_char_p];X.XStringToKeysym.restype=ctypes.c_ulong
X.XKeysymToKeycode.argtypes=[ctypes.c_void_p,ctypes.c_ulong];X.XKeysymToKeycode.restype=ctypes.c_uint
X.XResizeWindow.argtypes=[ctypes.c_void_p,Window,ctypes.c_uint,ctypes.c_uint]
X.XFlush.argtypes=[ctypes.c_void_p];X.XSync.argtypes=[ctypes.c_void_p,ctypes.c_int];X.XCloseDisplay.argtypes=[ctypes.c_void_p]
T.XTestQueryExtension.argtypes=[ctypes.c_void_p,ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_int),ctypes.POINTER(ctypes.c_int)]
T.XTestFakeKeyEvent.argtypes=[ctypes.c_void_p,ctypes.c_uint,ctypes.c_int,ctypes.c_ulong]
d=X.XOpenDisplay(os.environ['DISPLAY'].encode());assert d,'X display unavailable'
try:
 values=[ctypes.c_int() for _ in range(4)];assert T.XTestQueryExtension(d,*[ctypes.byref(v) for v in values]),'XTest unavailable'
 root=Window();parent=Window();children=ctypes.POINTER(Window)();count=ctypes.c_uint()
 assert X.XQueryTree(d,X.XDefaultRootWindow(d),ctypes.byref(root),ctypes.byref(parent),ctypes.byref(children),ctypes.byref(count))
 windows=[];discovered=[];name_atom=X.XInternAtom(d,b'_NET_WM_NAME',True)
 for i in range(count.value):
  candidate=int(children[i]);attributes=XWindowAttributes()
  if not X.XGetWindowAttributes(d,candidate,ctypes.byref(attributes)):
   discovered.append({'id':candidate,'attributesAvailable':False});continue
  legacy='';title=ctypes.c_void_p()
  if X.XFetchName(d,candidate,ctypes.byref(title)) and title.value:
   legacy=ctypes.string_at(title).decode('utf-8','replace');X.XFree(title)
  utf8=''
  if name_atom:
   actual_type=ctypes.c_ulong();actual_format=ctypes.c_int();items=ctypes.c_ulong();remaining=ctypes.c_ulong();property_value=ctypes.c_void_p()
   status=X.XGetWindowProperty(d,candidate,name_atom,0,1024,False,0,ctypes.byref(actual_type),ctypes.byref(actual_format),ctypes.byref(items),ctypes.byref(remaining),ctypes.byref(property_value))
   try:
    if status==0 and property_value.value and actual_format.value==8:utf8=ctypes.string_at(property_value,items.value).decode('utf-8','replace')
   finally:
    if property_value.value:X.XFree(property_value)
  name=utf8 or legacy
  record={'id':candidate,'title':name,'legacyTitle':legacy,'mapState':attributes.map_state,'class':attributes.window_class,'x':attributes.x,'y':attributes.y,'width':attributes.width,'height':attributes.height,'overrideRedirect':bool(attributes.override_redirect)}
  record['eligible']=attributes.map_state==2 and attributes.window_class==1 and attributes.width>0 and attributes.height>0
  discovered.append(record)
  if record['eligible']:windows.append(record)
 if children:X.XFree(children)
 selected=max(windows,key=lambda item: ('campo' in item['title'].lower(),item['width']*item['height'])) if windows else None
 # Emit evidence before focus, so an X error cannot erase discovery diagnostics.
 print(json.dumps({'stage':'before-focus','windows':discovered,'selected':selected,'preference':'Campo title, then largest IsViewable InputOutput window'}),flush=True)
 assert selected,'No visible InputOutput window found on the isolated display';window=selected['id'];name=selected['title']
 X.XRaiseWindow(d,window);X.XSetInputFocus(d,window,1,0);X.XSync(d,False)
 action=sys.argv[1]
 if action=='resize':X.XResizeWindow(d,window,int(sys.argv[2]),int(sys.argv[3]));X.XFlush(d);time.sleep(.2);keys=[]
 else:
  keyname='0' if action=='reset' else 'equal'
  ctrl=X.XKeysymToKeycode(d,X.XStringToKeysym(b'Control_L'));key=X.XKeysymToKeycode(d,X.XStringToKeysym(keyname.encode()));assert ctrl and key
  assert T.XTestFakeKeyEvent(d,ctrl,True,0);assert T.XTestFakeKeyEvent(d,key,True,0);assert T.XTestFakeKeyEvent(d,key,False,0);assert T.XTestFakeKeyEvent(d,ctrl,False,0)
  X.XFlush(d);time.sleep(.15);keys=[ctrl,key]
 focus=Window();revert=ctypes.c_int();X.XGetInputFocus(d,ctypes.byref(focus),ctypes.byref(revert))
 print(json.dumps({'action':action,'display':os.environ['DISPLAY'],'window':window,'title':name,'focus':int(focus.value),'keycodes':keys,'xTestVersion':[values[2].value,values[3].value]}))
finally:X.XCloseDisplay(d)
`;
const nativeRecords=stdout=>String(stdout||'').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
async function native(action,...args){
 try{const {stdout}=await execute('python3',['-c',nativeInput,action,...args.map(String)],{env:{...process.env,DISPLAY:display},timeout:8000,maxBuffer:65536});const records=nativeRecords(stdout);return {...records.at(-1),windowDiscovery:records.find(record=>record.stage==='before-focus')}}
 catch(error){try{error.nativeWindowDiscovery=nativeRecords(error.stdout).find(record=>record.stage==='before-focus')}catch{}throw error}
}
const metrics=page=>page.evaluate(()=>({innerWidth,innerHeight,outerWidth,outerHeight,dpr:devicePixelRatio,scrollWidth:document.documentElement.scrollWidth,horizontalOverflow:document.documentElement.scrollWidth>innerWidth,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,canvas:(()=>{const r=document.querySelector('.scene-host canvas')?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null})()}));
let previous;try{previous=JSON.parse(await fs.readFile(reportPath,'utf8'))}catch{}
const report={nativeZoomVerified:false,generatedAt:new Date().toISOString(),mechanism:'Headful Chromium on local Xorg dummy; libXtst XTestFakeKeyEvent through Python ctypes',display,deviceMetricsEmulation:false,cssZoom:false,pageScaleEmulation:false,reducedMotionPreferenceEmulated:true,input:[],errors:[],checks:{},previousAttempt:previous?{nativeZoomVerified:previous.nativeZoomVerified,before:previous.before,after:previous.after}:undefined};
const browser=await chromium.launch({headless:false,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',env:{...process.env,DISPLAY:display},args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--window-size=1440,1000','--window-position=0,0','--force-prefers-reduced-motion','--disable-background-networking','--disable-component-update']});
try{
 const context=await browser.newContext({viewport:null,reducedMotion:'reduce'});await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto('http://127.0.0.1:5173/laboratorio/');await page.waitForSelector('.scene-host canvas');await page.evaluate(()=>document.fonts.ready);
 report.input.push(await native('reset'));const initial=await metrics(page);report.input.push(await native('resize',1440,900+initial.outerHeight-initial.innerHeight));await page.waitForTimeout(200);report.before=await metrics(page);report.zoomSteps=[];
 for(let step=0;step<5;step++){report.input.push(await native('zoom-in'));await page.waitForTimeout(100);report.zoomSteps.push(await metrics(page))}
 report.after=await metrics(page);report.browserVersion=browser.version();report.nativeZoomVerified=Math.abs(report.after.dpr/report.before.dpr-2)<1e-9&&Math.abs(report.after.innerWidth*2-report.before.innerWidth)<=1&&Math.abs(report.after.innerHeight*2-report.before.innerHeight)<=1;
 if(!report.nativeZoomVerified)throw new Error('XTest shortcuts did not establish native 200% zoom.');
 report.checks.nativeViewportHalved=true;report.checks.noHorizontalOverflow=!report.after.horizontalOverflow;report.checks.reducedMotion=report.after.reducedMotion;
 const menu=page.getByRole('button',{name:'Mostrar controles',exact:true});await menu.click();await page.getByLabel('Componente P',{exact:true}).focus();report.checks.editorFocusReachable=await page.getByLabel('Componente P',{exact:true}).evaluate(e=>e===document.activeElement);await page.keyboard.press('Escape');report.checks.controlsEscapeReturnsFocus=await menu.evaluate(e=>e===document.activeElement);
 const inspector=page.getByRole('button',{name:'Abrir inspector',exact:true});await inspector.click();await page.getByLabel('Punto x',{exact:true}).focus();report.checks.inspectorFocusReachable=await page.getByLabel('Punto x',{exact:true}).evaluate(e=>e===document.activeElement);await page.keyboard.press('Escape');report.checks.inspectorEscapeReturnsFocus=await inspector.evaluate(e=>e===document.activeElement);
 const help=page.getByRole('button',{name:'Ayuda',exact:true});await help.click();report.checks.helpReachable=await page.getByRole('dialog').isVisible();await page.keyboard.press('Escape');report.checks.helpEscapeReturnsFocus=await help.evaluate(e=>e===document.activeElement);
 report.final=await metrics(page);report.checks.controlsDoNotChangeNativeZoom=report.final.dpr===report.after.dpr&&report.final.innerWidth===report.after.innerWidth;report.checks.noPageErrors=report.errors.length===0;
 await fs.mkdir(path.dirname(capturePath),{recursive:true});const cdp=await context.newCDPSession(page);const shot=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});const bytes=Buffer.from(shot.data,'base64');await fs.writeFile(capturePath,bytes);report.captureSize={width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};report.afterCapture=await metrics(page);report.checks.capturePreservesNativeZoom=report.afterCapture.dpr===report.after.dpr&&report.afterCapture.innerWidth===report.after.innerWidth;report.checks.captureWholeViewport=report.captureSize.width===Math.round(report.before.innerWidth*report.before.dpr)&&report.captureSize.height===Math.round(report.before.innerHeight*report.before.dpr);report.capture='evidence/captures/h4-native-zoom-200.png';report.passed=Object.values(report.checks).every(Boolean);if(!report.passed)throw new Error('A native-zoom layout/accessibility check failed.');
}catch(error){report.failure=error.stderr?String(error.stderr).trim():error instanceof Error?error.message:String(error);if(error.nativeWindowDiscovery)report.failedNativeWindowDiscovery=error.nativeWindowDiscovery;report.passed=false;process.exitCode=1}
finally{await browser.close();await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({nativeZoomVerified:report.nativeZoomVerified,passed:report.passed,before:report.before,after:report.after,checks:report.checks,failure:report.failure}))}
