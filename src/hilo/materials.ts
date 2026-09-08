import * as H from 'hilo3d';
import { createWaterMaterial } from './water-material';
import type { WeatherMode } from '../game';

// The entire art direction shares one portable GLSL/std140 atmosphere block.
H.registerUniformBlockBinding('SoraAtmosphere');
H.registerUniformBlockBinding('SoraPigment');
const atmosphereLayout = H.createStd140Layout({ eye: 'vec4', weather: 'vec4', climate:'vec4' });
const pigmentLayout = H.createStd140Layout({ pigment: 'vec4', traits: 'vec4' });
const atmosphereGLSL = `layout(std140) uniform SoraAtmosphere { vec4 eye; vec4 weather; vec4 climate; };`;
const matrices = `
layout(std140) uniform CameraBlock { mat4 u_viewMatrix; mat4 u_projectionMatrix; mat4 u_viewProjectionMatrix; };
#ifdef SORA_INSTANCED
  #ifdef HILO_WEBGPU
    layout(std140) uniform InstanceBlock { mat4 soraModels[128]; };
    #define u_modelMatrix soraModels[gl_InstanceIndex]
  #else
    in mat4 u_modelMatrix;
  #endif
#else
  layout(std140) uniform ModelBlock { mat4 u_modelMatrix; };
#endif
`;
const vertex = `
precision highp float;
${matrices}
in vec3 a_position;
in vec3 a_normal;
out vec3 worldPosition;
out vec3 worldNormal;
void main() {
  vec4 world = u_modelMatrix * vec4(a_position, 1.0);
  worldPosition = world.xyz;
  worldNormal = normalize(transpose(inverse(mat3(u_modelMatrix))) * a_normal);
  gl_Position = u_viewProjectionMatrix * world;
}`;
const fragment = `
precision highp float;
${atmosphereGLSL}
layout(std140) uniform SoraPigment { vec4 pigment; vec4 traits; };
in vec3 worldPosition;
in vec3 worldNormal;
layout(location=0) out vec4 outColor;
void main() {
  vec3 n = normalize(worldNormal);
  vec3 viewDir = normalize(eye.xyz - worldPosition);
  float dusk = weather.x;
  vec3 sun = normalize(mix(vec3(-0.65,0.85,0.40), vec3(-0.9,0.45,-0.3),dusk));
  float light = dot(n,sun);
  float band = smoothstep(-0.06,0.015,light)*0.22 + smoothstep(0.52,0.55,light)*0.12;
  vec3 shadowTint = mix(vec3(0.60,0.78,0.89),vec3(0.54,0.49,0.73),dusk);
  vec3 sunTint = mix(vec3(1.06,1.02,0.91),vec3(1.22,0.91,0.68),dusk);
  vec3 color = pigment.rgb * mix(shadowTint,sunTint,band+0.44);
  float rim = pow(1.0-max(0.0,dot(n,viewDir)),3.5)*max(0.0,light+0.28);
  color += mix(vec3(0.12,0.19,0.17),vec3(0.31,0.16,0.08),dusk)*rim;
  float glass = traits.x;
  float reflection = smoothstep(0.45,0.48,sin(worldPosition.y*0.08+worldPosition.x*0.023+worldPosition.z*0.024));
  color += glass * (vec3(0.09,0.16,0.17)*reflection + vec3(0.17,0.13,0.05)*dusk);
  color = mix(color,pigment.rgb,traits.y);
  color = mix(color,color*vec3(.66,.75,.86)+vec3(.02,.025,.04),climate.x*.68+climate.w*.14);
  float snowCap=smoothstep(.30,.75,n.y)*traits.w*climate.y;
  color=mix(color,vec3(.90,.95,.98)*(0.84+band*.4),snowCap*.93);
  float wetSheen=pow(max(0.0,dot(reflect(-sun,n),viewDir)),24.0);
  color+=vec3(.12,.19,.22)*wetSheen*climate.x;
  color += pigment.rgb * traits.z * (0.15 + dusk*0.65+climate.w*.35);
  float fog = smoothstep(mix(100.0,40.0,climate.w),mix(1050.0,630.0,climate.w),distance(eye.xyz,worldPosition));
  vec3 mist = mix(vec3(0.76,0.88,0.88),vec3(0.87,0.66,0.61),dusk);
  mist=mix(mist,mix(vec3(.47,.59,.65),vec3(.38,.43,.53),dusk),climate.w*.84);
  mist=mix(mist,vec3(.73,.83,.88),climate.y*.75);
  color = mix(color,mist,fog*0.93);
  color+=vec3(.25,.31,.38)*climate.z;
  outColor = vec4(pow(max(color,vec3(0.0)),vec3(2.2)),1.0);
}`;

