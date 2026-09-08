import type { WeatherMode } from './game';
/** Original synthesized pentatonic score, wind, rainfall and thunder. */
export class Soundscape {
  private context:AudioContext|undefined;
  private master:GainNode|undefined;
  private wind:GainNode|undefined;
  private rain:GainNode|undefined;
  private thunderBuffer:AudioBuffer|undefined;
  private weather:WeatherMode='clear';
  private enabled=true;
  private timer:ReturnType<typeof setInterval>|undefined;
  private beat=0;
  private playing=false;
  private boosting=false;
  start():void {
    if(!this.context){
      this.context=new AudioContext();this.master=this.context.createGain();this.master.gain.value=this.enabled ? .45 : 0;this.master.connect(this.context.destination);
      const buffer=this.context.createBuffer(1,this.context.sampleRate*2,this.context.sampleRate),data=buffer.getChannelData(0);
      let last=0;for(let i=0;i<data.length;i++){last=(last+(Math.random()*2-1)*.018)/1.02;data[i]=last*2.1;}
      this.thunderBuffer=buffer;
      const noise=this.context.createBufferSource();noise.buffer=buffer;noise.loop=true;
      const filter=this.context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=700;
      this.wind=this.context.createGain();this.wind.gain.value=.18;noise.connect(filter);filter.connect(this.wind);this.wind.connect(this.master);noise.start();
      const rainBuffer=this.context.createBuffer(1,this.context.sampleRate*2,this.context.sampleRate),rainData=rainBuffer.getChannelData(0);
      for(let i=0;i<rainData.length;i++)rainData[i]=(Math.random()*2-1)*.35;
      const rainSource=this.context.createBufferSource();rainSource.buffer=rainBuffer;rainSource.loop=true;
      const rainFilter=this.context.createBiquadFilter();rainFilter.type='highpass';rainFilter.frequency.value=850;
      this.rain=this.context.createGain();this.rain.gain.value=0;rainSource.connect(rainFilter);rainFilter.connect(this.rain);this.rain.connect(this.master);rainSource.start();
      this.timer=setInterval(()=>this.music(),720);
    }
    void this.context.resume();
  }
  setEnabled(value:boolean):void{this.enabled=value;if(value)this.start();this.master?.gain.setTargetAtTime(value ? .45 : 0,this.context?.currentTime??0,.2);}
  update(boosting:boolean,playing:boolean,weather:WeatherMode='clear'):void{
    if(this.playing===playing&&this.boosting===boosting&&this.weather===weather)return;
    this.playing=playing;this.boosting=boosting;this.weather=weather;
    if(this.context){
      this.wind?.gain.setTargetAtTime(playing?(boosting?.52:weather==='storm'?.42:weather==='snow'?.12:.18):.035,this.context.currentTime,.6);
      this.rain?.gain.setTargetAtTime(playing?(weather==='storm'?.55:weather==='rain'?.3:0):0,this.context.currentTime,.8);
    }
  }
  private note(frequency:number,length:number,volume:number,delay=0):void {
    const ctx=this.context,master=this.master;if(!ctx||!master)return;
    const oscillator=ctx.createOscillator(),gain=ctx.createGain(),at=ctx.currentTime+delay;oscillator.type='sine';oscillator.frequency.value=frequency;
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(volume,at+.012);gain.gain.exponentialRampToValueAtTime(.0001,at+length);
    oscillator.connect(gain);gain.connect(master);oscillator.start(at);oscillator.stop(at+length+.1);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  }
  private music():void {
    if(!this.playing||!this.enabled)return;
    const melody=[0,7,12,14,12,7,4,2,0,4,7,9,7,4,2,-3];const semitone=melody[this.beat%melody.length]??0;
    this.note(261.63*Math.pow(2,semitone/12),2.4,.047);if(this.beat%4===0){this.note(130.81,3,.05);this.note(196,3,.018,.1);}this.beat++;
  }
  event(type:string,value:number):void {
    if(!this.enabled)return;
    if(type==='ring'){const f=660*Math.pow(2,Math.min(value/100,8)/12);this.note(f,.55,.13);this.note(f*1.5,.8,.09,.09);}
    if(type==='hit'){this.note(110,.3,.2);this.note(87,.5,.15,.06);}
    if(type==='nearMiss')this.note(880,.3,.07);
    if(type==='task')for(const [i,f]of[659.25,783.99,987.77].entries())this.note(f,1.0,.12,i*.11);
    if(type==='lightning'&&this.context&&this.master&&this.thunderBuffer){
      const at=this.context.currentTime+.18,source=this.context.createBufferSource(),filter=this.context.createBiquadFilter(),gain=this.context.createGain();
      source.buffer=this.thunderBuffer;source.playbackRate.value=.6;filter.type='lowpass';filter.frequency.value=320;
      gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(2.1,at+.06);gain.gain.exponentialRampToValueAtTime(.001,at+2.5);
      source.connect(filter);filter.connect(gain);gain.connect(this.master);source.start(at);source.stop(at+2.6);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
    }
    if(type==='win')for(const [i,f]of[523.25,659.25,783.99,1046.5].entries())this.note(f,1.6,.15,i*.16);
  }
  dispose():void{if(this.timer)clearInterval(this.timer);void this.context?.close();}
}
