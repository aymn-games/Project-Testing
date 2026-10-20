// <ship-3d> — three.js ship scene. attr scene = JSON {players:[{id,name,skin,hair,girl,outfit,pants,out,fall}], focus:id|null}
class Ship3D extends HTMLElement {
  static get observedAttributes(){ return ['scene']; }
  constructor(){ super(); this.data={players:[],focus:null}; this.figs=new Map(); this.ang=0; }
  attributeChangedCallback(n,_,v){ try{ this.data=JSON.parse(v)||this.data; }catch(e){} if(this.T) this.sync(); }
  set scene(v){ this.attributeChangedCallback('scene',null,typeof v==='string'?v:JSON.stringify(v)); }
  connectedCallback(){
    this.style.cssText='display:block;position:absolute;inset:0;overflow:hidden';
    import('https://unpkg.com/three@0.160.0/build/three.module.js').then(T=>{ if(this.isConnected){ this.T=T; this.init(); this.sync(); } });
  }
  disconnectedCallback(){ cancelAnimationFrame(this.raf); this.ro&&this.ro.disconnect(); this.r&&this.r.dispose(); }
  tex(w,h,draw){ const c=document.createElement('canvas'); c.width=w; c.height=h; draw(c.getContext('2d'),w,h); const t=new this.T.CanvasTexture(c); t.colorSpace=this.T.SRGBColorSpace; t.anisotropy=4; return t; }
  init(){
    const T=this.T, r=this.r=new T.WebGLRenderer({antialias:true}); r.setPixelRatio(Math.min(devicePixelRatio,1.5)); r.shadowMap.enabled=true; r.shadowMap.type=T.PCFSoftShadowMap;
    r.toneMapping=T.ACESFilmicToneMapping; r.toneMappingExposure=1.05; this.appendChild(r.domElement); r.domElement.style.cssText='display:block;width:100%;height:100%';
    const sc=this.sc=new T.Scene(); sc.background=this.tex(4,256,(g,w,h)=>{ const gr=g.createLinearGradient(0,0,0,h); gr.addColorStop(0,'#5fc4e0'); gr.addColorStop(.55,'#a8e6f0'); gr.addColorStop(1,'#d9f6f7'); g.fillStyle=gr; g.fillRect(0,0,w,h); });
    sc.fog=new T.Fog('#bdeef3',70,230);
    const cam=this.cam=new T.PerspectiveCamera(42,1,.1,600); cam.position.set(0,20,36);
    sc.add(new T.HemisphereLight('#e8fbff','#0a7fa0',1.1));
    const sun=new T.DirectionalLight('#fff6e0',2.2); sun.position.set(-20,40,25); sun.castShadow=true; sun.shadow.mapSize.set(1536,1536);
    Object.assign(sun.shadow.camera,{left:-70,right:70,top:70,bottom:-70,near:1,far:120}); sc.add(sun);
    // sea
    const sg=this.seaG=new T.PlaneGeometry(420,420,110,110); sg.rotateX(-Math.PI/2); this.seaBase=sg.attributes.position.array.slice();
    const sea=new T.Mesh(sg,new T.MeshStandardMaterial({color:'#14b4cc',roughness:.35,metalness:.05,flatShading:true})); sea.receiveShadow=true; sc.add(sea);
    const spark=new T.Mesh(new T.PlaneGeometry(420,420),new T.MeshBasicMaterial({map:this.tex(512,512,(g,w,h)=>{ g.fillStyle='rgba(255,255,255,.55)'; for(let i=0;i<260;i++){ g.beginPath(); g.ellipse(Math.random()*w,Math.random()*h,3+Math.random()*7,1+Math.random()*1.5,0,0,7); g.fill(); } }),transparent:true,depthWrite:false}));
    spark.material.map.wrapS=spark.material.map.wrapT=T.RepeatWrapping; spark.material.map.repeat.set(14,14); spark.rotation.x=-Math.PI/2; spark.position.y=.35; sc.add(spark); this.spark=spark;
    this.buildShip(); this.buildFx();
    this.ro=new ResizeObserver(()=>{ const w=this.clientWidth||1,h=this.clientHeight||1; r.setSize(w,h,false); cam.aspect=w/h; cam.updateProjectionMatrix(); }); this.ro.observe(this);
    this.clock=new T.Clock(); this.camLook=new T.Vector3(0,2,0); const loop=()=>{ this.raf=requestAnimationFrame(loop); this.tick(); }; loop();
  }
  mat(c,o={}){ return new this.T.MeshStandardMaterial({color:c,roughness:.75,flatShading:true,...o}); }
  box(w,h,d,c,x,y,z,p){ const m=new this.T.Mesh(new this.T.BoxGeometry(w,h,d),this.mat(c)); m.position.set(x,y,z); m.castShadow=m.receiveShadow=true; (p||this.ship).add(m); return m; }
  buildShip(){
    const T=this.T, ship=this.ship=new T.Group(); this.sc.add(ship);
    const shape=new T.Shape(); shape.moveTo(-15,-5); shape.lineTo(8,-5); shape.quadraticCurveTo(15,-4.2,17,0); shape.quadraticCurveTo(15,4.2,8,5); shape.lineTo(-15,5); shape.lineTo(-15,-5);
    const ext=(d,c,y,s=1,mat)=>{ const g=new T.ExtrudeGeometry(shape,{depth:d,bevelEnabled:false}); g.rotateX(-Math.PI/2); const m=new T.Mesh(g,mat||this.mat(c)); m.scale.set(s,1,s); m.position.y=y; m.castShadow=m.receiveShadow=true; ship.add(m); return m; };
    ext(2.4,'#f1e2b6',-1);
    ext(.35,'#2aa8a6',.55,1.012);
    const plank=this.tex(512,512,(g,w,h)=>{ g.fillStyle='#efd9a4'; g.fillRect(0,0,w,h); g.strokeStyle='rgba(150,105,55,.45)'; g.lineWidth=3; for(let y=0;y<h;y+=32){ g.beginPath(); g.moveTo(0,y); g.lineTo(w,y); g.stroke(); } for(let i=0;i<40;i++){ const y=Math.floor(Math.random()*16)*32, x=Math.random()*w; g.beginPath(); g.moveTo(x,y); g.lineTo(x,y+32); g.stroke(); } });
    plank.wrapS=plank.wrapT=T.RepeatWrapping; plank.repeat.set(.12,.12);
    ext(.1,'#fff',1.4,.97,new T.MeshStandardMaterial({map:plank,roughness:.85}));
    for(const z of [-4.75,4.75]){ this.box(23.5,.28,.32,'#b8693a',-3,2.65,z); for(let x=-14.5;x<=8.5;x+=2.1) this.box(.26,1.15,.26,'#f3ead2',x,2.05,z); this.box(23.5,.12,.2,'#f3ead2',-3,1.95,z); }
    this.box(.32,.28,9.5,'#b8693a',-14.75,2.65,0);
    // cabin
    this.box(6,2.6,8,'#eef0ea',-10.5,2.8,0); this.box(6.8,.45,8.8,'#2aa8a6',-10.5,4.32,0);
    for(const z of [-2.2,.2]) this.box(.1,.9,1.3,'#1f7f86',-7.47,3.1,z); this.box(.1,1.8,1.4,'#8f6329',-7.47,2.4,2.6);
    for(let i=0;i<4;i++) this.box(1.6,.22,2.4,'#d9b67a',-6.6+i*.0,1.6+i*.0,0).visible=false;
    // stairs
    for(let i=0;i<4;i++) this.box(.7,.25,2.2,'#d6b06e',-7.1+i*.7,1.62+(3-i)*.32,-.6);
    // mast + sail
    const mast=new T.Mesh(new T.CylinderGeometry(.22,.3,15,10),this.mat('#7a4a22')); mast.position.set(-3,8.9,0); mast.castShadow=true; ship.add(mast);
    const boom=new T.Mesh(new T.CylinderGeometry(.12,.12,9,8),this.mat('#7a4a22')); boom.rotation.z=Math.PI/2; boom.position.set(1.3,4.6,0); ship.add(boom);
    const stripes=this.tex(512,256,(g,w,h)=>{ for(let i=0;i<8;i++){ g.fillStyle=i%2?'#f4ecd6':'#2aa8a6'; g.fillRect(i*w/8,0,w/8,h); } });
    const sg=new T.PlaneGeometry(8.4,9,16,8), pa=sg.attributes.position; for(let i=0;i<pa.count;i++){ const x=pa.getX(i), y=pa.getY(i); pa.setZ(i,Math.cos(x/8.4*Math.PI)*1.2*(1-Math.abs(y)/12)); } sg.computeVertexNormals();
    const sail=this.sail=new T.Mesh(sg,new T.MeshStandardMaterial({map:stripes,side:T.DoubleSide,roughness:.9})); sail.position.set(1.3,9.3,0); sail.castShadow=true; ship.add(sail);
    const flag=new T.Mesh(new T.PlaneGeometry(1.8,1),new T.MeshStandardMaterial({color:'#14b8a6',side:T.DoubleSide})); flag.position.set(-2.1,16.1,0); ship.add(flag); this.flag=flag;
    // barrel, ring, plank
    const bar=new T.Mesh(new T.CylinderGeometry(1,1.1,1.8,12),this.mat('#c98a48')); bar.position.set(11,2.35,1.5); bar.castShadow=true; ship.add(bar);
    for(const y of [1.85,2.85]){ const b=new T.Mesh(new T.TorusGeometry(1.06,.07,6,16),this.mat('#2a6f74')); b.rotation.x=Math.PI/2; b.position.set(11,y,1.5); ship.add(b); }
    const ring=new T.Mesh(new T.TorusGeometry(.8,.28,10,20),this.mat('#f2876a')); ring.position.set(-13,2.4,4.95); ship.add(ring);
    this.box(1.3,.18,4,'#b07a45',4,1.6,6.6); for(const x of [3.4,4.6]) this.box(.18,.7,.18,'#f3ead2',x,1.95,4.9);
    this.plankEnd=new T.Vector3(6,2.55,12.45);
    this.sk=1.5; ship.scale.setScalar(1.5); const crew=this.crew=new T.Group(); crew.scale.setScalar(1/1.5); ship.add(crew);
    // focus ring
    const fr=this.focusRing=new T.Mesh(new T.RingGeometry(.9,1.15,32),new T.MeshBasicMaterial({color:'#fde68a',transparent:true,opacity:.9,side:T.DoubleSide})); fr.rotation.x=-Math.PI/2; fr.visible=false; this.crew.add(fr);
  }
  buildFx(){ const T=this.T, n=90, g=new T.SphereGeometry(.16,6,5), m=new T.MeshBasicMaterial({color:'#ffffff',transparent:true});
    this.drops=new T.InstancedMesh(g,m,n); this.drops.visible=false; this.sc.add(this.drops); this.dropV=[];
    this.wave=new T.Mesh(new T.RingGeometry(.6,1.1,40),new T.MeshBasicMaterial({color:'#ffffff',transparent:true,side:T.DoubleSide,depthWrite:false})); this.wave.rotation.x=-Math.PI/2; this.wave.visible=false; this.sc.add(this.wave); }
  splash(p){ const T=this.T; this.splashT=0; this.splashP=p.clone(); this.drops.visible=this.wave.visible=true; this.wave.position.set(p.x,.45,p.z);
    this.dropV=Array.from({length:90},()=>{ const a=Math.random()*Math.PI*2, s=2+Math.random()*5; return {p:p.clone(),v:new T.Vector3(Math.cos(a)*s*.6,5+Math.random()*9,Math.sin(a)*s*.6),k:.6+Math.random()*1.2}; }); }
  label(name){ return this.tex(512,128,(g,w,h)=>{ g.font='900 60px Zain, sans-serif'; const tw=Math.min(w-20,g.measureText(name).width+56); g.fillStyle='rgba(8,14,46,.88)'; g.beginPath(); g.roundRect((w-tw)/2,14,tw,100,50); g.fill(); g.fillStyle='#fff'; g.textAlign='center'; g.textBaseline='middle'; g.direction='rtl'; g.fillText(name,w/2,66,w-60); }); }
  figure(d){ const T=this.T, G=new T.Group(), M=(c,o={})=>new T.MeshStandardMaterial({color:c,roughness:.55,...o}),
    add=(geo,c,x,y,z,par=G,o)=>{ const m=new T.Mesh(geo,typeof c==='string'?M(c,o):c); m.position.set(x,y,z); m.castShadow=true; par.add(m); return m; };
    const skin=M(d.skin,{roughness:.5}), shade=new T.Color(d.outfit).multiplyScalar(.75).getStyle();
    const legs=[]; for(const x of [-.17,.17]){ const l=new T.Group(); l.position.set(x,.78,0); add(new T.CapsuleGeometry(.13,.42,4,10),d.pants,0,-.32,0,l); const sh=add(new T.SphereGeometry(.19,14,10),'#f8fafc',0,-.7,.07,l); sh.scale.set(1,.62,1.35); add(new T.CylinderGeometry(.19,.19,.05,14),'#334155',0,-.77,.07,l); G.add(l); legs.push(l); }
    const torso=add(new T.CapsuleGeometry(.36,.42,6,16),d.outfit,0,1.18,0); torso.scale.set(1,1,.82);
    add(new T.TorusGeometry(.3,.06,8,20),'#ffffff',0,1.52,0).rotation.x=Math.PI/2;
    add(new T.CylinderGeometry(.37,.37,.09,18),shade,0,.93,0);
    add(new T.SphereGeometry(.07,10,8),'#fde68a',0,1.22,.31);
    const arms=[]; for(const s of [-1,1]){ const a=new T.Group(); a.position.set(s*.44,1.42,0); add(new T.CapsuleGeometry(.1,.34,4,10),d.outfit,0,-.24,0,a); add(new T.SphereGeometry(.12,12,10),skin,0,-.52,0,a); a.rotation.z=s*.2; G.add(a); arms.push(a); }
    add(new T.CylinderGeometry(.13,.15,.16,12),skin,0,1.66,0);
    const head=new T.Group(); head.position.y=2.18; G.add(head);
    const hd=add(new T.SphereGeometry(.62,28,22),skin,0,0,0,head); hd.scale.set(1,.96,.94);
    for(const s of [-1,1]) add(new T.SphereGeometry(.13,12,10),skin,s*.6,-.04,0,head).scale.set(.6,1,.8);
    const hairM=M(d.hair,{roughness:.45});
    const cap=add(new T.SphereGeometry(.67,28,18,0,Math.PI*2,0,Math.PI*.52),hairM,0,.04,-.05,head); cap.rotation.x=-.32;
    for(let i=-2;i<=2;i++){ const fr=add(new T.SphereGeometry(.2,12,10),hairM,i*.17,.36-Math.abs(i)*.03,.46-Math.abs(i)*.05,head); fr.scale.set(1,.7,.6); }
    if(d.girl){ for(const s of [-1,1]){ const p=add(new T.CapsuleGeometry(.16,.55,6,12),hairM,s*.62,-.32,-.12,head); p.rotation.z=s*.12; add(new T.SphereGeometry(.09,10,8),'#f472b6',s*.6,.08,-.1,head); } }
    else add(new T.SphereGeometry(.5,18,14),hairM,0,-.05,-.28,head).scale.set(1.15,1,.8);
    const eyeW=M('#ffffff',{roughness:.2}), eyeB=M('#1e1b2e',{roughness:.2});
    for(const s of [-1,1]){ const e=add(new T.SphereGeometry(.12,16,12),eyeB,s*.22,-.02,.53,head); e.scale.set(.85,1.15,.5);
      add(new T.SphereGeometry(.04,8,6),eyeW,s*.22+.03,.05,.59,head);
      const br=add(new T.CapsuleGeometry(.025,.13,3,6),d.hair,s*.22,.2,.55,head); br.rotation.z=Math.PI/2+s*.15;
      const ch=add(new T.SphereGeometry(.09,10,8),M('#fb7185',{transparent:true,opacity:.55}),s*.36,-.2,.47,head); ch.scale.set(1,.55,.3); }
    const mouth=add(new T.TorusGeometry(.08,.022,6,14,Math.PI),'#9f1239',0,-.2,.57,head); mouth.rotation.z=Math.PI;
    const sp=new T.Sprite(new T.SpriteMaterial({map:this.label(d.name),depthTest:false,transparent:true})); sp.scale.set(3.4,.85,1); sp.position.y=3.4; sp.renderOrder=10; G.add(sp);
    G.userData={legs,arms,head,sp}; return G; }
  slots(n){ const sk=this.sk, cols=Math.max(2,Math.ceil(Math.sqrt(n*2.4))), rows=Math.ceil(n/cols), out=[]; const sx=Math.min(2.67,17/Math.max(1,cols-1)), sz=rows>1?Math.min(2.4,7.3/(rows-1)):0;
    for(let i=0;i<n;i++){ const r=Math.floor(i/cols), c=i%cols, inRow=Math.min(cols,n-r*cols); out.push(new this.T.Vector3((3.3+(c-(inRow-1)/2)*sx+(r%2?sx/2:0))*sk,1.5*sk,(r-(rows-1)/2)*sz*sk)); } return out; }
  sync(){ const ps=this.data.players||[], keep=new Set(ps.map(p=>p.id));
    const sk=+Math.min(3.4,1.5*Math.max(1,Math.sqrt(ps.length/12))).toFixed(2); if(sk!==this.sk){ this.sk=sk; this.ship.scale.setScalar(sk); this.crew.scale.setScalar(1/sk); this.plankEnd.set(4*sk,1.7*sk,8.3*sk); }
    const sl=this.slots(ps.length);
    for(const [id,f] of this.figs) if(!keep.has(id)){ this.crew.remove(f.g); this.figs.delete(id); }
    ps.forEach((p,i)=>{ let f=this.figs.get(p.id); if(!f||f.name!==p.name){ if(f) this.crew.remove(f.g); f={g:this.figure(p),name:p.name,ph:Math.random()*6}; this.crew.add(f.g); this.figs.set(p.id,f); }
      f.home=sl[i]; if(!f.fallT&&!p.fall) f.g.position.copy(sl[i]); if(p.fall&&f.fallT==null){ f.fallT=0; f.from=f.g.position.clone(); f.splashed=false; } if(!p.fall&&!p.out){ f.fallT=null; f.g.visible=true; f.g.rotation.set(0,0,0); } if(p.out&&!p.fall){ f.fallT=null; f.g.visible=false; }
      f.out=p.out; if(p.out&&!p.fall) f.g.visible=false; }); }
  tick(){ const T=this.T, dt=Math.min(this.clock.getDelta(),.05), t=this.clock.elapsedTime, d=this.data;
    const a=this.seaG.attributes.position.array, b=this.seaBase; for(let i=0;i<a.length;i+=3){ const x=b[i], z=b[i+2]; a[i+1]=Math.sin(x*.07+t*1.3)*.75+Math.cos(z*.09+t*1.05)*.55+Math.sin((x-z)*.16+t*2.1)*.25+Math.sin((x+z)*.33+t*2.9)*.1; } this.seaG.attributes.position.needsUpdate=true; this.seaG.computeVertexNormals();
    this.spark.material.map.offset.set(t*.012+Math.sin(t*.5)*.01,t*.018); this.spark.position.y=.55+Math.sin(t*1.2)*.12;
    this.ship.position.y=Math.sin(t*1.05)*.32; this.ship.rotation.z=Math.sin(t*.8)*.022; this.ship.rotation.x=Math.cos(t*.62)*.028; this.flag.rotation.y=Math.sin(t*3)*.3;
    let fallF=null, focusF=d.focus!=null?this.figs.get(d.focus):null;
    for(const [id,f] of this.figs){ const U=f.g.userData, ph=t*2+f.ph;
      if(f.fallT!=null){ f.fallT+=dt; const k=f.fallT, s=new T.Vector3(4*this.sk,1.5*this.sk,4.3*this.sk), e=this.plankEnd; if(k<3.4) fallF=f;
        if(k<.8){ f.g.position.lerpVectors(f.from,s,k/.8); f.g.rotation.y=Math.atan2(s.x-f.from.x,s.z-f.from.z)||0; U.legs[0].rotation.x=Math.sin(k*18)*.6; U.legs[1].rotation.x=-Math.sin(k*18)*.6; }
        else if(k<1.4){ f.g.position.lerpVectors(s,new T.Vector3(e.x,1.6*this.sk,e.z),(k-.8)/.6); f.g.rotation.y=0; U.legs[0].rotation.x=Math.sin(k*14)*.4; U.legs[1].rotation.x=-Math.sin(k*14)*.4; U.arms[0].rotation.z=-1.2; U.arms[1].rotation.z=1.2; }
        else { const q=Math.min(1,(k-1.4)/.7); f.g.position.set(e.x,1.6*this.sk+Math.sin(q*Math.PI*.5)*1.2-q*q*(1.6*this.sk+3),e.z+q*3.9); f.g.rotation.x=q*1.4; U.arms[0].rotation.z=-2.6; U.arms[1].rotation.z=2.6;
          if(q>=1&&!f.splashed){ f.splashed=true; const w=new T.Vector3(); f.g.getWorldPosition(w); w.y=.4; this.splash(w); }
          if(q>=1){ f.g.position.y-=(k-2.1)*2.2; if(k>3.6) f.g.visible=false; } }
        continue; }
      if(!f.g.visible) continue;
      if(d.cheer!=null&&d.cheer===id){ const c=t*7; f.g.position.y=f.home.y+Math.abs(Math.sin(c*.5))*1.1; U.arms[0].rotation.z=-2.7+Math.sin(c)*.35; U.arms[1].rotation.z=2.7-Math.sin(c)*.35; U.arms[0].rotation.x=U.arms[1].rotation.x=0; U.legs[0].rotation.x=Math.sin(c*.5)*.4; U.legs[1].rotation.x=-Math.sin(c*.5)*.4; f.g.rotation.y+=dt*5; U.head.rotation.z=Math.sin(c)*.15; continue; }
      const cur=focusF===f; f.g.position.y=f.home.y+Math.abs(Math.sin(ph*(cur?1.6:1)))*(cur?.12:.04);
      U.arms[0].rotation.x=Math.sin(ph)*(cur?.5:.15); U.arms[1].rotation.x=-Math.sin(ph)*(cur?.5:.15); U.arms[0].rotation.z=-.18; U.arms[1].rotation.z=.18; U.head.rotation.z=Math.sin(ph*.5)*.06;
      U.legs[0].rotation.x=U.legs[1].rotation.x=0; f.g.rotation.y=cur?Math.sin(t)*.15:Math.sin(ph*.3)*.2; }
    this.focusRing.visible=!!focusF&&!fallF; if(focusF){ this.focusRing.position.set(focusF.home.x,1.53*this.sk,focusF.home.z); this.focusRing.material.opacity=.6+Math.sin(t*5)*.3; }
    // splash
    if(this.splashT!=null){ this.splashT+=dt; const k=this.splashT, m=new T.Matrix4(), s=new T.Vector3();
      this.dropV.forEach((o,i)=>{ o.v.y-=18*dt; o.p.addScaledVector(o.v,dt); if(o.p.y<.3) o.p.y=-5; const sc=Math.max(0,o.k*(1-k/1.8)); m.compose(o.p,new T.Quaternion(),s.set(sc,sc,sc)); this.drops.setMatrixAt(i,m); }); this.drops.instanceMatrix.needsUpdate=true;
      const ws=1+k*7; this.wave.scale.set(ws,ws,ws); this.wave.material.opacity=Math.max(0,.9-k*.5); this.drops.material.opacity=Math.max(0,1-k/1.8);
      if(k>2.2){ this.splashT=null; this.drops.visible=this.wave.visible=false; } }
    // camera
    const cam=this.cam, P=new T.Vector3(), L=new T.Vector3(); let rate=1.6;
    if(fallF){ const w=new T.Vector3(); fallF.g.getWorldPosition(w); w.y=Math.max(w.y,.5); P.set(w.x+7,w.y+3.5,w.z+9); L.copy(w); rate=2.4; }
    else if(focusF&&d.win){ const w=new T.Vector3(); focusF.g.getWorldPosition(w); const an=t*.18; P.set(w.x+Math.sin(an)*7.5,w.y+3.2,w.z+Math.cos(an)*7.5); L.set(w.x,w.y+1.6,w.z); rate=1.4; }
    else if(focusF){ const w=new T.Vector3(); focusF.g.getWorldPosition(w); P.set(w.x+Math.sin(t*.25)*.6,w.y+6.4,w.z+6.8); L.set(w.x,w.y+1.5,w.z); rate=2; this.ang=Math.atan2(P.x,P.z); }
    else { const far=d.far, zm=d.zoom||1, R0=(far?88:54)/zm*(this.sk/1.5), A=this.ang+(d.yaw||0); this.ang+=dt*(far?.22:.13); P.set(Math.sin(A)*R0,Math.max(6,((far?44:26)*(this.sk/1.5)+(d.lift||0))/zm)+Math.sin(t*.2)*2,Math.cos(A)*R0); L.set(0,2,0); rate=far?1.6:1.2; }
    const k=1-Math.exp(-dt*rate); cam.position.lerp(P,k); this.camLook.lerp(L,k); cam.lookAt(this.camLook);
    // صاحب الدور (قبل الفوز) ينزل لأسفل الكادر عشان بطاقة السؤال فوق ما تغطي اسمه وشخصيته
    const vt=focusF&&!d.win&&!fallF?.2:0; this.vo=(this.vo||0)+(vt-(this.vo||0))*k; const vw=this.clientWidth||1, vh=this.clientHeight||1;
    if(this.vo>.001) cam.setViewOffset(vw,vh,0,-vh*this.vo,vw,vh); else if(cam.view&&cam.view.enabled) cam.clearViewOffset();
    this.r.render(this.sc,cam); }
}
if(!customElements.get('ship-3d')) customElements.define('ship-3d',Ship3D);
