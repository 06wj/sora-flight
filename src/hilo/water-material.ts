import * as H from 'hilo3d';

/** Hand-painted cel water: opaque pigment, short brushstroke crests and rain rings. */
export function createWaterMaterial(atmosphere:H.UniformBuffer):H.ShaderMaterial {
  return new H.ShaderMaterial({
    name:'Canal / painted turquoise',
    attributes:{a_position:'POSITION'},
    uniformBlocks:{SoraAtmosphere:atmosphere},
    vs:`
      precision highp float;
      layout(std140) uniform CameraBlock {mat4 u_viewMatrix;mat4 u_projectionMatrix;mat4 u_viewProjectionMatrix;};
      layout(std140) uniform ModelBlock {mat4 u_modelMatrix;};
      in vec3 a_position;
      out vec3 waterPosition;
      void main(){vec4 world=u_modelMatrix*vec4(a_position,1.0);waterPosition=world.xyz;gl_Position=u_viewProjectionMatrix*world;}
    `,
    fs:`
      precision highp float;
      layout(std140) uniform SoraAtmosphere {vec4 eye;vec4 weather;vec4 climate;};
      in vec3 waterPosition;
      layout(location=0) out vec4 outColor;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){
        vec2 cell=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(hash(cell),hash(cell+vec2(1,0)),f.x),mix(hash(cell+vec2(0,1)),hash(cell+vec2(1,1)),f.x),f.y);
      }
      float stroke(vec2 p,float halfLength,float thickness){
        float curve=p.y+sin(p.x*1.8)*.055;
        float d=length(vec2(max(abs(p.x)-halfLength,0.0),curve));
        float aa=max(.012,fwidth(d)*1.2);
        return 1.0-smoothstep(thickness-aa,thickness+aa,d);
      }
      vec4 rainRandom(vec3 key){
        vec4 q=fract(vec4(key.xy,key.z,key.x+key.y)*vec4(.1031,.1030,.0973,.1099));
        q+=dot(q,q.wzxy+33.33);
        return fract((q.xxyz+q.yzzw)*q.zywx);
      }
      float rainImpacts(vec2 p,float time,float pixelWidth){
        const float cellSize=4.0;
        vec2 home=floor(p/cellSize);
        float ripples=0.0;
        // Cells only bound the search. Impacts can occur anywhere within them;
        // neighbours keep expanding circles intact when they cross a cell edge.
        for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
          vec2 cell=home+vec2(float(x),float(y));
          vec4 seed=rainRandom(vec3(cell,17.0));
          float clock=time*mix(.38,.65,seed.x)+seed.y*31.0;
          float cycle=floor(clock);
          vec4 drop=rainRandom(vec3(cell,cycle+71.0));
          float life=mix(.38,.78,seed.z);
          float age=fract(clock)/life;
          // Some births are skipped. Each next birth gets a new location and size.
          float present=step(.29+seed.w*.30,drop.w)*(1.0-step(1.0,age));
          float envelope=smoothstep(0.0,.08,age)*(1.0-smoothstep(.38,1.0,age));
          vec2 center=(cell+drop.xy)*cellSize;
          vec2 delta=p-center-vec2(.025,.12)*age;
          delta.y*=mix(.93,1.12,seed.w);
          float distanceFromDrop=length(delta);
          float radius=mix(.26,.95,drop.z)*clamp(age,0.0,1.0)+.025;
          float thickness=mix(.012,.029,seed.z);
          float aa=clamp(pixelWidth*.7,.008,.22);
          float ring=1.0-smoothstep(thickness,thickness+aa,abs(distanceFromDrop-radius));
          float echo=1.0-smoothstep(thickness*.65,thickness*.65+aa,abs(distanceFromDrop-radius*.57));
          echo*=smoothstep(.22,.5,age)*.23;
          ripples+=(ring+echo)*present*envelope*mix(.42,1.0,seed.w);
        }
        return min(ripples,1.0);
      }
      void main(){
        vec2 p=waterPosition.xz;float time=weather.y;
        float distanceToEye=distance(eye.xyz,waterPosition);
        float dusk=weather.x,wet=climate.x;
        vec3 pigment=mix(vec3(.245,.635,.680),vec3(.365,.485,.630),dusk);
        vec3 deep=mix(vec3(.205,.565,.630),vec3(.315,.420,.575),dusk);
        vec3 shallows=mix(vec3(.390,.740,.735),vec3(.465,.605,.715),dusk);
        // Broad, low-contrast pigment pools, rather than a glossy surface.
        float wash=noise(p*vec2(.10,.047)+vec2(.025,-.045)*time);
        float aa=max(.022,fwidth(wash));
        float pool=smoothstep(.40-aa,.40+aa,wash);
        vec3 color=mix(deep,pigment,pool*.60+.40);
        float bankDistance=max(0.0,11.8-abs(p.x));
        float bankBand=1.0-smoothstep(.9,1.35,bankDistance);
        color=mix(color,shallows,bankBand*.75);
        // Irregularly spaced little crests drift downstream like brush strokes.
        vec2 flow=p-vec2(.07,.72+wet*.35)*time;
        vec2 cell=floor(flow/vec2(7.5,11.0));
        vec2 local=fract(flow/vec2(7.5,11.0))*vec2(7.5,11.0)-vec2(3.75,5.5);
        float seed=hash(cell);
        local-=vec2(hash(cell+4.7)-.5,hash(cell+9.3)-.5)*vec2(3.2,6.0);
        local.y+=sin(time*.65+seed*6.28)*.07;
        float crest=stroke(local,.48+seed*.9,.028+seed*.025)*step(.19,seed);
        float companion=stroke(local-vec2(.18,.32),.2+seed*.35,.021)*step(.64,seed)*.48;
        float detailFade=1.0-smoothstep(65.0,285.0,distanceToEye);
        vec3 foam=mix(vec3(.775,.935,.865),vec3(.695,.790,.865),dusk);
        color=mix(color,foam,clamp(crest+companion,0.0,1.0)*detailFade*.74);
        float bankFoam=(1.0-smoothstep(.025,.12,bankDistance))*smoothstep(.38,.62,noise(vec2(p.y*.5-time*.1,3.4)));
        color=mix(color,foam,bankFoam*.42*detailFade);
        float pixelWidth=length(fwidth(p));
        if(wet>.001&&detailFade>0.0){
          float rain=rainImpacts(p,time,pixelWidth)*(1.0-smoothstep(.45,1.4,pixelWidth));
          color=mix(color,foam,rain*.37*wet*detailFade);
        }
        color=mix(color,color*vec3(.77,.83,.91),climate.w*.57);
        color=mix(color,vec3(.435,.680,.745),climate.y*.49);
        vec3 mist=mix(vec3(.76,.88,.88),vec3(.87,.66,.61),dusk);
        mist=mix(mist,vec3(.47,.59,.65),climate.w*.84);mist=mix(mist,vec3(.73,.83,.88),climate.y*.75);
        color=mix(color,mist,smoothstep(170.0,1100.0,distanceToEye)*.78);
        color+=vec3(.13,.17,.21)*climate.z;
        outColor=vec4(pow(max(color,vec3(0.0)),vec3(2.2)),1.0);
      }
    `
  });
}
