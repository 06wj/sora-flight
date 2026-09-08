import * as H from 'hilo3d';
import type { FlightEvent, GameState } from '../game';

const fract=(value:number):number=>value-Math.floor(value);
const noise=(seed:number):number=>fract(Math.sin(seed*127.1+81.7)*43758.5453);
interface QuadBatch { mesh:H.Mesh; positions:Float32Array; }
function quad(a:Float32Array,o:number,x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,x2:number,y2:number,z2:number,x3:number,y3:number,z3:number):void{
  a[o]=x0;a[o+1]=y0;a[o+2]=z0;a[o+3]=x1;a[o+4]=y1;a[o+5]=z1;
  a[o+6]=x2;a[o+7]=y2;a[o+8]=z2;a[o+9]=x3;a[o+10]=y3;a[o+11]=z3;
}

function batch(count:number,material:H.MaterialInstance,parent:H.Node):QuadBatch {
  const positions=new Float32Array(count*12),uvs=new Float32Array(count*8),colors=new Float32Array(count*16),indices=new Uint16Array(count*6);
  for(let i=0;i<count;i++){
    uvs.set([0,0,1,0,0,1,1,1],i*8);
    const k=i*4;indices.set([k,k+1,k+2,k+1,k+3,k+2],i*6);
    for(let j=0;j<4;j++)colors.set([1,1,1,.38+noise(i+37)*.62],i*16+j*4);
  }
  const geometry=new H.Geometry({vertices:new H.GeometryData(positions,3),uvs:new H.GeometryData(uvs,2),colors:new H.GeometryData(colors,4),indices:new H.GeometryData(indices,1)});
  return {positions,mesh:new H.Mesh({geometry,material,frustumTest:false}).addTo(parent)};
}

/** Two streamed quad batches, one lightning mesh, and one telegraphed danger ring. */
export class WeatherView {
  private readonly rain:QuadBatch;
  private readonly snow:QuadBatch;
  private readonly bolt:QuadBatch;
  private readonly rainMaterial:H.BasicMaterial;
  private readonly snowMaterial:H.BasicMaterial;
  private readonly boltMaterial:H.BasicMaterial;
  private readonly warningMaterial:H.BasicMaterial;
  private readonly right=new H.Vector3();
  private readonly up=new H.Vector3();
  private readonly dropSeeds=Array.from({length:600},(_,i)=>[noise(i+1),noise(i+651),noise(i+1271),noise(i+2711)] as const);
  private time=0;
  private boltLife=0;
  private previewStrike=0;
  private wet=0;
  private snowy=0;
  private quality:'high'|'medium'|'low'='high';
  private reducedFlashes=false;
  flash=0;

