export type Vec3 = [number, number, number];
export type RouteId = 'abruzzi' | 'cesen';
export type Quality = 'auto' | 'high' | 'medium' | 'low';
export type Profile = Exclude<Quality, 'auto'>;
export function formatAltitude(value:number) { return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g,' '); }
export type ViewId = 'general' | 'abruzzi' | 'shoulder' | 'bottleneck' | 'summit' | 'north' | 'east';
export interface Source { id: string; title: string; url: string; note: string }
export interface Poi {
  id: string; name: string; shortName: string; category: 'camp' | 'landform' | 'summit' | 'zone';
  routes: RouteId[]; position: Vec3; referenceAltitude: number;
  certainty: 'aproximado' | 'reconstruido' | 'documentado';
  description: string; references: string[]; view: ViewId;
}
export interface Segment { id: string; routes: RouteId[]; positions: Vec3[]; shared: boolean }
export interface AtlasData { points: Poi[]; segments: Segment[]; sources: Source[] }
export interface TerrainMeta {
  grid: number; gridSpacingMeters: number; bounds: [number,number,number,number]; verticalOrigin: number;
  summit: Vec3; contourIntervalMeters: number; minHeight: number; maxHeight: number;
  levels: Record<string, {triangles:number; vertices:number; bytes:number}>;
}
export interface Layers { routes: boolean; abruzzi: boolean; cesen: boolean; labels: boolean; camps: boolean; death: boolean; clouds: boolean }
export interface SceneSettings { layers: Layers; selected: string | null; quality: Quality; light: 'day' | 'evening' }
export const VIEWS: {id:ViewId; label:string; short:string}[] = [
  {id:'general',label:'Vista general',short:'General'}, {id:'abruzzi',label:'Espolón de los Abruzzos',short:'Abruzzi'},
  {id:'shoulder',label:'Hombro y Camp IV',short:'Hombro'}, {id:'bottleneck',label:'Bottleneck y serac',short:'Bottleneck'},
  {id:'summit',label:'Cumbre',short:'Cumbre'}, {id:'north',label:'Cara norte',short:'Norte'}, {id:'east',label:'Cara este',short:'Este'}
];
