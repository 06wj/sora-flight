import * as H from 'hilo3d';
import { ArtMaterials } from './materials';
import { WeatherView } from './weather-view';
import { roadTileZ } from '../terrain';
import type { FlightEvent, FlightObstacle, FlightRing, GameState } from '../game';

const ASSETS = ['bird','building-a','building-b','building-c','building-d','building-e','tree','cloud','tower','wind-ring','road','urban-details','car-red','bridge','train','rail-viaduct','streetlamp'] as const;
type AssetKey = typeof ASSETS[number];
interface Placed { node:H.Node; z:number; }
interface Spark { mesh:H.Mesh; life:number; duration:number; vx:number; vy:number; vz:number; }
const random=(seed:number):number=>{ const v=Math.sin(seed*127.1+311.7)*43758.5453;return v-Math.floor(v); };

export class FlightWorld {
  readonly art=new ArtMaterials();
  readonly obstacles:FlightObstacle[]=[];
  private readonly assets=new Map<AssetKey,H.Node>();
  private readonly buildings:Placed[]=[];
  private readonly roads:H.Node[]=[];
  private readonly rings:H.Node[]=[];
  private readonly clouds:Placed[]=[];
  private readonly ambientBirds:{node:H.Node;left:H.Node|undefined;right:H.Node|undefined}[]=[];
  private readonly sparkles:Spark[]=[];
  private readonly wind:H.Mesh[]=[];
  private readonly cars:{node:H.Node;seed:number;direction:number}[]=[];
  private readonly shadows:{node:H.Mesh;building:Placed}[]=[];
  private readonly trains:{node:H.Node;baseZ:number;phase:number}[]=[];
  private readonly lamps:{glow:H.Mesh;pool:H.Mesh;z:number}[]=[];
  private lampGlowMaterial:H.BasicMaterial|undefined;
  private lampPoolMaterial:H.BasicMaterial|undefined;
  private readonly ribbons:{mesh:H.Mesh;data:Float32Array;history:H.Vector3[];side:number}[]=[];
  private readonly look=new H.Vector3();
  private readonly tmp=new H.Vector3();
  private readonly sky:H.Mesh;
  private ground:H.Mesh|undefined;
  private readonly banks:H.Mesh[]=[];
  private water:H.Mesh|undefined;
  private readonly shadow:H.Mesh;
  private weatherView:WeatherView|undefined;
  private reducedFlashes=false;
  private bird!:H.Node;
  private leftWing:H.Node|undefined;
  private rightWing:H.Node|undefined;
  private scarf:H.Node|undefined;
  private time=0;
  private targetTheme=0;
  private pausedTime=0;
  private quality:'high'|'medium'|'low'='high';
  private readonly sunGlow:HTMLElement;
  private shake=0;
  private previousState='title';
  private readonly spawnSpark=new H.PlaneGeometry({width:1,height:1});

  constructor(readonly stage:H.Stage,readonly camera:H.PerspectiveCamera) {
    camera.visibility=3;
    this.sky=new H.Mesh({geometry:new H.SphereGeometry({radius:1450,widthSegments:40,heightSegments:24}),material:this.art.sky(),renderOrder:-1000,frustumTest:false}).addTo(stage);
    this.shadow=new H.Mesh({geometry:new H.PlaneGeometry({width:5,height:3}),material:new H.BasicMaterial({lightType:'NONE',diffuse:new H.Color(.12,.26,.32),opacity:.22,compositing:{mode:'alpha-blend',premultiplied:false},state:{depthWrite:false}}),rotationX:-90,y:.18}).addTo(stage);
    this.sunGlow=document.createElement('div');this.sunGlow.className='sun-glow';document.body.appendChild(this.sunGlow);
  }

