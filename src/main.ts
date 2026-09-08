import * as H from 'hilo3d';
import './style.css';
import { FlightGame, type WeatherMode } from './game';
import { FlightInput } from './input';
import { createUI, type Theme, type TouchAction } from './ui';
import { FlightWorld } from './hilo/world';
import { Soundscape } from './sound';

async function main():Promise<void> {
  const app=document.querySelector<HTMLElement>('#app');if(!app)throw new Error('缺少游戏容器');
  const game=new FlightGame(), sound=new Soundscape();
  const savedWeather=readPreference('weather');
  if(savedWeather==='rain'||savedWeather==='snow'||savedWeather==='storm')game.setWeather(savedWeather);
  let reducedFlashes=readPreference('reduced-flashes')===null?matchMedia('(prefers-reduced-motion: reduce)').matches:readPreference('reduced-flashes')==='true';
  let world:FlightWorld|undefined, stage:H.Stage|undefined, input:FlightInput|undefined;
  let theme:Theme='dawn', photo=false, photoWasPlaying=false, ready=false;
  let riverPhoto=false;
  let controls:H.OrbitControls|undefined;
  let quality:'high'|'medium'|'low'='high';
  const touches=new Set<TouchAction>();
  const ui=createUI({
    onStart:mode=>{if(!ready)return;game.start(mode);world?.setRings(game.rings);input?.clear();sound.start();ui.toast(mode==='free'?'随风而行，世界没有终点。':'穿过金色风环，把风的来信送往远方。');},
    onPause:()=>{game.pause();input?.clear();},
    onResume:()=>{game.resume();input?.clear();},
    onRestart:()=>{exitPhoto();game.restart();world?.setRings(game.rings);input?.clear();},
    onTheme:value=>{theme=value;world?.setTheme(value);ui.setTheme(value);savePreference('theme',value);},
    onWeather:value=>{game.setWeather(value);ui.setWeather(value);savePreference('weather',value);},
    onReducedFlashes:value=>{reducedFlashes=value;world?.setReducedFlashes(value);savePreference('reduced-flashes',String(value));},
    onSound:enabled=>{sound.setEnabled(enabled);savePreference('sound',String(enabled));},
    onPhoto:()=>togglePhoto(),
    onQuality:value=>{quality=value;world?.setQuality(value);resize();savePreference('quality',value);},
    onTouch:(action,active)=>{if(active)touches.add(action);else touches.delete(action);input?.setVirtualInput(Number(touches.has('right'))-Number(touches.has('left')),Number(touches.has('up'))-Number(touches.has('down')),touches.has('boost'));},
  });
  ui.setWeather(game.state.weather);ui.setReducedFlashes(reducedFlashes);
  document.querySelector('#loading')?.remove();
  const camera=new H.PerspectiveCamera({fov:54,aspect:innerWidth/innerHeight,near:1,far:1800,x:0,y:54,z:55});
  const backend=new URL(location.href).searchParams.get('backend');
  ui.setLoading(.01,'正在准备天空');
  // A browser can leave its GPU capability request pending. Offer an explicit
  // compatibility entry without changing an already selected backend silently.
  let compatibility:HTMLButtonElement|undefined;
  const slowStartup=window.setTimeout(()=>{
    if(backend==='webgl2')return;
    ui.setLoading(.02,app.querySelector('canvas')?'正在初始化图形设备':'正在连接图形设备');
    compatibility=document.createElement('button');compatibility.className='loading-compatibility';
    compatibility.textContent='图形设备响应较慢 · 使用兼容模式';
    compatibility.onclick=()=>{const url=new URL(location.href);url.searchParams.set('backend','webgl2');location.assign(url.href);};
    document.querySelector('.title-content')?.appendChild(compatibility);
  },15000);
  try {
  stage=await H.Stage.create({backend:backend==='webgl2'||backend==='webgpu'?backend:'auto',container:app,camera,
    width:innerWidth,height:innerHeight,pixelRatio:Math.min(devicePixelRatio,1.5),antialias:true,
    clearColor:new H.Color(.65,.83,.9),useInstanced:true,
    renderPipeline:new H.PostProcessRenderPipelineFactory({opaqueTexture:false,bloom:{threshold:1.05,intensity:.22,scatter:.65,maxLevels:4},colorUber:{toneMapping:'none',exposure:0,saturation:.025,dithering:true}})
  });
  } finally {window.clearTimeout(slowStartup);compatibility?.remove();}
  world=new FlightWorld(stage,camera);
  world.setReducedFlashes(reducedFlashes);
  await world.load((progress,label)=>ui.setLoading(.05+progress*.92,label));
  game.setObstacles(world.obstacles);game.setObstacleLoopLength(3500);
  world.setRings(game.rings);
  input=new FlightInput(app.querySelector('canvas')!);
  controls=new H.OrbitControls(stage,{camera,target:new H.Vector3(0,36,0),minDistance:5,maxDistance:100});
  controls.disable();
  const savedTheme=readPreference('theme');
  if(savedTheme==='dusk'){theme='dusk';world.setTheme(theme);ui.setTheme(theme);}
  if(readPreference('sound')==='false')sound.setEnabled(false);
  const savedQuality=readPreference('quality');
  if(savedQuality==='medium'||savedQuality==='low'){quality=savedQuality;world.setQuality(quality);}
  resize();
  let accumulator=0,last=performance.now(),frame=0,raf=0,destroyed=false,frameMs=16.7,runtimeError=false;
  const diagnostics={backend:stage.renderer.backend,fps:60,ready:true,version:H.version};
  const probe=document.createElement('output');probe.id='sora-diagnostics';probe.hidden=true;
  probe.dataset.backend=diagnostics.backend;document.body.appendChild(probe);
  function loop(now:number):void {
    if(destroyed||runtimeError)return;
    try {
    const dt=Math.max(0,Math.min((now-last)/1000,.05));last=now;frameMs+=(dt*1000-frameMs)*.03;
    const actions=input!.sample();accumulator+=dt;
    while(accumulator>=1/60){game.step(1/60,actions);accumulator-=1/60;}
    for(const event of game.drainEvents()){
      world!.event(event);sound.event(event.type,event.value??0);
      if(event.type==='ring')ui.toast(game.state.combo>1?`风的回信  +${event.value??100}  ·  ${game.state.combo} 连击`:`收到一封风的来信  +${event.value??100}`);
      if(event.type==='hit')ui.toast('轻轻振翅，重新回到风中');
      if(event.type==='nearMiss')ui.toast(`掠翼而过  +${event.value??50}`);
      if(event.type==='task')ui.toast(`委托完成 · ${game.state.deliveryTask.name}  +${event.value??600}`);
      if(event.type==='win'||event.type==='lose')saveBest(game.state.score);
    }
    if(game.state.mode==='free')world!.setRings(game.rings);
    world!.update(dt,game.state,game.rings,photo);sound.update(game.state.boosting,game.state.status==='playing',game.state.weather);
    if(frame++%4===0){ui.update(game.state);diagnostics.fps=Math.round(1000/frameMs);}
    if(frame%60===0){probe.dataset.fps=String(diagnostics.fps);probe.dataset.state=JSON.stringify(game.state);probe.dataset.renderInfo=JSON.stringify(stage!.renderer.renderInfo);}
    stage!.tick(dt*1000);
    raf=requestAnimationFrame(loop);
    } catch(error){runtimeError=true;showFailure(error);}
  }
  function resize():void {
    if(!stage)return;const ratio=quality==='high'?1.5:quality==='medium'?1.15:.85;
    stage.resize(Math.max(1,innerWidth),Math.max(1,innerHeight),Math.min(devicePixelRatio,ratio));camera.aspect=innerWidth/Math.max(1,innerHeight);
  }
  function exitPhoto():void {
    if(!photo)return;photo=false;riverPhoto=false;controls?.disable();ui.setPhoto(false);if(photoWasPlaying)game.resume();
  }
  function togglePhoto():void {
    if(!ready||game.state.status==='title')return;if(photo){exitPhoto();return;}
    photoWasPlaying=game.state.status==='playing';game.pause();input?.clear();photo=true;
    const target=world!.getBirdPosition(new H.Vector3());controls?.setView(camera.position.clone(),target);controls?.enable();ui.setPhoto(true);
  }
  const onKey=(event:KeyboardEvent):void=>{
    if(event.repeat)return;if(event.target instanceof HTMLInputElement||event.target instanceof HTMLSelectElement)return;
    if(event.code==='Escape'){event.preventDefault();if(photo)exitPhoto();else if(game.state.status==='playing')game.pause();else if(game.state.status==='paused')game.resume();input?.clear();}
    if(event.code==='KeyE'){theme=theme==='dawn'?'dusk':'dawn';world?.setTheme(theme);ui.setTheme(theme);savePreference('theme',theme);}
    if(event.code==='KeyF')togglePhoto();
    if(event.code==='KeyC'&&photo){
      riverPhoto=!riverPhoto;
      const p=game.state.player;
      if(riverPhoto)controls?.setView(new H.Vector3(1,5,p.z+18),new H.Vector3(-3,7,p.z-85));
      else controls?.setView(new H.Vector3(p.x,p.y+7,p.z+18),new H.Vector3(p.x,p.y,p.z));
    }
    if(event.code==='KeyT'){
      const modes:WeatherMode[]=['clear','rain','snow','storm'];const next=modes[(modes.indexOf(game.state.weather)+1)%4]!;
      game.setWeather(next);ui.setWeather(next);savePreference('weather',next);
    }
    if(event.code==='KeyR'&&game.state.status!=='title'){exitPhoto();game.restart();world?.setRings(game.rings);input?.clear();}
  };
  const onVisibility=():void=>{if(document.hidden){game.pause();input?.clear();sound.update(false,false,game.state.weather);}last=performance.now();accumulator=0;};
  const onBlur=():void=>{if(!photo){game.pause();input?.clear();}};
  window.addEventListener('resize',resize);window.addEventListener('keydown',onKey);window.addEventListener('blur',onBlur);document.addEventListener('visibilitychange',onVisibility);
  function destroy():void {
    if(destroyed)return;destroyed=true;cancelAnimationFrame(raf);controls?.dispose();input?.dispose();sound.dispose();world?.dispose();ui.dispose();stage?.destroy();probe.remove();
    window.removeEventListener('resize',resize);window.removeEventListener('keydown',onKey);window.removeEventListener('blur',onBlur);document.removeEventListener('visibilitychange',onVisibility);
  }
  const onPageHide=(event:PageTransitionEvent):void=>{if(!event.persisted)destroy();};
  window.addEventListener('pagehide',onPageHide);if(import.meta.hot)import.meta.hot.dispose(()=>{window.removeEventListener('pagehide',onPageHide);destroy();});
  Object.defineProperty(window,'sora',{configurable:true,value:{get state(){return structuredClone(game.state);},get diagnostics(){return {...diagnostics,renderInfo:stage?.renderer.renderInfo};},destroy}});
  world.update(0,game.state,game.rings);stage.tick(0);
  ready=true;ui.setReady();ui.update(game.state);raf=requestAnimationFrame(loop);
}
function readPreference(key:string):string|null{try{return localStorage.getItem(`sora-${key}`);}catch{return null;}}
function savePreference(key:string,value:string):void{try{localStorage.setItem(`sora-${key}`,value);}catch{}}
function saveBest(score:number):void{const best=Number(readPreference('best')??0);if(score>best)savePreference('best',String(score));}
function showFailure(error:unknown):void {
  console.error('[SORA]',error);const panel=document.createElement('div');panel.className='startup-error';panel.setAttribute('role','alert');
  const heading=document.createElement('h2');heading.textContent='天空暂时没有准备好';
  const details=document.createElement('p');details.textContent=error instanceof Error?error.message:String(error);
  const retry=document.createElement('button');retry.textContent='重新启程';retry.onclick=()=>location.reload();panel.append(heading,details,retry);document.body.appendChild(panel);
}
void main().catch(showFailure);