  constructor(stage:H.Stage,private readonly camera:H.PerspectiveCamera,private readonly warning:H.Node){
    this.rainMaterial=new H.BasicMaterial({name:'Anime rain streaks',lightType:'NONE',diffuse:new H.Color(.64,.80,.92),opacity:0,compositing:{mode:'alpha-blend',premultiplied:false},state:{depthWrite:false,cullMode:'none'}});
    const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;
    const ctx=canvas.getContext('2d')!,gradient=ctx.createRadialGradient(16,16,0,16,16,15);
    gradient.addColorStop(0,'rgba(255,255,255,1)');gradient.addColorStop(.30,'rgba(248,253,255,1)');gradient.addColorStop(.65,'rgba(238,248,255,.5)');gradient.addColorStop(1,'rgba(236,250,255,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,32,32);
    this.snowMaterial=new H.BasicMaterial({name:'Soft drifting snow',lightType:'NONE',diffuse:new H.Texture({image:canvas,flipY:true}),opacity:0,compositing:{mode:'alpha-blend',premultiplied:false},state:{depthWrite:false,cullMode:'none'}});
    this.boltMaterial=new H.BasicMaterial({name:'Lightning branches',lightType:'NONE',diffuse:new H.Color(2.6,2.9,3.5),opacity:0,compositing:{mode:'additive',premultiplied:false},state:{depthWrite:false,cullMode:'none'}});
    this.warningMaterial=new H.BasicMaterial({name:'Lightning danger marker',lightType:'NONE',diffuse:new H.Color(1.25,.04,.065),opacity:.8,compositing:{mode:'alpha-blend',premultiplied:false},state:{depthWrite:false,cullMode:'none'}});
    this.rain=batch(600,this.rainMaterial,stage);this.snow=batch(260,this.snowMaterial,stage);this.bolt=batch(48,this.boltMaterial,stage);
    this.rain.mesh.layer=2;this.snow.mesh.layer=2;
    warning.traverse(node=>{if(node instanceof H.Mesh){node.material=this.warningMaterial;node.useInstanced=true;}return H.Node.TRAVERSE_STOP_NONE;});
    warning.visible=false;
  }
  setQuality(quality:'high'|'medium'|'low'):void{this.quality=quality;}
  setReducedFlashes(value:boolean):void{this.reducedFlashes=value;}
  event(event:FlightEvent):void{
    if(event.type==='lightning')this.strike(event.x,event.y,event.z);
    if(event.type==='start'){this.boltLife=0;this.flash=0;this.warning.visible=false;}
  }
  private strike(x:number,y:number,z:number):void{
    this.boltLife=.48;
    const array=this.bolt.positions;
    let cursor=0;
    const segment=(ax:number,ay:number,az:number,bx:number,by:number,bz:number,width:number):void=>{
      if(cursor>=48)return;
      const rx=this.right.x*width,ry=this.right.y*width,rz=this.right.z*width;
      array.set([ax-rx,ay-ry,az-rz,ax+rx,ay+ry,az+rz,bx-rx,by-ry,bz-rz,bx+rx,by+ry,bz+rz],cursor++*12);
    };
    let px=x,py=175,pz=z;
    for(let i=1;i<=16;i++){
      const t=i/16,nx=x+(noise(i+this.time)-.5)*9*(1-t),ny=175*(1-t)+Math.min(y,.5)*t,nz=z+(noise(i+37+this.time)-.5)*5*(1-t);
      segment(px,py,pz,nx,ny,nz,.045+(1-t)*.04);
      if(i===4||i===8||i===11){
        let ax=nx,ay=ny,az=nz;
        const sign=i%2===0?1:-1;
        for(let j=1;j<=5;j++){
          const bx=ax+sign*(3+noise(i*j+13)*5),by=ay-(4+noise(i*j+55)*6),bz=az+noise(i+j+31)*3;
          segment(ax,ay,az,bx,by,bz,.035-j*.004);ax=bx;ay=by;az=bz;
        }
      }
      px=nx;py=ny;pz=nz;
    }
    while(cursor<48){array.fill(0,cursor*12,cursor*12+12);cursor++;}
    this.bolt.mesh.geometry!.vertices!.isDirty=true;
  }
  update(dt:number,state:GameState):void{
    dt=Number.isFinite(dt)?Math.max(0,Math.min(dt,.1)):0;
    const active=state.status==='playing'||state.status==='title';
    if(active){this.time+=dt;this.boltLife=Math.max(0,this.boltLife-dt);}
    const mode=state.weather??'clear',blend=1-Math.exp(-dt*2.3);
    this.wet+=((mode==='rain'||mode==='storm'?1:0)-this.wet)*blend;
    this.snowy+=((mode==='snow'?1:0)-this.snowy)*blend;
    const focus=state.status==='title'?this.camera:state.player;
    this.right.set(1,0,0).transformQuat(this.camera.quaternion);
    this.up.set(0,1,0).transformQuat(this.camera.quaternion);
    if(mode==='storm'&&state.status==='title'&&this.time-this.previewStrike>8){this.previewStrike=this.time;this.strike(focus.x-35,22,focus.z-170);}
    if(mode!=='storm'&&state.lightningFlash<=0)this.boltLife=0;
    this.flash=Math.max(state.lightningFlash??0,this.boltLife/.48)*(this.reducedFlashes?.18:1);
    this.bolt.mesh.visible=this.boltLife>0;
    this.boltMaterial.opacity=(this.reducedFlashes?.25:.85)*Math.min(1,this.boltLife*5);
    const target=state.stormTarget;
    this.warning.visible=Boolean(target&&state.stormWarning>0);
    if(target){
      this.warning.setPosition(target.x,target.y,target.z);this.warning.setScale(target.radius/6.5*(1+Math.sin(this.time*5)*.015));this.warning.rotationZ=this.time*12;
      this.warningMaterial.opacity=.55+.18*Math.sin(this.time*6);
    }
    const rainCount=this.quality==='low'?200:this.quality==='medium'?360:600;
    this.rain.mesh.visible=this.wet>.01;this.rainMaterial.opacity=Math.max(0,Math.min(1,this.wet))*(mode==='storm'?.65:.47);
    if(this.rain.mesh.visible){
      const array=this.rain.positions;
      for(let i=0;i<600;i++){
        if(i>=rainCount){array.fill(0,i*12,i*12+12);continue;}
        const s=this.dropSeeds[i]!,speed=mode==='storm'?48:36;
        const x=focus.x+(s[0]-.5)*130+Math.sin(this.time*.7+s[1]*6)*2;
        const y=focus.y-34+fract(s[1]-this.time*speed/120)*120;
        const z=focus.z+22-s[2]*245;
        const length=1.7+s[3]*2.8,width=.012+s[3]*.02,lean=(state.windX??0)*.15+.12;
        const rx=this.right.x*width,ry=this.right.y*width,rz=this.right.z*width;
        quad(array,i*12,x-rx,y-ry,z-rz,x+rx,y+ry,z+rz,x+lean-rx,y-length-ry,z-rz,x+lean+rx,y-length+ry,z+rz);
      }
      this.rain.mesh.geometry!.vertices!.isDirty=true;
    }
    const snowCount=this.quality==='low'?90:this.quality==='medium'?160:260;
    this.snow.mesh.visible=this.snowy>.01;this.snowMaterial.opacity=Math.max(0,Math.min(1,this.snowy))*.95;
    if(this.snow.mesh.visible){
      const array=this.snow.positions;
      for(let i=0;i<260;i++){
        if(i>=snowCount){array.fill(0,i*12,i*12+12);continue;}
        const s=this.dropSeeds[i]!,angle=this.time*(.45+s[3]) +s[0]*30;
        const x=focus.x+(s[0]-.5)*105+Math.sin(angle)*3+(state.windX??0)*.35;
        const y=focus.y-27+fract(s[1]-this.time*(.045+s[3]*.025))*95;
        const z=focus.z+15-s[2]*185+Math.cos(angle*.7)*2;
        const size=.06+s[3]*.22,rx=this.right.x*size,ry=this.right.y*size,rz=this.right.z*size,ux=this.up.x*size,uy=this.up.y*size,uz=this.up.z*size;
        quad(array,i*12,x-rx-ux,y-ry-uy,z-rz-uz,x+rx-ux,y+ry-uy,z+rz-uz,x-rx+ux,y-ry+uy,z-rz+uz,x+rx+ux,y+ry+uy,z+rz+uz);
      }
      this.snow.mesh.geometry!.vertices!.isDirty=true;
    }
  }
}
