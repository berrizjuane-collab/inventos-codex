import type { Profile, Quality } from './types';
export const BUDGETS:Record<Profile,{dpr:number; pixels:number; step:number; shadow:number}> = {
  low:{dpr:1,pixels:550000,step:4,shadow:0},
  medium:{dpr:1.35,pixels:1250000,step:2,shadow:0},
  high:{dpr:1.75,pixels:2400000,step:1,shadow:1024}
};
export function effectiveDpr(profile:Profile,width:number,height:number,deviceDpr:number) {
  return Math.max(.5,Math.min(BUDGETS[profile].dpr,deviceDpr,Math.sqrt(BUDGETS[profile].pixels/(width*height))));
}
export class AutoQuality {
  profile:Profile;
  private samples:number[]=[];
  private lastChange=0;
  private upgradeAfter=0;
  private ceiling:Profile;
  constructor(cores:number,memory:number,pixels:number) {
    const limited=cores<4||memory<4||pixels>3500000;
    this.profile=limited?'low':'medium';this.ceiling=limited?'low':'high';
  }
  measure(frameMs:number,now:number):Profile {
    if(frameMs<=0||frameMs>2000) return this.profile;
    this.samples.push(frameMs);if(this.samples.length>90)this.samples.shift();
    if(this.samples.length<60||now-this.lastChange<8000)return this.profile;
    const sorted=[...this.samples].sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)];
    const order:Profile[]=['low','medium','high'];let index=order.indexOf(this.profile);
    if(median>35&&index>0){index--;this.upgradeAfter=now+60000;}
    else if(median<18&&this.samples.length>=90&&index<order.indexOf(this.ceiling)&&now>=this.upgradeAfter)index++;
    if(order[index]!==this.profile){this.profile=order[index];this.lastChange=now;this.samples=[];}
    return this.profile;
  }
}
export function requestedProfile(quality:Quality,automatic:AutoQuality):Profile {return quality==='auto'?automatic.profile:quality;}