export class ArtMaterials {
  readonly atmosphere = H.UniformBuffer.fromSchema(atmosphereLayout, { eye:[0,40,20,0],weather:[0,0,0,0],climate:[0,0,0,0] });
  readonly cache = new Map<string,H.ShaderMaterial>();
  private readonly eye = new Float32Array(4);
  private readonly weather = new Float32Array(4);
  private readonly climate = new Float32Array(4);
  theme=0;
  update(camera:H.PerspectiveCamera,time:number,dt:number,target:number,mode:WeatherMode='clear',flash=0):void {
    this.theme += (target-this.theme)*(1-Math.exp(-dt*2.0));
    this.eye[0]=camera.x; this.eye[1]=camera.y; this.eye[2]=camera.z;
    this.weather[0]=this.theme; this.weather[1]=time;
    const blend=1-Math.exp(-dt*1.6);
    this.climate[0]=this.climate[0]!+((mode==='rain'||mode==='storm'?1:0)-this.climate[0]!)*blend;
    this.climate[1]=this.climate[1]!+((mode==='snow'?1:0)-this.climate[1]!)*blend;
    this.climate[2]=Math.min(1,flash);
    this.climate[3]=this.climate[3]!+((mode==='clear'?0:mode==='storm'?1:.7)-this.climate[3]!)*blend;
    this.atmosphere.set('eye',this.eye).set('weather',this.weather).set('climate',this.climate);
  }
  toon(color:readonly number[],name='',unlit=false,instanced=false):H.ShaderMaterial {
    const glass=/glass|window|blue|aqua/i.test(name)?1:0;
    const emissive=/Lamp_Glow|headlight|train.*light/i.test(name)?2.8:/gold|light|lamp|glow|emission/i.test(name)?0.5:0;
    const snowSurface=(instanced||name==='ground')&&!/lamp|glow|light|gold|car|train/i.test(name)?1:0;
    const key=`${color.join(',')}/${glass}/${emissive}/${unlit}/${instanced}/${snowSurface}`;
    const cached=this.cache.get(key); if(cached) return cached;
    const buffer=H.UniformBuffer.fromSchema(pigmentLayout,{pigment:[color[0]??1,color[1]??1,color[2]??1,1],traits:[glass,unlit?1:0,emissive,snowSurface]});
    // Custom GLSL materials need an explicit variant: Hilo's automatic HILO_INSTANCED
    // define is emitted only for its built-in shader families.
    const mat=new H.ShaderMaterial({name:`Cel / ${name}`,vs:vertex,fs:fragment,
      defines:instanced?{SORA_INSTANCED:1}:{},
      attributes:{a_position:'POSITION',a_normal:'NORMAL'},uniforms:{u_modelMatrix:'MODEL'},
      uniformBlocks:{SoraAtmosphere:this.atmosphere,SoraPigment:buffer}});
    this.cache.set(key,mat); return mat;
  }
  apply(root:H.Node,instanced=true):void {
    root.traverse(node=>{
      if(node instanceof H.Mesh) {
        const original=node.material;
        const pbr=original as H.PBRMaterial;
        const color=pbr.baseColor instanceof H.Color ? pbr.baseColor : new H.Color(.7,.8,.85);
        // glTF base-color factors contain the artist's intentionally selected palette.
        node.material=this.toon([color.r,color.g,color.b],original?.name??node.name,false,instanced);
        node.useInstanced=instanced;
        node.castShadows=false; node.receiveShadows=false;
      }
      return H.Node.TRAVERSE_STOP_NONE;
    });
  }
  sky():H.ShaderMaterial {
    return new H.ShaderMaterial({
      name:'Painted sky / sun halo', cullMode:'front', state:{depthWrite:false},
      attributes:{a_position:'POSITION'}, uniformBlocks:{SoraAtmosphere:this.atmosphere},
      // Keep precision on its own line for the portable GLSL-to-WebGPU preprocessor.
      vs:`precision highp float;
      ${matrices} in vec3 a_position; out vec3 direction; void main(){ direction=a_position; gl_Position=u_viewProjectionMatrix*u_modelMatrix*vec4(a_position,1.0); }`,
      fs:`precision highp float;
      ${atmosphereGLSL} in vec3 direction; layout(location=0) out vec4 outColor;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p), f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){
        vec3 d=normalize(direction); float dusk=weather.x;
        float h=clamp(d.y,0.0,1.0);
        vec3 low=mix(vec3(.84,.94,.91),vec3(1.0,.73,.53),dusk);
        vec3 high=mix(vec3(.20,.62,.79),vec3(.36,.40,.64),dusk);
        low=mix(low,mix(vec3(.55,.66,.72),vec3(.40,.44,.56),dusk),climate.w*.94);
        high=mix(high,mix(vec3(.23,.34,.45),vec3(.18,.22,.36),dusk),climate.w);
        low=mix(low,vec3(.80,.88,.92),climate.y*.8);high=mix(high,vec3(.48,.64,.74),climate.y*.7);
        vec3 c=mix(low,high,pow(h,.52));
        vec3 sunDir=normalize(vec3(-.62,mix(.35,.17,dusk),-.9));
        float angle=dot(d,sunDir);
        c+=vec3(1.0,.66,.3)*pow(max(angle,0.0),16.0)*mix(.12,.27,dusk)*(1.0-climate.w);
        float disc=smoothstep(.9991,.9994,angle)*(1.0-climate.w);
        c=mix(c,vec3(1.25,1.12,.81),disc);
        vec2 q=d.xz/max(.13,d.y)*1.8+vec2(weather.y*.008,0.0);
        float cloud=noise(q)*.58+noise(q*2.04)*.28+noise(q*4.13)*.14;
        float m=smoothstep(.57-climate.w*.24,.64-climate.w*.18,cloud)*smoothstep(.015,.14,h)*(1.0-smoothstep(.55,.9,h));
        vec3 cc=mix(vec3(1.0,.99,.90),vec3(1.0,.83,.68),dusk);
        cc=mix(cc,mix(vec3(.54,.63,.68),vec3(.42,.45,.55),dusk),climate.w);
        cc=mix(cc,vec3(.89,.93,.96),climate.y*.75);
        c=mix(c,cc,m*.79);
        c+=vec3(.29,.33,.39)*climate.z;
        outColor=vec4(pow(max(c,vec3(0)),vec3(2.2)),1);
      }`
    });
  }
  water():H.ShaderMaterial {
    return createWaterMaterial(this.atmosphere);
  }
}