  async load(onProgress:(n:number,label:string)=>void):Promise<void> {
    let completed=0;
    await Promise.all(ASSETS.map(async key=>{
      const model=await new H.GLTFLoader().load({src:`${import.meta.env.BASE_URL}assets/${key}.glb`});
      await model.ready;
      this.art.apply(model.node,key!=='bird');
      this.assets.set(key,model.node);
      onProgress(++completed/ASSETS.length, key==='bird'?'燕子即将起飞':'正在绘制城市的颜色');
    }));
    this.buildCity();this.makeBird();this.makeEffects();
    this.weatherView=new WeatherView(this.stage,this.camera,this.clone('wind-ring'));
    this.weatherView.setQuality(this.quality);this.weatherView.setReducedFlashes(this.reducedFlashes);
  }

  private clone(key:AssetKey,parent:H.Node=this.stage):H.Node {
    const source=this.assets.get(key);if(!source)throw new Error(`缺少模型 ${key}`);
    const clone=source.clone();
    // Hilo Node.clone retains shared geometry/materials but resets mesh flags.
    clone.traverse(node=>{if(node instanceof H.Mesh){node.useInstanced=key!=='bird';node.castShadows=false;node.receiveShadows=false;}return H.Node.TRAVERSE_STOP_NONE;});
    return clone.addTo(parent);
  }

  private buildCity():void {
    const shadowGeometry=new H.PlaneGeometry({width:1,height:1});
    const shadowMaterial=new H.BasicMaterial({lightType:'NONE',diffuse:new H.Color(.10,.20,.28),opacity:.16,compositing:{mode:'alpha-blend',premultiplied:false},state:{depthWrite:false}});
    const ground=new H.Mesh({geometry:new H.PlaneGeometry({width:2100,height:5100}),material:this.art.toon([.70,.80,.77],'ground'),rotationX:-90,y:-1,z:-1750}).addTo(this.stage);
    this.ground=ground;
    ground.name='City foundation';
    for(const side of[-1,1]){
      const bank=new H.Mesh({name:'City bank ground',geometry:new H.PlaneGeometry({width:1005,height:5100}),material:this.art.toon([.70,.80,.77],'ground'),rotationX:-90,x:side*547.5,y:.12,z:-1750}).addTo(this.stage);
      this.banks.push(bank);
    }
    const water=new H.Mesh({geometry:new H.PlaneGeometry({width:24,height:5100}),material:this.art.water(),rotationX:-90,y:-.38,z:-1740,layer:2}).addTo(this.stage);
    this.water=water;
    water.name='Aoi canal';
    const dimensions=[[19,59.8,19],[15.2,41.5,18.6],[25.17,86,18.7],[23,34.05,23.6],[17.2,51.85,20.85]];
    const occupied:{x:number;z:number;w:number;d:number}[]=[];
    const keys:AssetKey[]=['building-a','building-b','building-c','building-d','building-e'];
    for(let row=0;row<76;row++) {
      const z=100-row*46;
      for(let side=-1;side<=1;side+=2) {
        for(let col=0;col<3;col++) {
          const riversidePark=((row>=23&&row<=29)||(row>=48&&row<=54))&&col===0&&side===(row<40?-1:1);
          if(riversidePark){
            for(let j=0;j<3;j++){const tree=this.clone('tree');tree.setPosition(side*(39+j*12),0,z+(j%2)*12);tree.setScale(1.65-j*.2);this.buildings.push({node:tree,z:tree.z});}
            continue;
          }
          const seed=row*19+col*7+(side+1)*153;
          const kind=Math.floor(random(seed+3)*5);
          const scale=.76+random(seed+4)*.5;
          const node=this.clone(keys[kind]!);
          const d=dimensions[kind]!;
          const center=51+col*44+random(seed+1)*8;
          const x=side*(col===0?Math.max(center,45+d[0]!*scale*.5+2):center);
          const dz=z+random(seed+2)*14;
          if(Math.abs(x)-d[0]!*scale*.5<94&&[-225,-1135,-2065,-2870].some(trackZ=>Math.abs(dz-trackZ)<d[2]!*scale*.5+9)){
            node.removeFromParent();continue;
          }
          node.setPosition(x,0,dz);node.setScale(scale);
          node.rotationY=side===1?180:0;
          this.buildings.push({node,z:dz});
          occupied.push({x,z:dz,w:d[0]!*scale,d:d[2]!*scale});
          if(col===0){
            this.obstacles.push({x,y:d[1]!*scale*.5,z:dz,w:d[0]!*scale,h:d[1]!*scale,d:d[2]!*scale});
            const shadow=new H.Mesh({geometry:shadowGeometry,material:shadowMaterial,rotationX:-90,rotationZ:30,x:x+12,y:.43,z:dz-12,scaleX:d[0]!*scale,scaleY:d[1]!*scale*.9,useInstanced:true}).addTo(this.stage);
            this.shadows.push({node:shadow,building:this.buildings[this.buildings.length-1]!});
          }
        }
        // Riverside trees establish scale without cluttering the flight corridor.
        if(row%2===0) {
          const tree=this.clone('tree');tree.setPosition(side*29,0,z+13);tree.setScale(1.25);
          this.buildings.push({node:tree,z:z+13});
        }
      }
    }
    // Road meshes are exactly 160m long. A separate world-aligned tile pool avoids
    // both coplanar overlaps and a discontinuity at the 3500m building-loop seam.
    for(let i=0;i<14;i++){
      const road=this.clone('road');road.setPosition(0,-.02,roadTileZ(0,i));this.roads.push(road);
    }
    const landmarks=[[-225,-450,1.7],[230,-1550,1.55],[-225,-2610,1.6]] as const;
    for(const [x,z,s]of landmarks)occupied.push({x,z,w:42*s,d:42*s});
    // A skyline with deterministic clearance from the main blocks and towers.
    for(let i=0;i<68;i++) {
      const scale=.8+random(i+350)*1.15,d=dimensions[i%5]!,w=d[0]!*scale,depth=d[2]!*scale;
      let x=0,z=0,accepted=false;
      for(let attempt=0;attempt<48;attempt++){
        x=(i%2?-1:1)*(185+random(i+700+attempt*37)*350);z=50-random(i+450+attempt*61)*3500;
        accepted=!occupied.some(box=>Math.abs(box.x-x)<(box.w+w)*.5+3&&[z-box.z,z-box.z-3500,z-box.z+3500].some(dz=>Math.abs(dz)<(box.d+depth)*.5+3));
        if(accepted)break;
      }
      if(!accepted)continue;
      const node=this.clone(keys[i%5]!);
      node.setPosition(x,0,z);node.setScale(scale);
      this.buildings.push({node,z});
      occupied.push({x,z,w,d:depth});
    }
    for(const [x,z,s] of landmarks) {
      const tower=this.clone('tower');tower.setPosition(x!,0,z!);tower.setScale(s!);this.buildings.push({node:tower,z:z!});
    }
    for(let i=0;i<38;i++) {
      const node=this.clone('cloud');
      const z=150-random(200+i)*4000;
      node.setPosition((random(i+60)-.5)*1800,125+random(i+70)*170,z);
      node.setScale(3+random(i+80)*6);
      this.clouds.push({node,z});
    }
    for(let i=0;i<7;i++) {
      const bird=this.clone('bird');bird.setScale(.21+random(i+300)*.12);
      const names=bird.getChildrenNameMap();
      this.ambientBirds.push({node:bird,left:names.Wing_L,right:names.Wing_R});
    }
    for(let i=0;i<38;i++){
      const node=this.clone(i%3===0?'urban-details':'car-red');
      const direction=i%2===0?1:-1;
      node.setPosition(direction*19.5,.12,-i*80);node.rotationY=direction===1?180:0;
      this.cars.push({node,seed:i*79,direction});
    }
    for(let i=0;i<8;i++){
      const node=this.clone('bridge'),z=-160-i*435;node.setPosition(0,0,z);
      this.buildings.push({node,z});
    }
    for(const [i,z]of[-225,-1135,-2065,-2870].entries()){
      const rail=this.clone('rail-viaduct');rail.setPosition(0,0,z);this.buildings.push({node:rail,z});
      const train=this.clone('train');train.setPosition(-40,15.55,z+2.65);
      this.trains.push({node:train,baseZ:z,phase:i*91+100});
      this.obstacles.push({x:0,y:16.5,z,w:180,h:4,d:11});
      for(const x of[-29,29])this.obstacles.push({x,y:7.5,z,w:3,h:15,d:4});
    }
    for(const [i,z]of[-620,-1460,-1780,-2530].entries()){
      const x=i%2===0?-35:35,node=this.clone('building-b');node.setScale(.62);node.setPosition(x,0,z);
      this.buildings.push({node,z});this.obstacles.push({x,y:13,z,w:9.5,h:26,d:11});
    }
    // Soft, shared billboard halos and pools make the authored street lights read at dusk.
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
    const ctx=canvas.getContext('2d')!;const gradient=ctx.createRadialGradient(32,32,0,32,32,32);
    gradient.addColorStop(0,'rgba(255,239,166,1)');gradient.addColorStop(.15,'rgba(255,198,99,.7)');gradient.addColorStop(.5,'rgba(250,169,68,.16)');gradient.addColorStop(1,'rgba(245,152,49,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
    const texture=new H.Texture({image:canvas,flipY:true});
    this.lampGlowMaterial=new H.BasicMaterial({lightType:'NONE',diffuse:texture,opacity:0,compositing:{mode:'additive',premultiplied:false},state:{depthWrite:false,cullMode:'none'}});
    this.lampPoolMaterial=new H.BasicMaterial({lightType:'NONE',diffuse:texture,opacity:0,compositing:{mode:'additive',premultiplied:false},state:{depthWrite:false,cullMode:'none'}});
    const glowGeometry=new H.PlaneGeometry({width:6,height:6}),poolGeometry=new H.PlaneGeometry({width:11,height:15});
    for(let i=0;i<72;i++)for(const side of[-1,1]){
      const z=70-i*48,node=this.clone('streetlamp');node.setPosition(side*26,.2,z);this.buildings.push({node,z});
      const glow=new H.Mesh({geometry:glowGeometry,material:this.lampGlowMaterial,x:side*26,y:6.6,z,useInstanced:true}).addTo(this.stage);
      const pool=new H.Mesh({geometry:poolGeometry,material:this.lampPoolMaterial,x:side*25,y:.44,z,rotationX:-90,useInstanced:true}).addTo(this.stage);
      this.lamps.push({glow,pool,z});
    }
  }

  private makeBird():void {
    this.bird=this.clone('bird');
    this.bird.setScale(1.28);
    const names=this.bird.getChildrenNameMap();
    this.leftWing=names.Wing_L;this.rightWing=names.Wing_R;this.scarf=names.Scarf;
  }

  setRings(rings:readonly FlightRing[]):void {
    if(this.rings.length===0) {
      for(const ring of rings) {
        const node=this.clone('wind-ring');node.setPosition(ring.x,ring.y,ring.z);this.rings.push(node);
      }
    }
    rings.forEach((ring,i)=>{const node=this.rings[i];if(node){node.setPosition(ring.x,ring.y,ring.z);node.visible=!ring.collected&&!ring.missed;}});
  }

  private makeEffects():void {
    const starCanvas=document.createElement('canvas');starCanvas.width=64;starCanvas.height=64;
    const star=starCanvas.getContext('2d')!;
    const glow=star.createRadialGradient(32,32,0,32,32,30);glow.addColorStop(0,'rgba(255,253,223,1)');glow.addColorStop(.3,'rgba(255,208,116,.75)');glow.addColorStop(1,'rgba(255,182,82,0)');star.fillStyle=glow;star.fillRect(0,0,64,64);
    star.fillStyle='#fffad6';star.beginPath();star.moveTo(32,3);star.lineTo(37,26);star.lineTo(61,32);star.lineTo(37,38);star.lineTo(32,61);star.lineTo(26,38);star.lineTo(3,32);star.lineTo(26,26);star.closePath();star.fill();
    const starTexture=new H.Texture({image:starCanvas,flipY:true});
    const gold=new H.BasicMaterial({name:'Sunlit motes',lightType:'NONE',diffuse:starTexture,compositing:{mode:'additive',premultiplied:false},state:{depthWrite:false,cullMode:'none'}});
    const white=new H.BasicMaterial({lightType:'NONE',diffuse:new H.Color(.85,1,1),opacity:.27,compositing:{mode:'alpha-blend',premultiplied:false},state:{depthWrite:false,cullMode:'none'}});
    for(let i=0;i<90;i++) {
      const mesh=new H.Mesh({geometry:this.spawnSpark,material:gold,useInstanced:true,visible:false}).addTo(this.stage);
      this.sparkles.push({mesh,life:0,duration:1,vx:0,vy:0,vz:0});
    }
    const windGeometry=new H.PlaneGeometry({width:.022,height:1});
    for(let i=0;i<48;i++)this.wind.push(new H.Mesh({geometry:windGeometry,material:white,useInstanced:true,rotationX:90}).addTo(this.stage));
    // Continuous wingtip ribbons use a bounded history; only positions are streamed.
    for(const side of [-1,1]) {
      const segments=32,data=new Float32Array(segments*2*3),indices:number[]=[];
      for(let i=0;i<segments-1;i++){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}
      const geo=new H.Geometry({vertices:new H.GeometryData(data,3),indices:new H.GeometryData(new Uint16Array(indices),1)});
      const mesh=new H.Mesh({geometry:geo,material:white,frustumTest:false}).addTo(this.stage);
      this.ribbons.push({mesh,data,history:Array.from({length:segments},()=>new H.Vector3(0,36,0)),side});
    }
  }

  event(event:FlightEvent):void {
    this.weatherView?.event(event);
    if(event.type==='hit')this.shake=.7;
    if(event.type==='start'){
      this.previousState='title';this.shake=0;
      for(const ribbon of this.ribbons)for(const p of ribbon.history)p.set(0,36,0);
      for(const spark of this.sparkles){spark.life=0;spark.mesh.visible=false;}
    }
    if(event.type!=='ring'&&event.type!=='hit'&&event.type!=='nearMiss')return;
    let count=event.type==='ring'?30:15;
    for(const p of this.sparkles) {
      if(p.life>0)continue;
      const i=count;
      p.life=p.duration=.65+random(i+this.time)*.8;
      p.vx=(random(i+34+this.time)-.5)*20;
      p.vy=(random(i+71+this.time)-.25)*15;
      p.vz=(random(i+98+this.time)-.5)*20;
      p.mesh.setPosition(event.x,event.y,event.z);p.mesh.setScale(.10+random(i+50)*.26);p.mesh.visible=true;
      if(--count<=0)break;
    }
  }
  setTheme(theme:'dawn'|'dusk'):void {this.targetTheme=theme==='dusk'?1:0;}
  setQuality(value:'high'|'medium'|'low'):void {this.quality=value;this.weatherView?.setQuality(value);}
  setReducedFlashes(value:boolean):void {this.reducedFlashes=value;this.weatherView?.setReducedFlashes(value);}

  update(dt:number,state:GameState,rings:readonly FlightRing[],photo=false):void {
    const active=state.status==='playing';
    if(active||state.status==='title')this.time+=dt;
    this.pausedTime+=dt;
    const time=this.time,p=state.player;
    const title=state.status==='title';
    if(title) {
      const portrait=this.camera.aspect<1;
      this.bird.setScale(portrait?1.45:1.65);
      this.bird.setPosition((portrait?-.3:10)+Math.sin(time*.22)*(portrait?.25:.8),(portrait?61:49)+Math.sin(time*1.7)*.35,27);
      this.bird.setRotation(7,156,-12+Math.sin(time*.8)*3);
      this.camera.setPosition(0+Math.sin(time*.09)*2,54,55);
      this.look.set(-2,43,-120);this.camera.lookAt(this.look);
    } else {
      this.bird.setScale(1.28);
      this.bird.setPosition(p.x,p.y+Math.sin(time*8)*.055,p.z);
      this.bird.setRotation(p.pitch,p.vx*-.5,p.roll);
      if(!photo) {
        const blend=1-Math.exp(-dt*5);
        const targetX=p.x*.8,targetY=p.y+7.0,targetZ=p.z+(state.boosting?22:18);
        if(this.previousState==='title'){this.camera.setPosition(targetX,targetY,targetZ);}
        this.camera.x+=(targetX-this.camera.x)*blend;
        this.camera.y+=(targetY-this.camera.y)*blend;
        this.camera.z+=(targetZ-this.camera.z)*Math.max(blend,.2);
        this.look.set(p.x+p.vx*.32,p.y+3,p.z-48);this.camera.lookAt(this.look);
        this.camera.fov+=( (state.boosting?64:55)-this.camera.fov)*blend;
      }
    }
    const flap=state.boosting?Math.sin(time*19)*31:Math.sin(time*7.5)*19+6;
    if(this.leftWing)this.leftWing.rotationZ=-flap;
    if(this.rightWing)this.rightWing.rotationZ=flap;
    if(this.scarf)this.scarf.rotationX=Math.sin(time*10)*9;
    this.bird.visible=photo||!(state.invulnerable>0&&Math.floor(this.pausedTime*12)%2===0);
    // The old flat bird shadow intersected pavement paint. The flight silhouette
    // and wing trails already communicate height without another ground decal.
    this.shadow.visible=false;
    if(this.shake>0&&!photo){this.camera.x+=Math.sin(time*60)*this.shake*.35;this.camera.y+=Math.cos(time*48)*this.shake*.2;this.shake=Math.max(0,this.shake-dt*2);}
    this.sky.setPosition(this.camera.x,this.camera.y,this.camera.z);
    this.weatherView?.update(dt,state);
    this.art.update(this.camera,time,dt,this.targetTheme,state.weather,this.weatherView?.flash??0);
    this.sunGlow.style.opacity=String((.35+this.art.theme*.15)*(state.weather==='clear'?1:.12));
    const cz=title?0:p.z;
    const distanceLimit=this.quality==='low'?650:1150;
    for(let i=0;i<this.roads.length;i++){
      const road=this.roads[i]!;road.z=roadTileZ(cz,i);
      road.visible=road.z<cz+200&&road.z>cz-distanceLimit-160;
    }
    const free=state.mode==='free'&&!title;
    const wrap=(z:number):number=>cz+((z-cz+3250)%3500+3500)%3500-3250;
    for(const item of this.buildings){
      const z=free?wrap(item.z):item.z;item.node.z=z;
      item.node.visible=z<cz+160&&z>cz-distanceLimit;
    }
    for(const item of this.shadows){item.node.visible=item.building.node.visible&&state.weather==='clear';item.node.z=item.building.node.z-12;}
    for(const car of this.cars){
      car.node.z=cz+((-car.seed+time*car.direction*8-cz+1300)%1600+1600)%1600-1300;
      car.node.visible=car.node.z<cz+60&&this.quality!=='low';
    }
    for(const train of this.trains){
      train.node.z=free?wrap(train.baseZ):train.baseZ;
      train.node.x=-115+(time*10+train.phase)%230;
      train.node.visible=train.node.z<cz+100&&train.node.z>cz-900;
    }
    const lamplight=Math.max(this.art.theme,state.weather==='storm'?.85:state.weather==='rain'?.4:0);
    if(this.lampGlowMaterial)this.lampGlowMaterial.opacity=lamplight*.83;
    if(this.lampPoolMaterial)this.lampPoolMaterial.opacity=lamplight*.30;
    for(const lamp of this.lamps){
      lamp.glow.z=lamp.pool.z=free?wrap(lamp.z):lamp.z;
      lamp.glow.visible=lamp.pool.visible=lamplight>.03&&lamp.glow.z<cz+40&&lamp.glow.z>cz-420;
      lamp.glow.quaternion.copy(this.camera.quaternion);
    }
    for(const [i,item]of this.clouds.entries()){
      const z=free?wrap(item.z):item.z;item.node.z=z;
      item.node.visible=z<cz+700&&z>cz-1400;item.node.x+=Math.sin(i+1)*dt*.3;
    }
    if(this.ground)this.ground.z=cz-1500;
    for(const bank of this.banks)bank.z=cz-1500;
    if(this.water)this.water.z=cz-1500;
    rings.forEach((ring,i)=>{
      const node=this.rings[i];if(!node)return;
      node.visible=!ring.collected&&!ring.missed&&ring.z<cz+15&&ring.z>cz-750;
      node.rotationZ=Math.sin(time*.7+i)*4;
      const scale=1+Math.sin(time*2.4+i)*.015;node.setScale(scale);
    });
    for(const [i,b]of this.ambientBirds.entries()) {
      b.node.setPosition(-35+i*12+Math.sin(time*.3+i)*6,69+Math.sin(time*.45+i)*3,cz-150-i*24);
      b.node.rotationZ=Math.sin(time*2+i)*12;
      if(b.left)b.left.rotationZ=-Math.sin(time*10+i)*25;
      if(b.right)b.right.rotationZ=Math.sin(time*10+i)*25;
    }
    for(const spark of this.sparkles) {
      if(spark.life<=0){spark.mesh.visible=false;continue;}
      if(active)spark.life-=dt;
      if(active){spark.mesh.x+=spark.vx*dt;spark.mesh.y+=spark.vy*dt;spark.mesh.z+=spark.vz*dt;spark.mesh.rotationZ+=dt*90;}
      spark.mesh.setScale(Math.max(.01,spark.life/spark.duration)*.28);
      spark.mesh.quaternion.copy(this.camera.quaternion);
    }
    for(const [i,wind]of this.wind.entries()) {
      wind.visible=active&&(state.boosting||i<12);
      const speed=state.boosting?80:25;
      wind.setPosition(p.x+(random(i+130)-.5)*65,p.y+(random(i+180)-.5)*30,p.z-70+((time*speed+i*7)%100));
      wind.scaleY=state.boosting?7:2;
    }
    for(const ribbon of this.ribbons) {
      ribbon.mesh.visible=active;
      if(!active)continue;
      const history=ribbon.history;
      for(let i=history.length-1;i>0;i--)history[i]!.copy(history[i-1]!);
      history[0]!.set(p.x+ribbon.side*3.15,p.y+.1,p.z+.2);
      for(let i=0;i<history.length;i++){
        const position=history[i]!,width=(1-i/history.length)*(state.boosting?.075:.035);
        ribbon.data[i*6]=position.x-width;ribbon.data[i*6+1]=position.y;ribbon.data[i*6+2]=position.z;
        ribbon.data[i*6+3]=position.x+width;ribbon.data[i*6+4]=position.y+.01;ribbon.data[i*6+5]=position.z;
      }
      if(ribbon.mesh.geometry?.vertices)ribbon.mesh.geometry.vertices.isDirty=true;
    }
    this.previousState=state.status;
  }
  getBirdPosition(target:H.Vector3):H.Vector3{return target.set(this.bird.x,this.bird.y,this.bird.z);}
  dispose():void{this.sunGlow.remove();}
}
