/**
 * الحلبة — لعبة قتال بالدور لبث تيك توك (ألعاب أيمن).
 * المشاهد يكتب كلمة الدخول ويدخل بالدور، والتكبيس يضرب لكمات (كل 50 تكبيسة متتالية ركلة)،
 * والهدايا قوى يختارها الستريمر بالإعدادات: وردة، ضربة طائرة، شفاء، ضربة قاضية.
 * الخاسر يطلع ويدخل التالي ضد الفايز بنفس صحته؛ والبطل لما يخلص الدور.
 * الشخصية: «Nina» by TheTohru — رخصة CC BY 4.0 (assets/nina.glb)، والتسليح والحركات مبرمجة هنا.
 */

import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';

const CONFIG={
  hp:100,            // صحة كل لاعب عند الدخول (الفايز يكمل بنفس صحته)
  tapDamage:.25,     // ضرر كل تكبيسة
  comboTaps:50,      // تكبيسات متتالية = ركلة
  comboWindow:3,     // ثواني توقف تصفّر عداد الركلة
  kickDamage:8,      // ركلة الكومبو
  roseDamage:10,     // وردة
  giftDamage:25,     // هدية 5 عملات (ضربة طائرة)
  healAmount:15,     // هدية تيك توك: شفاء
  punchEvery:.3,
  championTime:6     // ثواني احتفال البطل قبل دخول الدفعة الجاية
};
const SAMPLE_NAMES=['نورة','فهد','سارة','عبدالله','ريم','سلمان','لولو','تركي','غلا','بندر','جود','ماجد','شهد','خالد','دانة','يزيد'];
const SLOT_COLS=['#C9615D','#5B7CC9','#4E9E78','#C9A452','#8D76C2','#4E9DB3','#C98652','#C27495'];

const V=(x,y,z)=>new THREE.Vector3(x,y,z), L=(a,b,w)=>a.clone().lerp(b,w);
const ss=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
const env=(t,t0,up,hold,down)=>{const d=t-t0;if(d<0)return 0;if(d<up)return ss(0,1,d/up);if(d<up+hold)return 1;if(d<up+hold+down)return 1-ss(0,1,(d-up-hold)/down);return 0;};
const $=id=>document.getElementById(id), rnd=(a,b)=>a+Math.random()*(b-a);
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};

/* ===== الإعدادات المحفوظة (تُقرأ قبل إنشاء المشهد عشان جودة الرسوم) ===== */
const LS_KEY='agp-arena-settings-v1';
const DEF={ringSize:4,keyword:'دخول',joinMode:'all',autoJoin:true,quality:'auto',music:true,sfx:true,
  gifts:{rose:'rose',gift5:'finger-heart',tiktok:'tiktok',donut:'donut'}};
function loadSet(){let s={};try{s=JSON.parse(localStorage.getItem(LS_KEY)||'{}')||{};}catch(e){}
  const o=Object.assign({},DEF,s);o.gifts=Object.assign({},DEF.gifts,s.gifts||{});
  o.ringSize=[2,4,6,8].includes(+o.ringSize)?+o.ringSize:4;
  if(!['auto','low','balanced','high'].includes(o.quality))o.quality='auto';
  if(!['all','followers'].includes(o.joinMode))o.joinMode='all';
  o.keyword=String(o.keyword||'').trim().slice(0,20)||DEF.keyword;o.autoJoin=o.autoJoin!==false;o.music=o.music!==false;o.sfx=o.sfx!==false;return o;}
const SET=loadSet();
function saveSet(){try{localStorage.setItem(LS_KEY,JSON.stringify(SET));}catch(e){}}
// ثلاث مستويات للرسوم + التلقائي يختار حسب الجهاز ويخفّف لو صار تقطيع
const QUAL={
  low:{pr:.75,shadow:false,smap:512,bloom:false,part:.35,extras:false,name:'ضعيفة'},
  balanced:{pr:1,shadow:true,smap:1024,bloom:true,part:.7,extras:true,name:'متوازنة'},
  high:{pr:Math.min(window.devicePixelRatio||1,2),shadow:true,smap:2048,bloom:true,part:1,extras:true,name:'قوية'}};
function guessQuality(){const mem=navigator.deviceMemory||4,cores=navigator.hardwareConcurrency||4,mobile=/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  if(mem<=2||cores<=2||(mobile&&mem<4))return 'low';if(mobile)return 'balanced';if(mem>=8&&cores>=8)return 'high';return 'balanced';}
let QL=SET.quality==='auto'?guessQuality():SET.quality, Q=QUAL[QL];

/* ===== تنعيم الوجه (الإضاءة على الرأس + خامة البشرة) ===== */
function smoothFace(geo,texImage){const pos=geo.attributes.position,nrm=geo.attributes.normal,uv=geo.attributes.uv,idx=geo.index,N=pos.count;
  const key=i=>Math.round(pos.getX(i)*1e4)+','+Math.round(pos.getY(i)*1e4)+','+Math.round(pos.getZ(i)*1e4);
  const grp=new Int32Array(N),gmap=new Map();let G=0;
  for(let i=0;i<N;i++){const k=key(i);let g=gmap.get(k);if(g===undefined){g=G++;gmap.set(k,g);}grp[i]=g;}
  const gn=new Float32Array(G*3),gy=new Float32Array(G);
  for(let i=0;i<N;i++){const g=grp[i];gn[g*3]+=nrm.getX(i);gn[g*3+1]+=nrm.getY(i);gn[g*3+2]+=nrm.getZ(i);gy[g]=pos.getY(i);}
  const nb=Array.from({length:G},()=>new Set());
  for(let t=0;t<idx.count;t+=3){const a=grp[idx.getX(t)],b=grp[idx.getX(t+1)],c=grp[idx.getX(t+2)];nb[a].add(b).add(c);nb[b].add(a).add(c);nb[c].add(a).add(b);}
  let cur=gn;
  for(let it=0;it<4;it++){const nx=new Float32Array(G*3);
    for(let g=0;g<G;g++){const w=gy[g]>.13?1:(gy[g]>-.25?.35:0);let x=cur[g*3],y=cur[g*3+1],z=cur[g*3+2];
      if(w>0){let sx=0,sy=0,sz=0;for(const o of nb[g]){sx+=cur[o*3];sy+=cur[o*3+1];sz+=cur[o*3+2];}
        const l0=Math.hypot(x,y,z)||1,l1=Math.hypot(sx,sy,sz)||1,k=w*.6;x=x/l0*(1-k)+sx/l1*k;y=y/l0*(1-k)+sy/l1*k;z=z/l0*(1-k)+sz/l1*k;}
      const l=Math.hypot(x,y,z)||1;nx[g*3]=x/l;nx[g*3+1]=y/l;nx[g*3+2]=z/l;}
    cur=nx;}
  for(let i=0;i<N;i++){const g=grp[i];nrm.setXYZ(i,cur[g*3],cur[g*3+1],cur[g*3+2]);}nrm.needsUpdate=true;
  const TW=texImage.width,TH=texImage.height,mc=document.createElement('canvas');mc.width=TW;mc.height=TH;const mx=mc.getContext('2d');mx.fillStyle='#fff';
  for(let t=0;t<idx.count;t+=3){const a=idx.getX(t),b=idx.getX(t+1),c=idx.getX(t+2);
    const cy=(pos.getY(a)+pos.getY(b)+pos.getY(c))/3,cz=(pos.getZ(a)+pos.getZ(b)+pos.getZ(c))/3,cx=(pos.getX(a)+pos.getX(b)+pos.getX(c))/3;
    if(cy<.175||cy>.4||cz<.04||Math.abs(cx)>.2)continue;
    mx.beginPath();mx.moveTo(uv.getX(a)*TW,uv.getY(a)*TH);mx.lineTo(uv.getX(b)*TW,uv.getY(b)*TH);mx.lineTo(uv.getX(c)*TW,uv.getY(c)*TH);mx.closePath();mx.fill();}
  return mx.getImageData(0,0,TW,TH).data;}
function applySkin(d,blur,mask,TW,TH){for(let i=0;i<TW*TH;i++){if(mask[i*4]<128)continue;
  const r=d[i*4]/255,g=d[i*4+1]/255,b=d[i*4+2]/255,mxv=Math.max(r,g,b),mnv=Math.min(r,g,b),l=(mxv+mnv)/2,dd=mxv-mnv;
  const s=dd<1e-6?0:dd/(1-Math.abs(2*l-1)+1e-6);let h=0;if(dd>1e-6){h=mxv===r?((g-b)/dd)%6:mxv===g?(b-r)/dd+2:(r-g)/dd+4;h*=60;if(h<0)h+=360;}
  if(l<.42)continue;if(!(s<.2||((h<45||h>340)&&s<.55)))continue;if(h>34&&h<62&&s>.1&&l<.86)continue;
  const bl=(blur[i*4]+blur[i*4+1]+blur[i*4+2])/765;if(bl<.4)continue;
  const sl=Math.min(.93,bl*.8+l*.2+.07);d[i*4]=Math.min(255,sl*255*1.02);d[i*4+1]=Math.min(255,sl*.86*255*1.04);d[i*4+2]=Math.min(255,sl*.78*255*1.04);}}

/* ===== المشهد ===== */
const stage=$('stage');
const R=new THREE.WebGLRenderer({antialias:QL!=='low',powerPreference:'high-performance'});
R.setPixelRatio(Q.pr);R.toneMapping=THREE.ACESFilmicToneMapping;R.toneMappingExposure=.88;
R.shadowMap.enabled=Q.shadow;R.shadowMap.type=THREE.PCFSoftShadowMap;
stage.prepend(R.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x06050d);scene.fog=new THREE.Fog(0x06050d,7,18);
const cam=new THREE.PerspectiveCamera(40,1,.05,40);cam.position.set(0,1.9,3.3);
try{await document.fonts.load('800 100px Zain');}catch(e){}
const AR="Zain, 'IBM Plex Sans Arabic', sans-serif";
const agLogo=new Image();agLogo.src=new URL('../../logo.png',import.meta.url).href;try{await agLogo.decode();}catch(e){}
function canvasTex(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'));const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}

const floor=new THREE.Mesh(new THREE.CircleGeometry(14,64),new THREE.MeshStandardMaterial({color:0x0d0c16,roughness:.35,metalness:.3}));
floor.rotation.x=-Math.PI/2;floor.position.y=-.3;floor.receiveShadow=true;scene.add(floor);
const ringBox=new THREE.Mesh(new THREE.BoxGeometry(3.4,.3,3.4),[0,1,2,3,4,5].map(i=>new THREE.MeshStandardMaterial({color:i===2?0xd9ccb0:(i===0?0xc22a28:i===1?0x2551c4:0x3a2a40),roughness:.85})));
ringBox.position.y=-.15;ringBox.receiveShadow=true;scene.add(ringBox);
const apronM=new THREE.Mesh(new THREE.PlaneGeometry(3.4,.3),new THREE.MeshStandardMaterial({roughness:.8,map:canvasTex(2048,256,g=>{g.fillStyle='#1a1240';g.fillRect(0,0,2048,256);g.fillStyle='#ffc23d';g.fillRect(0,0,2048,14);g.fillStyle='#fff';g.font='150px '+AR;g.textAlign='center';g.direction='rtl';g.fillText('الحلبة',1024,190);})}));
apronM.position.set(0,-.15,1.701);scene.add(apronM);
const logo=new THREE.Mesh(new THREE.PlaneGeometry(2.2,2.2),new THREE.MeshStandardMaterial({transparent:true,roughness:.85,map:canvasTex(1024,1024,g=>{g.fillStyle='rgba(18,14,46,.9)';g.beginPath();g.arc(512,512,370,0,7);g.fill();g.strokeStyle='#ffc23d';g.lineWidth=14;g.beginPath();g.arc(512,512,370,0,7);g.stroke();g.strokeStyle='rgba(255,194,61,.35)';g.lineWidth=6;g.beginPath();g.arc(512,512,330,0,7);g.stroke();if(agLogo.width)g.drawImage(agLogo,152,332,720,360);})}));
logo.rotation.x=-Math.PI/2;logo.position.y=.002;logo.receiveShadow=true;scene.add(logo);
[[2.6,2.66,0x3f7f92],[2.95,3.0,0x8a4a6c],[4.2,4.24,0x4f467e]].forEach(([a,b,c])=>{const m=new THREE.Mesh(new THREE.RingGeometry(a,b,96),new THREE.MeshBasicMaterial({color:c}));m.rotation.x=-Math.PI/2;m.position.y=-.295;scene.add(m);});
const corners=[[1.6,1.6,0xb5504c],[-1.6,1.6,0x4d66a8],[-1.6,-1.6,0x4d66a8],[1.6,-1.6,0xb5504c]];
corners.forEach(([x,z,c])=>{const p=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,1.0,16),new THREE.MeshStandardMaterial({color:0x2a3150,metalness:.6,roughness:.3}));p.position.set(x,.5,z);scene.add(p);
  const pad=new THREE.Mesh(new THREE.BoxGeometry(.12,.5,.12),new THREE.MeshStandardMaterial({color:c,roughness:.6}));pad.position.set(x,.5,z);scene.add(pad);});
const ropes=[];
[.3,.52,.74].forEach((h,i)=>{const col=[0x4d66a8,0xd8d8dc,0xb5504c][i];for(let k=0;k<4;k++){const a=corners[k],b=corners[(k+1)%4];const len=Math.hypot(a[0]-b[0],a[1]-b[1]);
  const r=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,len,10),new THREE.MeshStandardMaterial({color:col,roughness:.5,emissive:col,emissiveIntensity:.03}));
  r.position.set((a[0]+b[0])/2,h,(a[1]+b[1])/2);r.rotation.z=Math.PI/2;r.rotation.y=Math.atan2(-(b[1]-a[1]),b[0]-a[0]);scene.add(r);ropes.push({m:r,base:r.position.clone()});}});
const screenM=new THREE.Mesh(new THREE.PlaneGeometry(6,1.5),new THREE.MeshBasicMaterial({toneMapped:false,map:canvasTex(2048,512,g=>{const gr=g.createLinearGradient(0,0,2048,0);gr.addColorStop(0,'#1d1250');gr.addColorStop(1,'#3a0d3f');g.fillStyle=gr;g.fillRect(0,0,2048,512);if(agLogo.width)g.drawImage(agLogo,60,40,840,420);g.fillStyle='rgba(255,255,255,.18)';g.fillRect(960,70,6,370);g.fillStyle='#fff';g.font='280px '+AR;g.textAlign='center';g.direction='rtl';g.fillText('الحلبة',1500,355);g.fillStyle='#ffc23d';g.fillRect(0,470,2048,42);})}));
screenM.position.set(0,2.4,-5.2);scene.add(screenM);
const ropeBanner=new THREE.Mesh(new THREE.PlaneGeometry(1.5,.42),new THREE.MeshStandardMaterial({roughness:.7,side:THREE.DoubleSide,map:canvasTex(1024,288,g=>{g.fillStyle='#120e2e';g.fillRect(0,0,1024,288);g.strokeStyle='#ffc23d';g.lineWidth=10;g.strokeRect(5,5,1014,278);if(agLogo.width)g.drawImage(agLogo,224,4,576,288);})}));ropeBanner.position.set(0,.52,-1.63);scene.add(ropeBanner);
const crowdGroup=new THREE.Group();scene.add(crowdGroup);
{const cg=new THREE.InstancedMesh(new THREE.CapsuleGeometry(.11,.22,4,8),new THREE.MeshStandardMaterial({color:0x1b1f3a,roughness:.9}),200);let k=0;const m=new THREE.Matrix4();
 for(let row=0;row<3;row++)for(let i=0;i<60&&k<200;i++){const a=Math.PI*(1.05+i/59*.9);const r=3.5+row*.45;const x=Math.cos(a)*r*1.1,z=Math.sin(a)*r*.75-.4;
   m.compose(V(x,-.05+row*.28,z),new THREE.Quaternion(),V(1,1+rnd(-.1,.15),1));cg.setMatrixAt(k++,m);}
 cg.count=k;crowdGroup.add(cg);}
[[-3.8,-3.4],[3.8,-3.4]].forEach(([x,z])=>{const s=new THREE.Mesh(new THREE.BoxGeometry(1,2.4,.8),new THREE.MeshStandardMaterial({color:0x111018,roughness:.5}));s.position.set(x,.9,z);scene.add(s);
  const e=new THREE.Mesh(new THREE.BoxGeometry(1.02,.04,.82),new THREE.MeshBasicMaterial({color:x<0?0x3f7f92:0x8a4a6c}));e.position.set(x,2.1,z);scene.add(e);});
scene.add(new THREE.HemisphereLight(0x8899ff,0x221122,.6));
const key=new THREE.SpotLight(0xfff1dd,16,14,.75,.7,1.1);key.position.set(0,4.6,2.4);key.castShadow=Q.shadow;key.shadow.mapSize.set(Q.smap,Q.smap);key.shadow.bias=-.0004;scene.add(key);scene.add(key.target);
const rimA=new THREE.PointLight(0xc06a92,2.4,7,1.5);rimA.position.set(-1.6,1.4,-1.3);scene.add(rimA);
const rimB=new THREE.PointLight(0x6aa6c0,2.4,7,1.5);rimB.position.set(1.6,1.4,-1.3);scene.add(rimB);
const fill=new THREE.DirectionalLight(0xc8d4ff,.9);fill.position.set(-2,2,4);scene.add(fill);
const camFill=new THREE.PointLight(0xfff4ea,1.2,6,1.1);scene.add(camFill);
const beams=[];[[0xb07a9a,-1.8],[0x7aa6b8,1.8],[0xd9c08a,0],[0x8a80b8,-3],[0x7aa6b8,3]].forEach(([c,x],i)=>{
  const g=new THREE.ConeGeometry(.55,6,24,1,true);g.translate(0,-3,0);
  const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.03,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
  m.position.set(x,4.8,-2.4);scene.add(m);beams.push([m,i]);});

/* ===== الشخصية والتسليح ===== */
const gltf=await new GLTFLoader().loadAsync(new URL('assets/nina.glb',import.meta.url).href);
let src;gltf.scene.traverse(o=>{if(o.isMesh)src=o;});
const geo=src.geometry;geo.computeVertexNormals();
const baseMat=src.material;baseMat.metalness=0;baseMat.roughness=.72;
const SPEC={hips:[[0,-.1,0],null],spine:[[0,.02,0],'hips'],head:[[0,.165,0],'spine'],headEnd:[[0,.42,0],'head'],
 uaL:[[.11,.10,-.03],'spine'],faL:[[.18,.03,-.115],'uaL'],hdL:[[.28,-.05,-.17],'faL'],
 uaR:[[-.12,.10,0],'spine'],faR:[[-.195,.04,.105],'uaR'],hdR:[[-.275,0,.2],'faR'],
 thL:[[.04,-.16,-.02],'hips'],shL:[[.027,-.32,-.023],'thL'],ftL:[[.008,-.43,-.005],'shL'],toeL:[[0,-.48,.09],'ftL'],
 thR:[[-.055,-.16,0],'hips'],shR:[[-.11,-.31,-.04],'thR'],ftR:[[-.158,-.405,-.13],'shR'],toeR:[[-.15,-.495,-.12],'ftR']};
const NAMES=Object.keys(SPEC), IDX=Object.fromEntries(NAMES.map((n,i)=>[n,i])), P=n=>V(...SPEC[n][0]);
const SEG={hips:[V(0,-.2,0),V(0,.02,0)],spine:[V(0,.02,0),V(0,.165,0)],head:[V(0,.165,0),V(0,.42,0)],
 uaL:[P('uaL'),P('faL')],faL:[P('faL'),P('hdL').add(V(.02,-.01,-.01))],uaR:[P('uaR'),P('faR')],faR:[P('faR'),P('hdR').add(V(-.02,0,.02))],
 thL:[P('thL'),P('shL')],shL:[P('shL'),P('ftL')],ftL:[P('ftL'),P('toeL')],thR:[P('thR'),P('shR')],shR:[P('shR'),P('ftR')],ftR:[P('ftR'),P('toeR')]};
{const segD=(p,a,b)=>{const ab=b.clone().sub(a),t=Math.max(0,Math.min(1,p.clone().sub(a).dot(ab)/ab.lengthSq()));return p.distanceTo(a.clone().add(ab.multiplyScalar(t)));};
 const pos=geo.attributes.position,N=pos.count,sI=new Uint16Array(N*4),sW=new Float32Array(N*4),pv=V(0,0,0);
 for(let i=0;i<N;i++){pv.fromBufferAttribute(pos,i);const {x,y}=pv,ax=Math.abs(x);const ws=[];
  for(const [n,[a,b]] of Object.entries(SEG)){const d=segD(pv,a,b);let g=1;
    if(n==='head')g=ss(.15,.185,y);else if(n==='spine')g=1-ss(.16,.19,y);else if(n==='hips')g=1-ss(.06,.13,y);
    else if(n[0]==='u'||(n[0]==='f'&&n[1]==='a')){const side=n.endsWith('L')?x>0:x<0;g=side?ss(.085,.115,ax)*(1-ss(.14,.17,y)):0;}
    else g=(1-ss(-.21,-.15,y))*(1-ss(.055,.08,d));
    if(g>0)ws.push([IDX[n],g/(d**4+1e-9)]);}
  ws.sort((a,b)=>b[1]-a[1]);const top=ws.slice(0,4),s=top.reduce((q,w)=>q+w[1],0)||1;
  top.forEach((w,k)=>{sI[i*4+k]=w[0];sW[i*4+k]=w[1]/s;});}
 geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(sI,4));geo.setAttribute('skinWeight',new THREE.Float32BufferAttribute(sW,4));}

/* ===== الأزياء: نلوّن الفستان والإكسسوارات والشعر من نفس الخامة ===== */
// [درجة اللون، التشبع، الإضاءة]: d=الفستان، a=الشنطة والربطة، h=الشعر (null = يبقى الأصلي)
const OUTFITS=[
 {d:[350,.65,.32],pat:'plaid',p2:[45,.8,.6],a:[45,.9,.5],sh:[45,.35],h:[25,.55,.33]},
 {d:[200,.75,.5],pat:'stripe',p2:[0,0,.92],a:[50,.95,.58],sh:null,h:[42,.6,.62]},
 {d:[150,.55,.28],pat:'dots',p2:[0,0,.95],a:[30,.85,.5],sh:[150,.25],h:[0,.05,.15]},
 {d:[330,.6,.58],pat:'plain',p2:null,a:[275,.6,.45],sh:[330,.4],h:[330,.45,.72]},
 {d:[275,.5,.3],pat:'plaid',p2:[185,.8,.55],a:[185,.8,.5],sh:null,h:[220,.12,.82]},
 {d:[0,0,.1],pat:'stripe',p2:[0,.85,.5],a:[0,.85,.5],sh:[0,0],h:[230,.15,.13]},
 {d:[16,.85,.5],pat:'dots',p2:[0,0,.12],a:[180,.7,.4],sh:[180,.3],h:[12,.6,.38]},
 {d:[45,.85,.55],pat:'plaid',p2:[0,0,.12],a:[0,0,.12],sh:[0,0],h:[0,.6,.45]},
 {d:[185,.7,.38],pat:'plain',p2:null,a:[330,.8,.6],sh:[185,.3],h:[275,.4,.55]},
 {d:[120,.4,.55],pat:'stripe',p2:[60,.9,.6],a:[60,.9,.55],sh:[60,.35],h:[35,.5,.45]},
];
const texImg=baseMat.map.image,TW=texImg.width,TH=texImg.height;
const FACEMASK=smoothFace(geo,texImg);
const BLURD=(()=>{const c=document.createElement('canvas');c.width=TW;c.height=TH;const x=c.getContext('2d');x.filter='blur(6px)';x.drawImage(texImg,0,0);return x.getImageData(0,0,TW,TH).data;})();
const scv=document.createElement('canvas');scv.width=TW;scv.height=TH;const sctx=scv.getContext('2d');sctx.drawImage(texImg,0,0);
const SRC=sctx.getImageData(0,0,TW,TH).data, NP=TW*TH, CL=new Uint8Array(NP), LL=new Float32Array(NP), SSAT=new Float32Array(NP);
for(let i=0;i<NP;i++){const r=SRC[i*4]/255,g=SRC[i*4+1]/255,b=SRC[i*4+2]/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2,d=mx-mn;
  const s=d<1e-6?0:d/(1-Math.abs(2*l-1)+1e-6);let h=0;if(d>1e-6){h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;h*=60;if(h<0)h+=360;}
  LL[i]=l;SSAT[i]=s;
  if(h>195&&h<275&&s>.07&&l>.02&&l<.6)CL[i]=1;else if((h<18||h>335)&&s>.35&&l>.12&&l<.7)CL[i]=2;else if(h>34&&h<62&&s>.1&&l>.2&&l<.86)CL[i]=3;else if(s<.16&&l>.58)CL[i]=4;}
function hsl2rgb(h,s,l){h/=360;const f=n=>{const k=(n+h*12)%12,a=s*Math.min(l,1-l);return l-a*Math.max(-1,Math.min(k-3,9-k,1));};return [f(0),f(8),f(4)];}
const outfitCache={};
function patternAt(pat,x,y){if(pat==='plaid')return ((x>>4)%5===0?.5:0)+((y>>4)%5===0?.5:0)+(((x>>2)%10===1||(y>>2)%10===1)?.25:0);
  if(pat==='stripe')return ((x+y)>>3)%4===0?1:0;
  if(pat==='dots'){const dx=x%22-11,dy=y%22-11;return dx*dx+dy*dy<20?1:0;}return 0;}
function outfitTex(k){if(outfitCache[k])return outfitCache[k];const o=OUTFITS[k];
  const c=document.createElement('canvas');c.width=TW;c.height=TH;const ctx=c.getContext('2d');const img=ctx.createImageData(TW,TH);const d=img.data;d.set(SRC);
  for(let i=0;i<NP;i++){const cl=CL[i];if(!cl)continue;let t,ref;
    if(cl===1){t=o.d;ref=.26;const m=o.pat!=='plain'?Math.min(1,patternAt(o.pat,i%TW,(i/TW)|0)):0;if(m>0)t=[t[0]+(o.p2[0]-t[0])*m,t[1]+(o.p2[1]-t[1])*m,t[2]+(o.p2[2]-t[2])*m];}
    else if(cl===2){t=o.a;ref=.38;}else if(cl===3){t=o.h;ref=.6;}else{if(!o.sh)continue;t=[o.sh[0],o.sh[1],.82];ref=.8;}
    if(!t)continue;
    const nl=Math.min(.96,t[2]*Math.pow(LL[i]/ref,.85)),ns=t[1]*Math.min(1,.45+SSAT[i]);const [r,g,b]=hsl2rgb(((t[0]%360)+360)%360,ns,nl);d[i*4]=r*255;d[i*4+1]=g*255;d[i*4+2]=b*255;}
  applySkin(d,BLURD,FACEMASK,TW,TH);
  ctx.putImageData(img,0,0);const tex=new THREE.CanvasTexture(c);tex.flipY=baseMat.map.flipY;tex.colorSpace=THREE.SRGBColorSpace;return outfitCache[k]=tex;}

/* ===== الوضعيات ===== */
const v1=V(0,0,0),v2=V(0,0,0),v3=V(0,0,0),q0=new THREE.Quaternion(),q1=new THREE.Quaternion(),q2=new THREE.Quaternion();
const CHILD={uaL:'faL',faL:'hdL',uaR:'faR',faR:'hdR',thL:'shL',shL:'ftL',ftL:'toeL',thR:'shR',shR:'ftR',ftR:'toeR'};
const LIMBS=Object.keys(CHILD);
function aim(F,n,dir){const b=F.B[n],c=F.B[CHILD[n]];F.char.updateMatrixWorld(true);
  b.getWorldPosition(v1);c.getWorldPosition(v2);v2.sub(v1).normalize();
  v3.copy(dir).normalize().applyQuaternion(F.char.getWorldQuaternion(q0));
  q1.setFromUnitVectors(v2,v3);b.parent.getWorldQuaternion(q2);
  b.quaternion.premultiply(q2.clone().invert().multiply(q1).multiply(q2));}
const eul=new THREE.Euler(),qe=new THREE.Quaternion();
function applyPose(F,p){for(const b of F.list)b.quaternion.copy(F.REST[b.name]);
  F.char.position.set(F.x+p.fwd*F.sign,.5+p.lift-F.sink,F.z);F.char.rotation.set(p.pitch,F.yaw,p.roll,'YXZ');
  for(const n of ['hips','spine','head']){eul.set(...p[n]);F.B[n].quaternion.premultiply(qe.setFromEuler(eul));}
  for(const n of LIMBS)aim(F,n,p[n]);
  if(p.ground>0){F.char.updateMatrixWorld(true);const B=F.B;
    const g=Math.min(B.ftL.getWorldPosition(v1).y-.055,B.ftR.getWorldPosition(v1).y-.055,B.toeL.getWorldPosition(v1).y-.012,B.toeR.getWorldPosition(v1).y-.012);
    F.char.position.y-=g*p.ground;}
  F.char.updateMatrixWorld(true);}
const base=()=>({uaL:V(.32,-1,.05),faL:V(.12,-1,.32),uaR:V(-.32,-1,.05),faR:V(-.12,-1,.32),
  thL:V(.05,-1,0),shL:V(.02,-1,-.03),ftL:V(0,-.45,1),thR:V(-.05,-1,0),shR:V(-.02,-1,-.03),ftR:V(0,-.45,1),
  spine:[0,0,0],head:[0,0,0],hips:[0,0,0],lift:0,pitch:0,roll:0,fwd:0,ground:1});
const mixP=(a,b,w)=>{const o={};for(const k in a){const A=a[k],Bv=b[k];o[k]=A.isVector3?A.clone().lerp(Bv,w):Array.isArray(A)?A.map((x,i)=>x+(Bv[i]-x)*w):A+(Bv-A)*w;}return o;};
function guardP(F,t){const p=base(),b=Math.abs(Math.sin(t*Math.PI*2*1.4+F.seed));
  Object.assign(p,{uaL:V(.55,-.6,.5),faL:V(-.35,.8,.45),uaR:V(-.55,-.6,.5),faR:V(.35,.8,.45),
    thL:V(.18,-1,.28),shL:V(.06,-1,-.28),thR:V(-.18,-1,.12),shR:V(-.06,-1,-.38),spine:[.14,0,0],head:[-.08,0,0]});
  p.lift=.012*b*(1-F.mv);
  if(F.mv>.01){const s=Math.sin(F.ph),c=Math.cos(F.ph),a=Math.min(1,F.mv);
    p.thL=L(p.thL,V(.12,-1,.12+.45*s),a);p.shL=L(p.shL,V(.05,-1,.12+.45*s-.55*Math.max(0,-c)),a);
    p.thR=L(p.thR,V(-.12,-1,.12-.45*s),a);p.shR=L(p.shR,V(-.05,-1,.12-.45*s-.55*Math.max(0,c)),a);p.lift+=.015*Math.abs(s)*a;}
  return p;}
const ATK={
 punch:{dur:.34,impact:.12,reach:.46,pose(F,u,t){const p=guardP(F,t),e=env(u,0,.09,.06,.17),s=F.punchSide?'R':'L',sg=s==='L'?1:-1;
   p['ua'+s]=L(p['ua'+s],V(.12*sg,.03,1),e);p['fa'+s]=L(p['fa'+s],V(.03*sg,.06,1),e);p.spine=[.14,-.38*sg*e,0];p.hips=[0,-.15*sg*e,0];p.fwd=.05*e;return p;}},
 kick:{dur:.8,impact:.3,reach:.5,pose(F,u,t){const p=guardP(F,t),ch=env(u,0,.16,.42,.3),ex=env(u,.16,.12,.22,.28);
   p.thR=L(p.thR,V(-.05,-.05,1),ch);p.shR=L(L(p.shR,V(0,-1,.15),ch),V(0,.08,1),ex);p.ftR=L(p.ftR,V(0,.35,1),ex);
   p.spine=[.14-.4*ch,.15*ch,0];p.thL=L(p.thL,V(.04,-1,-.05),ch);p.shL=L(p.shL,V(.02,-1,-.12),ch);p.fwd=.06*ch;return p;}},
 rose:{dur:.95,impact:.56,reach:.52,pose(F,u,t){const p=guardP(F,t),c=ss(0,.42,u)*(1-ss(.46,.56,u)),e=env(u,.46,.1,.16,.3);
   p.uaR=L(L(p.uaR,V(-.5,-.15,-.85),c),V(-.08,.05,1),e);p.faR=L(L(p.faR,V(-.1,.6,-.5),c),V(-.02,.06,1),e);
   p.uaL=L(p.uaL,V(.6,-.3,.6),c);p.spine=[.14+.1*c,.55*c-.6*e,0];p.hips=[0,.25*c-.3*e,0];
   p.thL=L(p.thL,V(.2,-1,.45),c+e);p.shL=L(p.shL,V(.08,-1,-.4),c+e);p.fwd=.16*e;p.head=[-.1,-.2*c,0];return p;}},
 gift5:{dur:1.2,impact:.62,reach:.5,pose(F,u,t){const p=guardP(F,t),c=ss(0,.5,u)*(1-ss(.5,.62,u)),up=env(u,.5,.12,.22,.4);
   for(const s of ['L','R']){const sg=s==='L'?1:-1;p['th'+s]=L(p['th'+s],V(.22*sg,-1,.55),c);p['sh'+s]=L(p['sh'+s],V(.1*sg,-1,-.6),c);
     p['ua'+s]=L(L(p['ua'+s],V(.5*sg,-.8,-.4),c),V(.15*sg,.65,.75),up);p['fa'+s]=L(L(p['fa'+s],V(.3*sg,-.5,-.5),c),V(.02*sg,1,.25),up);}
   p.spine=[.14+.45*c-.45*up,0,0];p.head=[-.1-.25*up,0,0];p.lift=.13*up;p.fwd=.12*up;return p;}},
 donut:{dur:2.4,impact:1.35,reach:.62,pose(F,u,t){const p=guardP(F,t),c=ss(0,.35,u)*(1-ss(1.15,1.25,u)),up=env(u,1.2,.15,.5,.5);
   for(const s of ['L','R']){const sg=s==='L'?1:-1;p['ua'+s]=L(L(p['ua'+s],V(.3*sg,1,.15),c),V(.15*sg,.7,.7),up);p['fa'+s]=L(L(p['fa'+s],V(-.2*sg,1,.1),c),V(.02*sg,1,.2),up);}
   p.lift=(.06+.025*Math.sin(u*9))*c+.16*up;p.spine=[-.15*c-.4*up,0,0];p.head=[-.25*c-.2*up,0,0];p.fwd=.3*up;
   p.thL=L(p.thL,V(.05,-1,.1),c);p.thR=L(p.thR,V(-.05,-1,.1),c);p.shL=L(p.shL,V(.02,-1,-.3),c);p.shR=L(p.shR,V(-.02,-1,-.3),c);return p;}},
};
function hitP(F,u,t){const p=guardP(F,t),h=env(u,0,.06,.18,.4);
  p.head=[-.55*h,.25*h,.15*h];p.spine=[.14-.5*h,.2*h,-.1*h];
  p.uaL=L(p.uaL,V(.85,.15,-.35),h);p.faL=L(p.faL,V(.6,.6,-.2),h);p.uaR=L(p.uaR,V(-.85,.1,-.3),h);p.faR=L(p.faR,V(-.6,.5,-.2),h);
  p.thR=L(p.thR,V(-.08,-1,-.35),h);p.shR=L(p.shR,V(-.04,-1,-.6),h);return p;}
function lyingP(t,tw){const p=base();p.pitch=-1.45;p.lift=-.38;p.ground=0;
  p.uaL=V(1,.2,0);p.faL=V(1,.5,.1);p.uaR=V(-1,.2,0);p.faR=V(-1,.5,.1);p.thL=V(.3,-1,0);p.thR=V(-.3,-1,0);
  const k=Math.sin(t*12)*.2*tw;p.shL=V(.02,-1,k);p.shR=V(-.02,-1,-k);p.head=[0,.4*Math.sin(t*4)*tw,0];return p;}
function flyP(F,u){const p=lyingP(0,0),k=Math.min(1,u/.45);
  p.pitch=-(1.45+F.spin)*k;p.lift=F.fy-.38*k;
  p.uaL=V(1,.6+.4*Math.sin(u*20),.3);p.uaR=V(-1,.6+.4*Math.cos(u*20),.3);p.thL=V(.4,-1,.3*Math.sin(u*18));p.thR=V(-.4,-1,-.3*Math.sin(u*18));p.head=[.4,0,0];return p;}
function getupP(F,u,t){const w=ss(0,.9,u),p=mixP(lyingP(t,0),guardP(F,t),w);
  const k=Math.sin(w*Math.PI);p.thL=L(p.thL,V(.15,-.4,1),k);p.thR=L(p.thR,V(-.15,-.4,1),k);p.shL=L(p.shL,V(.05,-1,-.3),k);p.shR=L(p.shR,V(-.05,-1,-.3),k);p.spine=[p.spine[0]+.4*k,0,0];return p;}
function victoryP(F,t){const p=base(),ph=t*Math.PI*2*1.6,j=Math.max(0,Math.sin(ph)),alt=Math.sin(ph/2)>0;
  p.uaL=alt?V(.35,1,.1):V(.75,.2,.3);p.faL=alt?V(.1,1,0):V(-.2,1,.2);p.uaR=alt?V(-.75,.2,.3):V(-.35,1,.1);p.faR=alt?V(.2,1,.2):V(-.1,1,0);
  const land=1-j;p.thL=V(.08,-1,.25*land);p.shL=V(.02,-1,-.3*land);p.thR=V(-.08,-1,.25*land);p.shR=V(-.02,-1,-.3*land);
  p.lift=.09*j;p.hips=[0,0,.12*Math.sin(ph/2)];p.spine=[0,0,-.1*Math.sin(ph/2)];p.head=[-.15*j,0,.12*Math.sin(ph/2)];return p;}
function waitP(F,t){const p=guardP(F,t);p.uaL=V(.4,-1,.1);p.faL=V(-.3,-.6,.6);p.uaR=V(-.4,-1,.1);p.faR=V(.3,-.6,.6);p.spine=[.05,0,0];p.head=[0,.3*Math.sin(t*.8+F.seed),0];return p;}

/* ===== المؤثرات ===== */
const softTex=canvasTex(64,64,g=>{const gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.4,'rgba(255,255,255,.6)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);});
const petalTex=canvasTex(64,64,g=>{g.fillStyle='#fff';g.beginPath();g.ellipse(32,32,14,26,.5,0,7);g.fill();});
const plusTex=canvasTex(64,64,g=>{g.fillStyle='#fff';g.fillRect(24,6,16,52);g.fillRect(6,24,52,16);});
class Particles{constructor(max,tex,size,blend){this.max=max;
  this.geo=new THREE.BufferGeometry();this.pos=new Float32Array(max*3);this.col=new Float32Array(max*3);
  this.geo.setAttribute('position',new THREE.BufferAttribute(this.pos,3));this.geo.setAttribute('color',new THREE.BufferAttribute(this.col,3));
  this.vel=new Float32Array(max*3);this.life=new Float32Array(max);this.ml=new Float32Array(max);this.bc=new Float32Array(max*3);this.gr=new Float32Array(max);this.fade=blend===THREE.AdditiveBlending;
  this.pts=new THREE.Points(this.geo,new THREE.PointsMaterial({size,map:tex,vertexColors:true,transparent:true,depthWrite:false,blending:blend,toneMapped:false,alphaTest:this.fade?0:.3}));
  this.pts.frustumCulled=false;scene.add(this.pts);this.i=0;for(let k=0;k<max;k++)this.pos[k*3+1]=-99;}
 emit(o,n,{speed=1.5,up=0,life=.8,gravity=3,colors=[0xffffff],spread=1,box=0}={}){const c=new THREE.Color();n=Math.max(1,Math.round(n*Q.part));
  for(let k=0;k<n;k++){const i=this.i;this.i=(this.i+1)%this.max;
   const d=V(rnd(-1,1),rnd(-1,1),rnd(-1,1)).normalize().multiplyScalar(speed*rnd(.3,1));d.y+=up;d.z*=spread;
   this.pos.set([o.x+rnd(-box,box),o.y+rnd(-box,box)*.5,o.z+rnd(-box,box)],i*3);this.vel.set([d.x,d.y,d.z],i*3);this.life[i]=this.ml[i]=life*rnd(.6,1.2);this.gr[i]=gravity;
   c.set(colors[k%colors.length]);this.bc.set([c.r,c.g,c.b],i*3);this.col.set([c.r,c.g,c.b],i*3);}}
 update(dt){for(let i=0;i<this.max;i++){if(this.life[i]<=0)continue;this.life[i]-=dt;
   if(this.life[i]<=0){this.pos[i*3+1]=-99;continue;}
   this.vel[i*3+1]-=this.gr[i]*dt;const dr=Math.exp(-1.6*dt);this.vel[i*3]*=dr;this.vel[i*3+2]*=dr;
   for(let a=0;a<3;a++)this.pos[i*3+a]+=this.vel[i*3+a]*dt;
   if(this.pos[i*3+1]<.005&&this.gr[i]>0){this.pos[i*3+1]=.005;this.vel[i*3+1]*=-.3;}
   const f=this.fade?Math.min(1,this.life[i]/this.ml[i]*1.5):1;for(let a=0;a<3;a++)this.col[i*3+a]=this.bc[i*3+a]*f;}
  this.geo.attributes.position.needsUpdate=true;this.geo.attributes.color.needsUpdate=true;}}
const sparks=new Particles(3000,softTex,.045,THREE.AdditiveBlending);
const petals=new Particles(600,petalTex,.06,THREE.NormalBlending);
const bits=new Particles(800,petalTex,.035,THREE.NormalBlending);
const pluses=new Particles(300,plusTex,.05,THREE.AdditiveBlending);
const smoke=new Particles(400,softTex,.2,THREE.NormalBlending);
const rings=[];function shock(pos,color,size,dur=.45,flat=false){const m=new THREE.Mesh(new THREE.RingGeometry(.82,1,64),new THREE.MeshBasicMaterial({color,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}));
  m.position.copy(pos);if(flat){m.rotation.x=-Math.PI/2;m.position.y=.01;}scene.add(m);rings.push({m,t:0,dur,size,flat});}
const starTex=canvasTex(256,256,g=>{const gr=g.createRadialGradient(128,128,0,128,128,128);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.25,'rgba(255,230,120,.95)');gr.addColorStop(1,'rgba(255,120,0,0)');g.fillStyle=gr;g.beginPath();for(let i=0;i<16;i++){const a=i*Math.PI/8,r=i%2?46:128;g.lineTo(128+Math.cos(a)*r,128+Math.sin(a)*r);}g.fill();});
const stars=[];function star(pos,size,color=0xffffff,dur=.25){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:starTex,color,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));s.position.copy(pos);scene.add(s);stars.push({s,t:0,dur,size});}
const roseTex=canvasTex(256,256,g=>{g.strokeStyle='#2fa34d';g.lineWidth=14;g.beginPath();g.moveTo(128,120);g.quadraticCurveTo(120,190,132,250);g.stroke();g.fillStyle='#2fa34d';g.beginPath();g.ellipse(100,190,30,13,-.5,0,7);g.fill();
  for(const [r,c] of [[78,'#a3142b'],[60,'#e8304a'],[40,'#ff5a74'],[20,'#c41d3a']]){g.fillStyle=c;g.beginPath();g.arc(128,96,r*.8,0,7);g.fill();}});
const boltTex=canvasTex(256,256,g=>{const gr=g.createRadialGradient(128,128,10,128,128,128);gr.addColorStop(0,'rgba(255,220,120,.8)');gr.addColorStop(1,'rgba(255,160,0,0)');g.fillStyle=gr;g.fillRect(0,0,256,256);
  g.fillStyle='#ffd23d';g.strokeStyle='#fff5cc';g.lineWidth=8;g.beginPath();g.moveTo(150,20);g.lineTo(60,140);g.lineTo(118,140);g.lineTo(96,236);g.lineTo(200,104);g.lineTo(138,104);g.closePath();g.fill();g.stroke();});
// أيقونة هدية تيك توك (نوتة بطبقات سماوي/وردي/أبيض)
const tkTex=canvasTex(256,256,g=>{const note=(dx,dy,c)=>{g.fillStyle=c;g.beginPath();g.arc(98+dx,170+dy,42,0,7);g.fill();g.fillRect(118+dx,40+dy,26,132);
    g.beginPath();g.moveTo(118+dx,40+dy);g.quadraticCurveTo(150+dx,90+dy,200+dx,92+dy);g.lineTo(200+dx,122+dy);g.quadraticCurveTo(160+dx,118+dy,140+dx,96+dy);g.fill();};
  g.fillStyle='rgba(0,0,0,.6)';g.beginPath();g.arc(128,128,124,0,7);g.fill();
  note(-7,-5,'#25F4EE');note(7,5,'#FE2C55');note(0,0,'#ffffff');});
const icons=[];function showIcon(F,tex,dur){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthWrite:false,transparent:true}));s.visible=false;scene.add(s);icons.push({s,F,t:0,dur});}
function makeDonut(){const g=new THREE.Group();
  const dough=new THREE.Mesh(new THREE.TorusGeometry(.13,.065,24,48),new THREE.MeshStandardMaterial({color:0xc98a4b,roughness:.7}));
  const icing=new THREE.Mesh(new THREE.TorusGeometry(.13,.06,24,48),new THREE.MeshStandardMaterial({color:0xff6fb1,roughness:.35,emissive:0xff2d95,emissiveIntensity:.25}));icing.scale.set(1.04,1.04,.75);icing.position.z=.02;
  g.add(dough,icing);const sc=[0xffffff,0x22e5ff,0xffc23d,0x2fcb78,0x7c3aed];
  for(let i=0;i<40;i++){const a=Math.random()*Math.PI*2,r=.13+rnd(-.04,.04);const s=new THREE.Mesh(new THREE.BoxGeometry(.03,.008,.008),new THREE.MeshBasicMaterial({color:sc[i%5]}));s.position.set(Math.cos(a)*r,Math.sin(a)*r,.075);s.rotation.z=Math.random()*3;g.add(s);}
  const light=new THREE.PointLight(0xff4fa8,0,3,1.2);g.add(light);g.userData.light=light;scene.add(g);return g;}
const CONF=360,conf=new THREE.InstancedMesh(new THREE.PlaneGeometry(.035,.018),new THREE.MeshBasicMaterial({side:THREE.DoubleSide,toneMapped:false}),CONF);
const confData=[];const ccs=[0xffc23d,0xff2d95,0x22e5ff,0xffffff,0x7c3aed,0x2fcb78];
for(let i=0;i<CONF;i++){confData.push({x:rnd(-2,2),z:rnd(-1.6,1.6),d:Math.random()*3.6,s:.35+Math.random()*.3,r:Math.random()*6,w:1+Math.random()*3});conf.setColorAt(i,new THREE.Color(ccs[i%6]));}
conf.visible=false;scene.add(conf);

/* ===== اللاعبون والمباريات ===== */
const FS=[];let FID=0;
const G={roundNo:1,bye:null,phase:'idle',st:0,matches:[],champion:null,slow:1,slowUntil:0,shake:0,focus:null,auto:false,confT:-1,sel:null,lobby:[],waiting:[],participants:[],startedAt:0,pts:null,winShown:false,winner:null,queue:[],slots:[],played:0,colorIdx:0};
const DOWN=['fly','down','getup','ko','koDown','exit'];
const OUT=['ko','koDown','exit'];
const PRI={donut:5,gift5:4,rose:3,kick:2};
function makeFighter(name,outfit,col,avatar,pid){
  const B={},list=[];
  for(const n of NAMES){const [p,par]=SPEC[n];const b=new THREE.Bone();b.name=n;const pp=par?SPEC[par][0]:[0,0,0];b.position.set(p[0]-pp[0],p[1]-pp[1],p[2]-pp[2]);if(par)B[par].add(b);B[n]=b;list.push(b);}
  const mat=baseMat.clone();mat.map=outfitTex(outfit);
  const sk=new THREE.SkinnedMesh(geo,mat);sk.add(B.hips);sk.bind(new THREE.Skeleton(list));sk.castShadow=true;sk.frustumCulled=false;
  const char=new THREE.Group();char.add(sk);scene.add(char);
  const c3=new THREE.Color(col);
  const ring=new THREE.Mesh(new THREE.RingGeometry(.2,.26,48),new THREE.MeshBasicMaterial({color:c3,transparent:true,opacity:.9,toneMapped:false}));ring.rotation.x=-Math.PI/2;scene.add(ring);
  const glow=new THREE.PointLight(c3,1,1.1,1.6);scene.add(glow);
  const tag=document.createElement('div');tag.className='tag';tag.innerHTML=`<b style="background:${col}"></b><span class="mhp"><i></i></span>`;tag.querySelector('b').textContent=name;$('tags').appendChild(tag);
  const F={id:++FID,name,col,avatar:avatar||null,pid:pid||name,c3,B,list,REST:Object.fromEntries(list.map(b=>[b.name,b.quaternion.clone()])),char,mat,ring,glow,tag,
    x:0,z:0,laneZ:0,vx:0,fy:0,vy:0,sign:1,yaw:Math.PI/2,hp:CONFIG.hp,ghost:CONFIG.hp,state:'move',st:0,match:null,opp:null,
    queue:[],pendingTap:0,combo:0,lastTap:-99,punchCd:0,punchSide:0,flinch:0,mv:0,ph:0,seed:Math.random()*6,sink:0,headPos:V(0,1,0),
    fromPose:null,blendU:9,lastPose:null,aura:0,auraCol:new THREE.Color(0xffffff),atk:null,hitDone:false,spin:0,donut:null,gone:false};
  FS.push(F);return F;}
function removeFighter(F){F.gone=true;scene.remove(F.char,F.ring,F.glow);F.tag.remove();F.mat.dispose();F.ring.geometry.dispose();if(F.donut){scene.remove(F.donut);F.donut=null;}
  const i=FS.indexOf(F);if(i>=0)FS.splice(i,1);if(G.sel===F.id)G.sel=null;renderChips();}
function exitFighter(F){setState(F,'exit');F.mat.transparent=true;F.mat.needsUpdate=true;sfx('poof');
  smoke.emit(V(F.x,.15,F.z),60,{speed:.6,up:.5,colors:[0x9aa0b8,0xc8ccd8,0x6b7088],life:1.2,gravity:-.2,box:.2});}
function setState(F,s){
  // ضربة مدفوعة انقطعت قبل ما توصل (اللاعب انضرب وهو يشحن) ترجع للطابور عشان الداعم ما يخسر هديته
  if(F.state==='attack'&&!F.hitDone&&F.atk&&F.atk!=='punch'&&['hit','fly','ko','down'].includes(s)&&!OUT.includes(s)){F.queue.unshift(F.atk);if(F.atk==='donut'&&F.match)F.match.donutActive=false;}
  if(F.state==='attack'&&F.donut&&s!=='attack'&&!F.hitDone){scene.remove(F.donut);F.donut=null;}
  F.fromPose=F.lastPose;F.blendU=0;F.state=s;F.st=0;}
function makeMatch(a,b,cx,cz,final){const M={a,b,cx,cz,final,done:false,winner:null,gap:.62,gapT:1.2,donutActive:false,doneAt:0};
  a.match=b.match=M;a.sign=1;b.sign=-1;a.opp=b;b.opp=a;a.laneZ=b.laneZ=cz;return M;}
function slowmo(scale,dur){G.slow=scale;G.slowUntil=performance.now()+dur*1000;}
function flash(color,op=.6,dur=250){const f=$('flash');f.style.transition='none';f.style.background=color;f.style.opacity=op;requestAnimationFrame(()=>{f.style.transition=`opacity ${dur}ms ease-out`;f.style.opacity=0;});}
function speedLines(dur=600){const s=$('speed');s.style.transition='none';s.style.opacity=1;requestAnimationFrame(()=>{s.style.transition=`opacity ${dur}ms ease-out`;s.style.opacity=0;});}
function banner(text,sub,color){const b=$('banner');b.innerHTML='';const d=document.createElement('div');d.className='bn';d.style.color=color||'';d.textContent=text;if(sub){const s=document.createElement('small');s.textContent=sub;d.appendChild(s);}b.appendChild(d);}
const tmpP=V(0,0,0);
function toScreen(p){tmpP.copy(p).project(cam);const r=stage.getBoundingClientRect();return [(tmpP.x+1)/2*r.width,(1-tmpP.y)/2*r.height];}
function pop(pos,text,color,size=28){const [x,y]=toScreen(pos);const d=document.createElement('div');d.className='pop';d.textContent=text;d.style.left=x+'px';d.style.top=y+'px';d.style.color=color;d.style.fontSize=size+'px';$('pops').appendChild(d);setTimeout(()=>d.remove(),1000);}
function feed(F,text){const d=document.createElement('div');if(F)d.style.borderColor=F.col;d.textContent=text;const f=$('feed');f.prepend(d);while(f.children.length>4)f.lastChild.remove();}
const chest=F=>F.B.spine.getWorldPosition(V(0,0,0)).add(V(0,.06,0));
const fist=(F,s)=>F.B['hd'+s].getWorldPosition(V(0,0,0));
const active=F=>F.match&&!F.match.done&&G.phase==='fight';

function deal(F,O,dmg){O.hp=Math.max(0,O.hp-dmg);if(O.hp<=0&&!O.match.done){knockout(F,O,false);return true;}return false;}
function knockout(F,O,byDonut){const M=F.match;M.done=true;M.winner=F;M.doneAt=performance.now();M.donutActive=false;
  if(O.donut){scene.remove(O.donut);O.donut=null;}
  if(!G.matches.some(m=>m.donutActive&&!m.done))$('dark').style.opacity=0;
  setState(O,'ko');O.queue=[];O.vx=-O.sign*(byDonut?2.4:1.9);O.vy=byDonut?4.2:3.2;O.fy=Math.max(O.fy,0);O.spin=byDonut?Math.PI*2:0;
  slowmo(.25,1.1);G.focus={F:O,until:performance.now()+1900,ty:.5};
  const isLast=!G.queue.length&&FS.filter(f=>alive(f)&&f!==O).length===1;
  setTimeout(()=>banner('ضربة قاضية!',isLast?F.name+' بطل الحلبة':F.name+' يكمل بنفس صحته · '+O.name+' أُقصي',isLast?'#FFC23D':F.col),300);
  sfx('ko');feed(F,O.name+' أُقصي');renderChips();}

function resolveHit(F){const O=F.opp,a=F.atk,A=ATK[a];if(!O||O.gone)return;const gap=Math.abs(F.x-O.x);
  if(a!=='donut'&&DOWN.includes(O.state))return;
  if(a==='punch'&&gap>A.reach+.22)return;
  const hp=chest(O),armor=O.state==='attack'&&O.atk==='donut';
  if(a==='punch'){const d=F.punchDmg;O.flinch=.25;O.x-=O.sign*.03;star(fist(F,F.punchSide?'R':'L'),.18,0xffffff,.18);
    sparks.emit(hp,10,{speed:1.2,colors:[0xffe08a,0xffffff],life:.3,gravity:1});G.shake=Math.max(G.shake,.012);sfx('punch');
    pop(hp.clone().add(V(rnd(-.05,.05),.12,0)),'-'+(Math.round(d*10)/10),'#ffffff',22);deal(F,O,d);}
  else if(a==='kick'){const tp=F.B.toeR.getWorldPosition(V(0,0,0));star(tp,.45,0xffb347,.3);shock(hp,0xff8a1f,.55);
    sparks.emit(hp,45,{speed:2.4,colors:[0xff8a1f,0xffd23d,0xffffff],life:.5,gravity:2});G.shake=.045;sfx('kick');flash('rgba(255,170,60,.9)',.08);
    pop(hp.clone().add(V(0,.18,0)),'-'+CONFIG.kickDamage,'#ffb347',38);banner('ركلة الكومبو!','50 تكبيسة · '+F.name,'#ffb347');
    if(!deal(F,O,CONFIG.kickDamage)&&!armor){setState(O,'hit');O.vx=-O.sign*1.4;}}
  else if(a==='rose'){star(fist(F,'R'),.65,0xff6b8a,.35);shock(hp,0xff2d95,.7);shock(hp,0xff6b8a,1.1,.6);
    petals.emit(hp,90,{speed:2.2,up:1,colors:[0xe8304a,0xff5a74,0xa3142b,0xff8fa3],life:1.6,gravity:1.6});sparks.emit(hp,40,{speed:2,colors:[0xff2d95,0xffffff],life:.5,gravity:1});
    G.shake=.07;sfx('rose');flash('rgba(255,45,120,.95)',.1,350);slowmo(.45,.25);
    pop(hp.clone().add(V(0,.2,0)),'-'+CONFIG.roseDamage,'#ff6b8a',46);banner('ضربة الوردة!',F.name,'#ff6b8a');
    if(!deal(F,O,CONFIG.roseDamage)&&!armor){setState(O,'hit');O.vx=-O.sign*2.2;}}
  else if(a==='gift5'){star(hp,1.1,0xffd23d,.4);shock(hp,0xffc23d,1.1,.55);shock(hp,0xffffff,1.7,.8);shock(V(O.x,.01,O.z),0xffc23d,1.2,.6,true);
    sparks.emit(hp,160,{speed:3.6,up:.5,colors:[0xffc23d,0xffffff,0xff8a1f,0x22e5ff],life:.9,gravity:2.5});
    G.shake=.11;sfx('gift');flash('rgba(255,210,80,1)',.16,450);speedLines(700);slowmo(.22,.45);
    pop(hp.clone().add(V(0,.25,0)),'-'+CONFIG.giftDamage,'#ffd23d',60);banner('ضربة طائرة!',F.name+' · ×2.5 أقوى من الوردة','#ffd23d');
    if(!deal(F,O,CONFIG.giftDamage)&&!armor){setState(O,'fly');O.vx=-O.sign*2.8;O.vy=3.0;O.fy=0;O.spin=0;}}
  else if(a==='donut'){if(F.donut){scene.remove(F.donut);F.donut=null;}star(hp,1.8,0xffffff,.5);
    for(const [c,s,d] of [[0xff2d95,1.2,.5],[0xffc23d,1.8,.7],[0x22e5ff,2.5,.9]])shock(hp,c,s,d);shock(V(O.x,.01,O.z),0xff2d95,2,.8,true);
    bits.emit(hp,260,{speed:3.5,up:1.2,colors:[0xffffff,0x22e5ff,0xffc23d,0x2fcb78,0x7c3aed,0xff6fb1],life:1.8,gravity:2.2});
    sparks.emit(hp,220,{speed:4,colors:[0xff2d95,0xffffff,0xffc23d],life:1,gravity:1.5});
    G.shake=.16;sfx('donut');flash('rgba(255,255,255,1)',.35,700);speedLines(1000);
    if(!O.match.done){O.hp=0;knockout(F,O,true);}}
}
function heal(F){if(F.gone||OUT.includes(F.state))return;const before=F.hp;F.hp=Math.min(CONFIG.hp,F.hp+CONFIG.healAmount);
  const p=chest(F);pluses.emit(V(F.x,.1,F.z),40,{speed:.4,up:1.6,colors:[0x2fcb78,0x25f4ee,0xffffff],life:1.2,gravity:-.3,box:.15});
  sparks.emit(p,30,{speed:1,colors:[0x25f4ee,0xfe2c55,0xffffff],life:.6,gravity:0});shock(V(F.x,.01,F.z),0x2fcb78,.6,.6,true);shock(p,0x25f4ee,.5,.5);
  showIcon(F,tkTex,1.3);F.aura=Math.max(F.aura,.8);F.auraCol.set(0x2fcb78);sfx('heal');
  pop(p.clone().add(V(0,.25,0)),'+'+Math.round(F.hp-before),'#2fcb78',40);}

function startAttack(F,a){F.atk=a;F.hitDone=false;setState(F,'attack');
  if(a==='punch'){F.punchSide^=1;F.punchDmg=Math.min(F.pendingTap,3);F.pendingTap-=F.punchDmg;F.punchCd=CONFIG.punchEvery;}
  if(a==='kick')sfx('swing');
  if(a==='rose'){F.aura=1;F.auraCol.set(0xff2d95);showIcon(F,roseTex,ATK.rose.impact);sfx('roseCharge');}
  if(a==='gift5'){F.aura=1;F.auraCol.set(0xffc23d);showIcon(F,boltTex,ATK.gift5.impact);sfx('giftCharge');}
  if(a==='donut'){F.aura=1;F.auraCol.set(0xff2d95);F.donut=makeDonut();F.donut.scale.setScalar(.01);$('dark').style.opacity=1;
    G.focus={F,until:performance.now()+1500,ty:.8};slowmo(.6,1.1);banner('دونات!',F.name+' · ضربة قاضية قادمة','#ff6fb1');sfx('donutCharge');}}

function updateFighter(F,dt,t){const O=F.opp,M=F.match;F.st+=dt;F.blendU+=dt;F.flinch=Math.max(0,F.flinch-dt);F.punchCd-=dt;
  F.aura=Math.max(0,F.aura-(F.state==='attack'?0:dt*1.5));
  let desired=F.x,speed=.75;
  switch(F.state){
   case 'move':case 'wait':{
    if(F===G.champion){setState(F,'victory');break;}
    if(!M){desired=F.homeX??F.x;break;}
    if(M.done){if(M.winner===F&&F.state==='move'&&F.st>.3)setState(F,'victory');break;}
    let next=null;
    if(G.phase==='fight'&&!M.pending){
      if(F.queue.length){F.queue.sort((a,b)=>PRI[b]-PRI[a]);next=F.queue[0];}
      else if(F.pendingTap>=CONFIG.tapDamage-1e-6&&F.punchCd<=0)next='punch';
      if(next&&next!=='donut'&&DOWN.includes(O.state))next=null;}
    if(next){const A=ATK[next],gap=Math.abs(F.x-O.x);
      if(gap>A.reach+.06){desired=O.x-F.sign*A.reach;speed=next==='donut'?2.6:1.9;if(F.state==='wait')setState(F,'move');}
      else{if(next!=='punch')F.queue.shift();if(next==='donut')M.donutActive=true;startAttack(F,next);break;}}
    else if(O&&O.state==='attack'){desired=F.x;}
    else desired=M.cx-F.sign*M.gap/2;
    if(F.state==='wait')setState(F,'move');
    break;}
   case 'attack':{const A=ATK[F.atk];
    if(F.atk==='donut'&&!F.hitDone&&F.donut){const hp=F.B.headEnd.getWorldPosition(V(0,0,0));const k=Math.min(1,F.st/.35),D=F.donut;
      if(F.st<1.2){D.position.copy(hp).add(V(0,.25+.03*Math.sin(F.st*8),0));D.scale.setScalar(1.6*k);}
      else{const tt=ss(1.2,A.impact,F.st);D.position.lerpVectors(hp.clone().add(V(0,.25,0)),chest(O),tt);}
      D.rotation.y+=dt*8;D.rotation.x=.3;D.userData.light.intensity=6*k;
      if(Math.random()<.6)sparks.emit(D.position,2,{speed:.6,colors:[0xff6fb1,0xffffff,0xffc23d],life:.6,gravity:-.5});}
    if(!F.hitDone&&F.st>=A.impact){F.hitDone=true;F.aura=Math.min(F.aura,.6);resolveHit(F);}
    if(F.st>=A.dur){if(F.atk==='donut'){M.donutActive=false;if(F.donut){scene.remove(F.donut);F.donut=null;}if(!G.matches.some(m=>m.donutActive))$('dark').style.opacity=0;}
      setState(F,M.done&&M.winner===F?'victory':'move');}
    break;}
   case 'hit':{F.x+=F.vx*dt;F.vx*=Math.exp(-5*dt);if(F.st>.65)setState(F,'move');break;}
   case 'fly':case 'ko':{F.vy-=9*dt;F.fy+=F.vy*dt;F.x+=F.vx*dt;
    if(Math.abs(F.x)>1.42){F.x=Math.sign(F.x)*1.42;F.vx*=-.35;G.shake=Math.max(G.shake,.05);ropeHit=1;ropeSide=Math.sign(F.x);sfx('rope');sparks.emit(V(F.x,.5,F.z),25,{speed:1.5,colors:[0xffffff,0x22e5ff],life:.4});}
    if(F.st>.3&&F.fy<=0&&F.vy<0){F.fy=0;F.vy=0;F.vx*=.2;G.shake=Math.max(G.shake,.06);
      sparks.emit(V(F.x,.03,F.z),50,{speed:1.6,up:.4,colors:[0xd9ccb0,0xffffff],life:.6,gravity:2});shock(V(F.x,.01,F.z),0xffffff,.7,.5,true);sfx('land');
      setState(F,F.state==='ko'?'koDown':'down');}
    break;}
   case 'down':{F.x+=F.vx*dt;F.vx*=Math.exp(-6*dt);if(F.st>1.3)setState(F,'getup');break;}
   case 'getup':{if(F.st>.9)setState(F,'move');break;}
   case 'koDown':{if(F.st>1.1){exitFighter(F);pop(chest(F).add(V(0,.3,0)),'أُقصي','#949cb5',30);}break;}
   case 'exit':{F.mat.opacity=1-ss(0,.7,F.st);F.sink=.2*ss(0,.7,F.st);if(F.st>.75)removeFighter(F);return;}
   case 'victory':{if(F!==G.champion&&F.st>1.8)setState(F,'wait');break;}
  }
  if(F.state==='move'){const v=Math.max(-speed,Math.min(speed,(desired-F.x)*3.2));F.x+=v*dt;F.ph+=v*F.sign*dt*13;F.mv+=((Math.abs(v)>.06?1:0)-F.mv)*Math.min(1,dt*8);}
  else F.mv+=(0-F.mv)*Math.min(1,dt*8);
  F.z+=(F.laneZ-F.z)*Math.min(1,dt*2.5);
  const face=F.sign>0?Math.PI/2:-Math.PI/2;
  if(F.state==='victory'||(!M&&F.state==='move'&&Math.abs(F.x-(F.homeX??F.x))<.05)){F.yaw+=(0-F.yaw)*Math.min(1,dt*3);}else if(!['fly','ko','down','koDown','getup','exit'].includes(F.state))F.yaw+=(face-F.yaw)*Math.min(1,dt*10);
  F.x=Math.max(-1.42,Math.min(1.42,F.x));}

let ropeHit=0,ropeSide=0;
function poseFighter(F,t){let p;const u=F.st;
  switch(F.state){case 'attack':p=ATK[F.atk].pose(F,u,t);break;case 'hit':p=hitP(F,u,t);break;
   case 'fly':case 'ko':p=flyP(F,u);break;case 'down':p=lyingP(t,1);break;case 'koDown':case 'exit':p=lyingP(t,0);break;
   case 'getup':p=getupP(F,u,t);break;case 'victory':p=victoryP(F,t);break;case 'wait':p=waitP(F,t);break;default:p=guardP(F,t);}
  if(F.flinch>0){const e=Math.sin(F.flinch/.25*Math.PI);p.head=[p.head[0]-.4*e,p.head[1]+.15*e,p.head[2]];p.spine=[p.spine[0]-.15*e,p.spine[1],p.spine[2]];}
  if(F.fromPose&&F.blendU<.18)p=mixP(F.fromPose,p,ss(0,.18,F.blendU));
  F.lastPose=p;applyPose(F,p);
  F.ring.position.set(F.char.position.x,.006,F.z);F.ring.material.opacity=DOWN.includes(F.state)?.25:.9;
  F.glow.position.set(F.char.position.x-F.sign*.35,.9,F.z-.25);F.glow.color.copy(F.aura>.05?F.auraCol:F.c3);F.glow.intensity=1+F.aura*3;
  F.mat.emissive.copy(F.auraCol).multiplyScalar(F.aura*.1*(.75+.25*Math.sin(t*30)));
  if(F.aura>.3&&F.state==='attack')sparks.emit(V(F.char.position.x+rnd(-.15,.15),.02,F.z+rnd(-.15,.15)),2,{speed:.3,up:1.4,colors:[F.auraCol.getHex(),0xffffff],life:.7,gravity:-.4});
  const hd=F.B.headEnd.getWorldPosition(V(0,0,0));F.headPos.copy(hd);
  const [sx,sy]=toScreen(hd.add(V(0,.1,0)));F.tag.style.left=sx+'px';F.tag.style.top=sy+'px';F.tag.style.opacity=DOWN.includes(F.state)?0:1;
  F.tag.querySelector('i').style.width=F.hp/CONFIG.hp*100+'%';F.tag.querySelector('b').textContent=isWaiting(F)&&G.phase==='fight'?F.name+' · ينتظر خصم':F.name;}

/* ===== سير البطولة: كل اثنين ضد بعض بنفس الوقت، والفايزين يتواجهون بنفس صحتهم ===== */
const SPOTS={1:[[0,0]],2:[[-.72,-.2],[.72,.2]],3:[[-.72,-.62],[.72,-.62],[0,.62]],4:[[-.72,-.62],[.72,-.62],[-.72,.62],[.72,.62]]};
function startRound(players,first){players=players.filter(F=>!F.gone);
  if(players.length<2){crown(players[0]);return;}
  const pairs=Math.floor(players.length/2),spots=SPOTS[pairs];G.matches=[];G.bye=null;G.roundNo=(first?1:G.roundNo+1);
  for(let k=0;k<pairs;k++){const a=players[2*k],b=players[2*k+1],[cx,cz]=spots[k];G.matches.push(makeMatch(a,b,cx,cz,players.length===2));
    if(first){a.x=cx-.75;b.x=cx+.75;a.z=b.z=cz;}
    for(const F of [a,b]){if(!first){F.queue=F.queue.slice();setState(F,'move');}}}
  if(players.length%2){const B=players[players.length-1];G.bye=B;B.match=null;B.opp=null;B.laneZ=-1.05;B.homeX=0;setState(B,'move');}
  G.phase='intro';G.st=0;sfx('spawn');setTimeout(()=>sfx('bell'),400);
  const fin=players.length===2;
  if(first)banner(players.length+' لاعبين',pairs>1?pairs+' مباريات بنفس الوقت · كل اثنين ضد بعض':players[0].name+' ضد '+players[1].name,'#fff');
  else banner(fin?'النهائي!':'الدور '+G.roundNo,fin?players[0].name+' ضد '+players[1].name+' · بنفس صحتهم':pairs+' مباريات · الفايزين بنفس صحتهم'+(G.bye?' · '+G.bye.name+' يرتاح':''),'#FFC23D');
  renderAll();}
function nextRound(){const survivors=G.matches.map(m=>m.winner).filter(w=>w&&!w.gone);if(G.bye&&!G.bye.gone)survivors.push(G.bye);
  survivors.sort((p,q)=>(p.z-q.z)||(p.x-q.x));
  if(survivors.length<2)crown(survivors[0]);else startRound(survivors,false);}
function crown(F){if(!F||F.gone){clearArena();setPhase('lobby');renderLobby();return;}G.champion=F;G.bye=null;G.phase='champion';G.st=0;setState(F,'victory');G.confT=0;F.laneZ=0;
  G.focus={F,until:performance.now()+3200,ty:.55};sfx('fanfare');setTimeout(()=>banner('البطل',F.name,'#FFC23D'),900);feed(F,F.name+' بطل الحلبة');renderAll();reportPoints(F);G.focus={F,until:performance.now()+1e9,ty:.55};
  setTimeout(()=>{if(G.champion===F&&UI.phase==='game')showWin(F);},3800);}

/* ===== الصوت: موسيقى خلفية إيقاعية هادية (بدل صوت الجمهور) + أصوات الضربات ===== */
const SND={ctx:null,master:null,sfxG:null,musG:null,rev:null,noise:null,next:0,step:0,timer:0};
function initAudio(){if(SND.ctx){if(SND.ctx.state==='suspended')SND.ctx.resume();return;}
  try{const A=new (window.AudioContext||window.webkitAudioContext)();SND.ctx=A;
   const comp=A.createDynamicsCompressor();comp.threshold.value=-12;comp.ratio.value=4;comp.connect(A.destination);
   SND.master=A.createGain();SND.master.gain.value=.9;SND.master.connect(comp);
   SND.sfxG=A.createGain();SND.sfxG.gain.value=SET.sfx?1:0;SND.sfxG.connect(SND.master);
   const len=Math.floor(A.sampleRate*2),ir=A.createBuffer(2,len,A.sampleRate);for(let c=0;c<2;c++){const d=ir.getChannelData(c);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,3);}
   SND.rev=A.createConvolver();SND.rev.buffer=ir;const rg=A.createGain();rg.gain.value=.25;SND.rev.connect(rg);rg.connect(SND.sfxG);
   const nb=A.createBuffer(1,A.sampleRate*2,A.sampleRate),nd=nb.getChannelData(0);for(let i=0;i<nd.length;i++)nd[i]=Math.random()*2-1;SND.noise=nb;
  }catch(e){SND.ctx=null;}}
function updateMusicGain(){}   // ما فيه موسيقى خلفية (بطلب صاحب المنصة)
const out=(wet=.3)=>{const A=SND.ctx,g=A.createGain();g.connect(SND.sfxG);if(wet>0){const s=A.createGain();s.gain.value=wet;g.connect(s);s.connect(SND.rev);}return g;};
function tone({f=200,f2=null,dur=.2,type='sine',gain=.4,at=0,attack=.005,wet=.2,lp=null}){const A=SND.ctx,t=A.currentTime+at,o=A.createOscillator(),g=A.createGain();o.type=type;
  o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+dur);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(gain,t+attack);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  let n=o;if(lp){const f1=A.createBiquadFilter();f1.type='lowpass';f1.frequency.setValueAtTime(lp[0],t);if(lp[1])f1.frequency.exponentialRampToValueAtTime(lp[1],t+dur);o.connect(f1);n=f1;}
  n.connect(g);g.connect(out(wet));o.start(t);o.stop(t+dur+.05);}
function noise({dur=.1,type='bandpass',f=1200,f2=null,q=1,gain=.4,at=0,attack=.003,wet=.2}){const A=SND.ctx,t=A.currentTime+at,s=A.createBufferSource(),fl=A.createBiquadFilter(),g=A.createGain();
  s.buffer=SND.noise;fl.type=type;fl.frequency.setValueAtTime(f,t);if(f2)fl.frequency.exponentialRampToValueAtTime(f2,t+dur);fl.Q.value=q;
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(gain,t+attack);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  s.connect(fl);fl.connect(g);g.connect(out(wet));s.start(t,Math.random()*1.5);s.stop(t+dur+.05);}
function bell(at=0){for(const t0 of [0,.22])for(const [m,g] of [[1,.22],[2.76,.12],[5.4,.06]])tone({f:430*m,dur:1.4,gain:g,at:at+t0,wet:.4});}
function cheer(k){[784,1047,1319].forEach((f,i)=>tone({f,dur:.25+.1*k,type:'triangle',gain:.06*Math.min(1.5,k),at:i*.06,wet:.4}));}
const SFX={
 punch(){const p=rnd(.85,1.15);tone({f:150*p,f2:50,dur:.13,gain:.55,wet:.1});noise({dur:.07,f:1600*p,q:.8,gain:.45,wet:.1});noise({dur:.015,type:'highpass',f:3500,gain:.25,wet:0});},
 swing(){noise({dur:.18,f:500,f2:2400,q:1.5,gain:.18,attack:.08,wet:.1});},
 kick(){tone({f:110,f2:38,dur:.28,gain:.8,wet:.2});noise({dur:.16,type:'lowpass',f:2500,f2:400,gain:.55,wet:.25});noise({dur:.03,type:'highpass',f:3000,gain:.3,wet:0});cheer(.5);},
 roseCharge(){[880,1109,1319,1760].forEach((f,i)=>tone({f,dur:.5,gain:.12,at:i*.07,wet:.5}));},
 rose(){tone({f:95,f2:35,dur:.4,gain:.9,wet:.3});noise({dur:.22,type:'lowpass',f:3000,f2:300,gain:.6,wet:.3});for(let i=0;i<6;i++)tone({f:rnd(2200,4800),dur:.35,gain:.05,at:.03*i,wet:.6});cheer(.8);},
 giftCharge(){tone({f:110,f2:900,dur:.55,type:'sawtooth',gain:.14,attack:.4,lp:[400,4000],wet:.3});noise({dur:.55,f:300,f2:5000,q:2,gain:.16,attack:.45,wet:.3});},
 gift(){tone({f:70,f2:28,dur:.7,gain:1,wet:.35});noise({dur:.5,type:'lowpass',f:4000,f2:200,gain:.75,wet:.4});noise({dur:.6,f:2500,f2:400,q:1.5,gain:.25,at:.1,attack:.05,wet:.3});cheer(1.1);},
 donutCharge(){tone({f:55,dur:1.4,type:'sawtooth',gain:.18,attack:.6,lp:[200,900],wet:.4});tone({f:55.8,dur:1.4,type:'sawtooth',gain:.14,attack:.6,lp:[200,900],wet:.4});
   tone({f:200,f2:1600,dur:1.3,type:'triangle',gain:.12,attack:1.1,wet:.4});noise({dur:1.3,f:200,f2:6000,q:3,gain:.2,attack:1.2,wet:.4});},
 donut(){tone({f:60,f2:22,dur:1.3,gain:1,wet:.45});noise({dur:1.1,type:'lowpass',f:5000,f2:120,gain:.9,wet:.5});noise({dur:.04,type:'highpass',f:2500,gain:.5,wet:0});bell(.6);cheer(1.5);},
 heal(){[1047,1319,1568,2093].forEach((f,i)=>tone({f,dur:.45,gain:.13,at:i*.075,wet:.5}));noise({dur:.6,type:'highpass',f:6000,gain:.06,attack:.2,wet:.6});},
 land(){tone({f:80,f2:35,dur:.25,gain:.6,wet:.2});noise({dur:.2,type:'lowpass',f:900,gain:.4,wet:.2});},
 rope(){tone({f:180,f2:90,dur:.35,type:'triangle',gain:.25,wet:.3});},
 poof(){noise({dur:.4,f:2500,f2:300,q:1,gain:.3,attack:.02,wet:.4});tone({f:600,f2:150,dur:.35,type:'triangle',gain:.12,wet:.4});},
 spawn(){noise({dur:.3,f:400,f2:3000,q:2,gain:.15,attack:.15,wet:.4});tone({f:523,dur:.25,gain:.1,at:.15,wet:.4});},
 bell(){bell();},
 ko(){bell(.1);cheer(1.2);},
 join(){tone({f:660,dur:.12,gain:.1,wet:.3});tone({f:990,dur:.18,gain:.1,at:.08,wet:.3});},
 tick(){tone({f:880,dur:.16,type:'triangle',gain:.22,wet:.3});tone({f:440,dur:.2,gain:.12,wet:.2});},
 fanfare(){[[523,0],[659,.15],[784,.3],[1047,.48],[784,.72],[1047,.86]].forEach(([f,a])=>{tone({f,dur:.32,type:'square',gain:.08,at:a,lp:[2200],wet:.35});tone({f:f/2,dur:.32,type:'sawtooth',gain:.05,at:a,lp:[1200],wet:.35});});cheer(1.4);},
};
function sfx(name){if(!SET.sfx||!SND.ctx)return;try{SFX[name]();}catch(e){}}
addEventListener('pointerdown',initAudio,{capture:true});addEventListener('keydown',initAudio,{capture:true});

/* ===== الجودة: تطبيق المستوى + المراقبة التلقائية للتقطيع ===== */
function applyQuality(level,why){QL=level;Q=QUAL[level];
  R.setPixelRatio(Q.pr);R.shadowMap.enabled=Q.shadow;key.castShadow=Q.shadow;key.shadow.mapSize.set(Q.smap,Q.smap);if(key.shadow.map){key.shadow.map.dispose();key.shadow.map=null;}
  scene.traverse(o=>{const m=o.material;if(m)(Array.isArray(m)?m:[m]).forEach(x=>{x.needsUpdate=true;});});
  crowdGroup.visible=Q.extras;beams.forEach(([m])=>{m.visible=Q.extras;});bloomPass.enabled=Q.bloom;resize();renderQBadge();if(why)toast(why);}
const PERF={frames:0,t0:0,good:0,lastChange:0,blockUp:{},fps:60};
function perfTick(now){PERF.frames++;if(!PERF.t0){PERF.t0=now;return;}const el=now-PERF.t0;if(el<2000)return;
  const fps=PERF.frames*1000/el;PERF.frames=0;PERF.t0=now;PERF.fps=fps;
  if(SET.quality!=='auto'||document.hidden||now-PERF.lastChange<4000)return;
  const order=['low','balanced','high'],i=order.indexOf(QL);
  if(fps<40&&i>0){PERF.blockUp[order[i]]=now+60000;PERF.lastChange=now;PERF.good=0;applyQuality(order[i-1],'خفّفنا الرسوم تلقائياً إلى «'+QUAL[order[i-1]].name+'» عشان ما يصير تقطيع');}
  else if(fps>56&&i<2){PERF.good++;if(PERF.good>=3&&!(PERF.blockUp[order[i+1]]>now)){PERF.lastChange=now;PERF.good=0;applyQuality(order[i+1]);}}
  else PERF.good=0;}

/* ===== الواجهة ===== */
const UI={phase:'settings'};
function setPhase(p){UI.phase=p;document.body.dataset.phase=p;updateMusicGain();if(p!=='game'&&p!=='lobby'&&document.body.classList.contains('settings-open'))closeSettings();}
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(text){const d=document.createElement('div');d.className='toast';d.textContent=text;$('toasts').appendChild(d);setTimeout(()=>d.remove(),3200);}
const TG=(window.AymanGamesPlatform||{}).tiktokGifts;   // assets/tiktok-gifts/tiktok-gifts.js (نفس صور هدايا البثوث)
const AG_GIFTS=TG&&TG.list?TG.list.map(g=>({id:g.id,label:g.label,coins:g.coins,img:TG.iconUrl(g)})):[];
const giftById=id=>AG_GIFTS.find(g=>g.id===id)||null;
const POWERS=[
  {id:'rose',name:'ضربة الوردة',icon:'🌹',color:'#ff4d6d',desc:'ضربة قوية واضحة · ضرر '+CONFIG.roseDamage},
  {id:'gift5',name:'الضربة الطائرة',icon:'⚡',color:'#ffc23d',desc:'تطيّر الخصم · ضرر '+CONFIG.giftDamage+' (2.5× الوردة)'},
  {id:'tiktok',name:'شفاء',icon:'💚',color:'#2fcb78',desc:'تزيد صحة اللاعب +'+CONFIG.healAmount},
  {id:'donut',name:'الضربة القاضية',icon:'💥',color:'#ff2d95',desc:'تنهي المباراة لصاحبها فوراً'}];
const powerForGift=giftId=>POWERS.find(p=>SET.gifts[p.id]===giftId)||null;
// صور تجريبية للاعبين (بالبث الحقيقي تجي صورة حساب تيك توك)
function makeAvatar(name,col){const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');
  const gr=g.createLinearGradient(0,0,128,128);gr.addColorStop(0,col);gr.addColorStop(1,'#1a1240');g.fillStyle=gr;g.fillRect(0,0,128,128);
  g.fillStyle='rgba(255,255,255,.22)';g.beginPath();g.arc(64,54,26,0,7);g.fill();g.beginPath();g.ellipse(64,124,44,34,0,0,7);g.fill();
  g.fillStyle='#fff';g.font='bold 46px "IBM Plex Sans Arabic",sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(String(name).trim().charAt(0)||'؟',64,58);
  return c.toDataURL('image/png');}
const AVA_COLS=['#7c3aed','#e8413f','#3570ff','#2fcb78','#ff8a1f','#ff5fa8','#22c7e5','#c9a227'];
function avatarEl(name,url,cls){const s=document.createElement('span');s.className=cls;s.textContent=String(name).trim().charAt(0)||'؟';
  if(url){const im=document.createElement('img');im.alt='';im.referrerPolicy='no-referrer';im.src=url;im.onerror=()=>im.remove();s.appendChild(im);}return s;}

// ---- الإعدادات ----
function seg(id,v){[...$(id).children].forEach(b=>b.classList.toggle('on',b.dataset.v===v));}
function renderKw(){for(const id of ['kwShow','kwShow2','elKw','ajKw'])$(id).textContent=SET.keyword;}
function renderSettings(){seg('setRing',String(SET.ringSize));$('setKw').value=SET.keyword;seg('setJoin',SET.joinMode);seg('setQ',SET.quality);
  $('setAuto').checked=SET.autoJoin;$('setSfx').checked=SET.sfx;renderGiftRows();renderKw();renderAJ();
  $('qHint').textContent=SET.quality==='auto'?'التلقائي يختار الأنسب لجهازك ويخفّف إذا صار تقطيع · الحالي: '+QUAL[QL].name:'الضعيفة للأجهزة الضعيفة، والقوية أعلى جودة';}
function renderGiftRows(){$('giftRows').innerHTML=POWERS.map(p=>{const g=giftById(SET.gifts[p.id]);
  return '<div class="er-gift" style="--c:'+p.color+'"><button type="button" class="er-gbox" data-pick="'+p.id+'" aria-label="اختيار هدية '+p.name+'">'+
    (g?'<img src="'+g.img+'" alt=""><span>'+esc(g.label)+'</span>':'<b style="font-size:30px">+</b><span>اختر هدية</span>')+'</button>'+
    '<div class="er-gtxt"><b><i>'+p.icon+'</i> '+p.name+'</b><small>'+p.desc+'</small>'+(g?'<em>'+g.coins+' عملة</em>':'')+'</div></div>';}).join('');renderActs();}
let pickFor=null;
function openPicker(pid){pickFor=pid;const p=POWERS.find(x=>x.id===pid);$('pickerTitle').textContent='هدية '+p.name;
  $('pickerGrid').innerHTML=AG_GIFTS.map(g=>{const used=POWERS.find(x=>SET.gifts[x.id]===g.id);
    return '<button type="button" class="pk'+(SET.gifts[pid]===g.id?' on':'')+'" data-gift="'+esc(g.id)+'"><img src="'+g.img+'" alt=""><b>'+esc(g.label)+'</b><small>'+g.coins+' عملة</small>'+(used&&used.id!==pid?'<em>'+used.name+'</em>':'')+'</button>';}).join('');
  $('picker').classList.add('show');$('pickerGrid').querySelector('.pk')?.focus();}
$('giftRows').addEventListener('click',e=>{const b=e.target.closest('[data-pick]');if(b)openPicker(b.dataset.pick);});
$('pickerGrid').addEventListener('click',e=>{const b=e.target.closest('[data-gift]');if(!b||!pickFor)return;const gid=b.dataset.gift;
  const other=POWERS.find(x=>x.id!==pickFor&&SET.gifts[x.id]===gid);if(other)SET.gifts[other.id]=SET.gifts[pickFor];   // تبديل: الهدية ما تتكرر لقوتين
  SET.gifts[pickFor]=gid;saveSet();renderGiftRows();$('picker').classList.remove('show');});
$('pickerClose').onclick=()=>$('picker').classList.remove('show');
$('picker').addEventListener('click',e=>{if(e.target.id==='picker')$('picker').classList.remove('show');});
[...$('setRing').children].forEach(b=>b.onclick=()=>{SET.ringSize=+b.dataset.v;saveSet();seg('setRing',String(SET.ringSize));});
$('setKw').oninput=()=>{const v=$('setKw').value.trim().slice(0,20);if(v){SET.keyword=v;saveSet();renderKw();}};
$('setKw').onblur=()=>{if(!$('setKw').value.trim())$('setKw').value=SET.keyword;};
[...$('setJoin').children].forEach(b=>b.onclick=()=>{SET.joinMode=b.dataset.v;saveSet();seg('setJoin',SET.joinMode);});
[...$('setQ').children].forEach(b=>b.onclick=()=>{SET.quality=b.dataset.v;saveSet();seg('setQ',SET.quality);PERF.blockUp={};PERF.good=0;
  applyQuality(SET.quality==='auto'?guessQuality():SET.quality);renderSettings();});
$('setAuto').onchange=()=>{SET.autoJoin=$('setAuto').checked;saveSet();renderAJ();};
$('setSfx').onchange=()=>{SET.sfx=$('setSfx').checked;saveSet();initAudio();if(SND.sfxG)SND.sfxG.gain.value=SET.sfx?1:0;};
$('resetSet').onclick=()=>{Object.assign(SET,JSON.parse(JSON.stringify(DEF)));saveSet();PERF.blockUp={};applyQuality(guessQuality());renderSettings();renderLobby();toast('رجعت الإعدادات للافتراضي');};
function openSettings(){renderSettings();document.body.classList.add('settings-open');$('setGo').textContent='حفظ ورجوع';}
function closeSettings(){document.body.classList.remove('settings-open');$('setGo').textContent='التالي: لوبي الدخول';}
$('setGo').onclick=()=>{if(document.body.classList.contains('settings-open')){closeSettings();return;}setPhase('lobby');renderLobby();};
$('setClose').onclick=closeSettings;
$('setBtn').onclick=()=>{if(UI.phase==='settings')return;openSettings();};

// ---- الهيدر ----
function renderAJ(){$('ajBox').classList.toggle('on',SET.autoJoin);$('ajTg').classList.toggle('on',SET.autoJoin);$('ajTg').setAttribute('aria-checked',String(SET.autoJoin));$('setAuto').checked=SET.autoJoin;}
$('ajTg').onclick=()=>{SET.autoJoin=!SET.autoJoin;saveSet();renderAJ();toast(SET.autoJoin?'الدخول التلقائي مفعّل — اكتب «'+SET.keyword+'» بالشات':'الدخول التلقائي مقفول');};
function renderQBadge(){$('qBadge').textContent='الرسوم: '+(SET.quality==='auto'?'تلقائي · ':'')+QUAL[QL].name;}
const isFs=()=>!!(document.fullscreenElement||document.webkitFullscreenElement);
function renderFs(){$('fsBtn').innerHTML=isFs()?'🗗 <span>تصغير الشاشة</span>':'⛶ <span>ملء الشاشة</span>';}
$('fsBtn').onclick=()=>{try{if(isFs()){(document.exitFullscreen||document.webkitExitFullscreen).call(document);}
  else{const el=document.documentElement,r=(el.requestFullscreen||el.webkitRequestFullscreen).call(el);if(r&&r.catch)r.catch(()=>toast('المتصفح ما سمح بملء الشاشة هنا'));}}catch(e){toast('المتصفح ما سمح بملء الشاشة هنا');}};
document.addEventListener('fullscreenchange',renderFs);document.addEventListener('webkitfullscreenchange',renderFs);
function exitGame(){clearArena();G.lobby=[];G.waiting=[];G.queue=[];
  if(/\/games\//.test(location.pathname)){location.href='../../games.html';return;}   // داخل المنصة: رجوع لمكتبة الألعاب
  setPhase('settings');renderSettings();}
$('exitBtn').onclick=exitGame;

// ---- لوبي الدخول ----
const SAMPLE=['نورة','فهد','سارة','عبدالله','ريم','سلمان','لولو','تركي','غلا','بندر','جود','ماجد','شهد','خالد','دانة','يزيد','رهف','مشاري','أسيل','نواف'];
function renderLobby(){const n=G.lobby.length;$('elCount').textContent=n;$('startBtn').disabled=n<1;renderKw();
  const list=$('elList');list.innerHTML='';
  if(!n){const e=document.createElement('div');e.className='el-empty';e.textContent='بانتظار انضمام اللاعبين… يكتبون «'+SET.keyword+'» بالشات';list.appendChild(e);return;}
  G.lobby.forEach((p,i)=>{const w=document.createElement('div');w.className='el-p'+(p.isNew?' new':'');p.isNew=false;
    const chip=document.createElement('div');chip.className='el-chip';const av=avatarEl(p.name,p.avatar,'el-av');av.style.setProperty('--car',AVA_COLS[i%AVA_COLS.length]);
    const nm=document.createElement('span');nm.className='el-nm';nm.textContent=p.name;
    const x=document.createElement('button');x.type='button';x.className='el-x';x.setAttribute('aria-label','شيل '+p.name);x.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line></svg>';
    x.onclick=()=>{G.lobby=G.lobby.filter(q=>q!==p);renderLobby();};
    chip.append(av,nm,x);w.appendChild(chip);list.appendChild(w);});}
function freshName(){const used=new Set([...G.lobby,...G.waiting,...G.queue].map(p=>p.name).concat(FS.map(f=>f.name)));const pool=SAMPLE.filter(x=>!used.has(x));return pool.length?pool[Math.floor(Math.random()*pool.length)]:'مشاهد '+Math.floor(rnd(100,999));}
function joinPlayer(name,avatar,pid){name=String(name||'').trim().slice(0,24);if(!name)return false;pid=pid||name;
  const inGame=FS.some(f=>f.pid===pid&&!f.gone);
  if(UI.phase==='lobby'){if(G.lobby.some(p=>p.pid===pid))return false;
    G.lobby.push({pid,name,avatar:avatar||makeAvatar(name,AVA_COLS[G.lobby.length%AVA_COLS.length]),isNew:true});renderLobby();sfx('join');return true;}
  if(UI.phase==='game'&&SET.autoJoin&&G.phase!=='champion'){if(inGame||G.queue.some(p=>p.pid===pid))return false;
    G.queue.push({pid,name,avatar:avatar||makeAvatar(name,AVA_COLS[G.queue.length%AVA_COLS.length])});renderRoster();feed(null,name+' دخل بالدور (رقم '+G.queue.length+')');sfx('join');return true;}
  if((UI.phase==='win'||G.phase==='champion')&&SET.autoJoin){if(G.waiting.some(p=>p.pid===pid))return false;
    G.waiting.push({pid,name,avatar:avatar||makeAvatar(name,AVA_COLS[G.waiting.length%AVA_COLS.length]),isNew:true});feed(null,name+' دخل الجولة الجاية');sfx('join');return true;}
  return false;}
function chat(name,text,avatar,opts){if(String(text||'').trim()!==SET.keyword)return false;if(SET.joinMode==='followers'&&!(opts&&opts.follower))return false;return joinPlayer(name,avatar,opts&&opts.id);}
$('testBtn').onclick=()=>{let k=0;while(k++<10){const n=freshName();if(joinPlayer(n,null,'demo:'+n))G.lobby[G.lobby.length-1].bot=true;}};
$('startBtn').onclick=()=>startTournament();

// ---- البطولة ----
function clearArena(){for(const F of [...FS])removeFighter(F);G.matches=[];G.champion=null;G.bye=null;G.focus=null;G.confT=-1;conf.visible=false;G.phase='idle';
  $('dark').style.opacity=0;$('banner').innerHTML='';G.entries=[];G.entryBusy=0;$('announce').classList.remove('show');for(const ic of icons)scene.remove(ic.s);icons.length=0;renderAll();}
function startTournament(list){initAudio();const ps=(list||G.lobby).slice();if(ps.length<1)return;clearArena();
  G.participants=ps.map(p=>({pid:p.pid,name:p.name,avatar:p.avatar,bot:!!p.bot}));G.demo=ps.some(p=>p.bot);G.demoGiftT=3;tapsSeen=0;$('tapsIn').textContent='👆 ما وصل تكبيس من البث للحين';$('tapsIn').classList.remove('hot');G.startedAt=Date.now();G.pts=null;G.winShown=false;
  G.queue=ps.map(p=>({pid:p.pid,name:p.name,avatar:p.avatar,bot:!!p.bot}));G.slots=ringSlots();G.played=0;G.colorIdx=0;outfitBag=[];
  setPhase('game');G.phase='fight';G.st=0;G.entries=[];G.entryBusy=0;refill(performance.now());G.sel=null;renderAll();}

// ---- دخول اللاعبين: بطاقة 4 ثواني (مين يدخل وضد مين) ثم عد تنازلي 3-2-1 ثم «قاتل!» ----
const ANN_MS=4000, COUNT_MS=3000;
function scheduleEntry(batch,now){const start=Math.max(now,G.entryBusy||0);
  for(const M of batch){M.readyAt=start+ANN_MS;M.fightAt=start+ANN_MS+COUNT_MS;}
  G.entryBusy=start+ANN_MS+COUNT_MS+600;G.entries.push({batch,start,shown:false,last:-1,go:false});sfx('spawn');}
function annPair(M){const d=document.createElement('div');d.className='an-pair';
  const side=(F,cls)=>{const p=document.createElement('div');p.className='an-p '+cls;p.style.setProperty('--c',F.col);p.appendChild(avatarEl(F.name,F.avatar,'aav'));
    const t=document.createElement('span');const b=document.createElement('b');b.textContent=F.name;const sm=document.createElement('small');
    const isNew=(M.newIds||[]).includes(F.id);sm.textContent=isNew?'يدخل الحلبة':'يكمل بصحته '+Math.ceil(F.hp);if(isNew)sm.className='new';t.append(b,sm);p.appendChild(t);return p;};
  const vs=document.createElement('span');vs.className='an-vs';vs.textContent=M.final?'النهائي':'ضد';
  d.append(side(M.b,'r'),vs,side(M.a,'l'));return d;}
function entryTick(now){const E=G.entries&&G.entries[0];const an=$('announce'),cn=$('countNum');
  if(!E){an.classList.remove('show');return;}
  if(now<E.start)return;
  const live=E.batch.filter(M=>!M.done&&!M.a.gone&&!M.b.gone);
  if(!live.length){G.entries.shift();an.classList.remove('show');return;}
  const ready=E.batch[0].readyAt,fight=E.batch[0].fightAt;
  if(now<ready){if(!E.shown){E.shown=true;const P=$('anPairs');P.innerHTML='';live.forEach(M=>P.appendChild(annPair(M)));
      an.querySelector('.an-t').textContent=live.some(M=>M.final)?'النهائي!':(live.length>1||live.some(M=>(M.newIds||[]).length>1)?'لاعبين جدد يدخلون الحلبة':'لاعب جديد يدخل الحلبة');
      an.classList.remove('show');void an.offsetWidth;an.classList.add('show');sfx('join');}
    $('anBar').style.width=Math.min(100,(now-E.start)/ANN_MS*100)+'%';return;}
  an.classList.remove('show');
  if(now<fight){const k=3-Math.floor((now-ready)/1000);if(k!==E.last&&k>=1){E.last=k;cn.textContent=k;cn.className='';void cn.offsetWidth;cn.className='pop';sfx('tick');}return;}
  if(!E.go){E.go=true;for(const M of E.batch)M.pending=false;cn.textContent='قاتل!';cn.className='';void cn.offsetWidth;cn.className='pop go';sfx('bell');}
  G.entries.shift();}
// ---- الحلبة بالدور: كل ما يُقصى لاعب يدخل اللي بعده ضد الفايز (بنفس صحته) ----
function ringSlots(){const n=Math.max(1,Math.floor(SET.ringSize/2));return SPOTS[n].map(([cx,cz])=>({cx,cz,match:null,holder:null}));}
function alive(F){return !!F&&!F.gone&&!OUT.includes(F.state);}
function isWaiting(F){return alive(F)&&(!F.match||(F.match.done&&F.match.winner===F));}
let outfitBag=[];
function spawnFromQueue(slot,side){const p=G.queue.shift();if(!p)return null;if(!outfitBag.length)outfitBag=shuffle([...OUTFITS.keys()]);
  const F=makeFighter(p.name,outfitBag.pop(),SLOT_COLS[(G.colorIdx++)%SLOT_COLS.length],p.avatar,p.pid);F.x=side*1.36;F.z=slot.cz;F.laneZ=slot.cz;
  if(!G.participants.some(q=>q.pid===p.pid))G.participants.push({pid:p.pid,name:p.name,avatar:p.avatar,bot:!!p.bot});
  sparks.emit(V(F.x,.05,F.z),50,{speed:.5,up:2,colors:[0xffffff,F.c3.getHex()],life:.8,gravity:-.2,box:.15});shock(V(F.x,.01,F.z),F.c3.getHex(),.5,.5,true);sfx('spawn');return F;}
function refill(now){let changed=false;
  for(const s of G.slots){const M=s.match;if(M&&M.done){const loser=M.winner===M.a?M.b:M.a;if(loser.gone&&now-M.doneAt>1400){s.holder=alive(M.winner)?M.winner:null;s.match=null;changed=true;}}
    if(s.holder&&!alive(s.holder))s.holder=null;}
  const empty=G.slots.filter(s=>!s.match);
  const takeHolder=ex=>{for(const s of empty)if(s!==ex&&s.holder){const h=s.holder;s.holder=null;return h;}return null;};
  const batch=[];
  for(const s of empty){if(s.match)continue;let newc=null;
    let a=s.holder;if(!a){a=G.queue.length?(newc=spawnFromQueue(s,-1)):takeHolder(s);}if(!a)continue;
    let b=null;if(G.queue.length){b=newc=spawnFromQueue(s,a.x<=s.cx?1:-1);}else b=takeHolder(s);
    if(!b){s.holder=a;a.laneZ=s.cz;a.homeX=s.cx;continue;}
    s.holder=null;const [l,r]=a.x<=b.x?[a,b]:[b,a];const fin=!G.queue.length&&FS.filter(alive).length===2;
    s.match=makeMatch(l,r,s.cx,s.cz,fin);G.played++;changed=true;s.match.pending=true;s.match.gap=1.05;s.match.newc=newc;s.match.newIds=[l,r].filter(F=>F.st<.05&&F.state==='move'&&F.hp>=CONFIG.hp-.01&&!F.wasIn).map(F=>F.id);batch.push(s.match);[l,r].forEach(F=>F.wasIn=true);
    for(const F of [l,r]){F.homeX=undefined;if(F.state==='wait'||F.state==='victory')setState(F,'move');}
  }
  if(batch.length)scheduleEntry(batch,now);
  G.matches=G.slots.map(s=>s.match).filter(Boolean);if(changed)renderAll();
  const al=FS.filter(alive);
  if(G.phase==='fight'&&G.played>0&&!G.queue.length&&al.length===1&&!G.matches.some(m=>!m.done)){G.slots.forEach(s=>{s.holder=null;s.match=null;});G.matches=[];crown(al[0]);}}
// نظام نقاط المنصة — مرة وحدة لكل بطولة (CLAUDE.md)
function reportPoints(F){if(G.demo){G.pts='demo';return;}if(window.AGPAuth&&typeof window.AGPAuth.reportMatchPoints==='function'){G.pts='pending';const run=G.startedAt;
    Promise.resolve(window.AGPAuth.reportMatchPoints({players:G.participants.map(p=>({id:p.pid,name:p.name})),winnerIds:[F.pid],teamGame:false,durationMs:Date.now()-G.startedAt}))
    .then(res=>{if(run!==G.startedAt)return;const un=String(F.pid).indexOf('tiktok:')===0?String(F.pid).slice(7):String(F.pid);const aw=res&&res.success&&Array.isArray(res.awarded)?res.awarded.find(a=>a.tiktokUsername===un):null;G.pts=aw?aw.added:null;renderWin();})
    .catch(()=>{G.pts=null;renderWin();});}else G.pts=null;}
function ptsLine(){if(G.pts==='demo')return 'نسخة تجربة — بدون نقاط';if(G.pts==='pending')return 'جارٍ احتساب النقاط';return typeof G.pts==='number'?'+'+G.pts+' نقطة':'النقاط للحسابات الموثّقة في الموقع';}
function showWin(F){G.winShown=true;G.winner=F;renderWin();setPhase('win');}
function renderWin(){const F=G.winner;if(!F||!G.winShown)return;const host=$('wCards');host.innerHTML='';
  const std=document.createElement('div');std.className='w-std';
  std.innerHTML='<div class="w-crown"><svg width="60" height="40" viewBox="0 0 60 40" aria-hidden="true"><polygon points="6,36 4,15 15,25 30,5 45,25 56,15 54,36" stroke-width="1.5"></polygon><circle cx="6" cy="13" r="4" stroke-width="1.5"></circle><circle cx="30" cy="4" r="4.5" stroke-width="1.5"></circle><circle cx="54" cy="13" r="4" stroke-width="1.5"></circle><rect x="6" y="32" width="48" height="6" rx="1.5" stroke-width="1.5"></rect></svg></div>'+
    '<div class="w-card"><div class="w-shine"></div><div class="w-in"><span class="w-label">WINNER</span></div></div>';
  const inn=std.querySelector('.w-in');inn.appendChild(avatarEl(F.name,F.avatar,'w-av'));
  const nm=document.createElement('span');nm.className='w-name';nm.textContent=F.name;inn.appendChild(nm);
  const pts=document.createElement('div');pts.className='w-pts';const sp=document.createElement('span');sp.textContent=ptsLine();const sm=document.createElement('small');
  sm.textContent='بطل الحلبة من '+G.participants.length+' لاعبين · صحته '+Math.ceil(F.hp);sp.appendChild(sm);pts.appendChild(sp);inn.appendChild(pts);host.appendChild(std);}
$('wExit').onclick=exitGame;
$('wNew').onclick=()=>{clearArena();G.lobby=G.waiting.splice(0).concat(G.queue.splice(0));setPhase('lobby');renderLobby();};
$('wSame').onclick=()=>{const keep=G.participants.slice();G.waiting=G.waiting.filter(w=>!keep.some(k=>k.pid===w.pid));startTournament(keep);};

// ---- الدعم (من البث أو لوحة التجربة) ----
const findF=key=>FS.find(F=>!F.gone&&(F.id===key||F.pid===key||F.name===key));
const eliminated=F=>F.match&&F.match.done&&F.match.winner!==F;
function tap(key,n=1){const F=findF(key);if(!F||!F.match||OUT.includes(F.state)||eliminated(F)||G.phase==='champion')return;const now=performance.now()/1000;
  if(now-F.lastTap>CONFIG.comboWindow)F.combo=0;F.lastTap=now;F.combo+=n;F.pendingTap=Math.min(F.pendingTap+n*CONFIG.tapDamage,6);
  while(F.combo>=CONFIG.comboTaps){F.combo-=CONFIG.comboTaps;F.queue.push('kick');feed(F,F.name+' كمّل 50 تكبيسة ← ركلة');}}
function power(key,kind,giftLabel){const F=findF(key);if(!F||OUT.includes(F.state)||eliminated(F)||G.phase==='champion')return;
  const p=POWERS.find(x=>x.id===kind);if(!p)return;const g=giftById(SET.gifts[kind]);
  feed(F,F.name+': '+(giftLabel||(g?g.label:''))+' ← '+p.name);
  if(kind==='tiktok'){heal(F);return;}
  if(!F.match)return;
  if(kind==='donut'){if(F.queue.includes('donut')||(F.state==='attack'&&F.atk==='donut'))return;
    if(active(F)&&!F.match.donutActive&&['hit','fly','down','getup'].includes(F.state)){F.fy=0;F.vy=0;setState(F,'move');}
    F.queue.unshift('donut');return;}
  F.queue.push(kind);}
// هدية من البث: نعرف القوة من الهدية اللي اختارها الستريمر بالإعدادات
function giftEvent(key,giftId,count){const p=powerForGift(giftId);if(!p)return false;const g=giftById(giftId);for(let i=0;i<Math.max(1,Math.min(5,count||1));i++)power(key,p.id,g&&g.label);return true;}
const ARENA_API={chat,join:(n,a,id)=>joinPlayer(n,a,id),tap,gift:power,giftEvent,
  state:()=>({ui:UI.phase,phase:G.phase,lobby:G.lobby.map(p=>p.name),waiting:G.waiting.map(p=>p.name),queue:G.queue.map(p=>p.name),players:FS.map(F=>({name:F.name,hp:Math.round(F.hp*10)/10,state:F.state,combo:F.combo})),
    champion:G.champion&&G.champion.name,pending:G.matches.filter(m=>m.pending).length,announce:document.getElementById('announce').classList.contains('show'),music:false,quality:QL,qualitySetting:SET.quality,fps:Math.round(PERF.fps),gifts:Object.assign({},SET.gifts)})};

// ---- البث: التكبيس والهدايا والتعليقات تجي من تيك توك (نفس شد الحبل وفورمولا ون) ----
function renderChips(){}
function renderActs(){}
const GIFT_NAMES={'rose':['Rose'],'tiktok':['TikTok'],'finger-heart':['Finger Heart','FingerHeart'],'donut':['Donut','Doughnut'],'rosa':['Rosa'],'ice-cream':['Ice Cream Cone','Ice Cream'],
  'cake-slice':['Cake Slice'],'love-saudi':['Love Saudi','I Love KSA'],'butterfly':['Butterfly'],'hat-and-mustache':['Hat and Mustache','Hat & Mustache'],'paper-crane':['Paper Crane'],
  'saudi-in-heart':['Saudi in Heart','KSA in my heart'],'heart-in-your-hands-a':['Heart In Your Hands'],'heart-in-your-hands-b':['Heart In Your Hands'],'kings-scepter':["King's Scepter",'Scepter'],
  'kiss':['Kiss'],'hearts':['Hearts'],'corgi':['Corgi'],'galaxy':['Galaxy'],'diving-with-whales':['Diving with Whales'],'lion':['Lion']};
const gkey=s=>String(s==null?'':s).toLowerCase().replace(/[^a-z0-9]/g,'');
function powerForPayload(p){const ids=POWERS.map(x=>x.id);
  for(const id of ids){const gid=SET.gifts[id],k=gkey(p.giftName);if(k&&(k===gkey(gid)||(GIFT_NAMES[gid]||[]).some(n=>gkey(n)===k)))return id;}
  const v=Number(p.giftValue);if(v>0)for(const id of ids){const g=giftById(SET.gifts[id]);if(g&&g.coins===v)return id;}return null;}
let tapsSeen=0,tapsHotT=0;
function onLike(id,count,name,avatar){count=Math.max(1,Math.min(200,Number(count)||1));const F=findF(id);
  if(!F&&UI.phase==='lobby'&&SET.joinMode!=='followers'&&name){joinPlayer(name,avatar,id);return;}if(!F)return;tap(id,count);
  tapsSeen+=count;tapsHotT=performance.now();const el=$('tapsIn');el.textContent='👆 وصل تكبيس من البث: '+tapsSeen;el.classList.add('hot');}
function onStreamGift(p){if(!p||!p.id)return;let F=findF(p.id);
  if(!F&&UI.phase==='lobby'&&(SET.joinMode!=='followers'||p.isFollower)){joinPlayer(p.name||p.id,p.avatarUrl,p.id);return;}
  if(!F)return;const pw=powerForPayload(p);if(!pw)return;const g=giftById(SET.gifts[pw]);const n=Math.max(1,Math.min(5,Number(p.repeatCount)||1));
  for(let i=0;i<n;i++)power(p.id,pw,g&&g.label);}
function bindStream(){const A=window.AymanGamesPlatform;if(!A||!A.events||typeof A.events.on!=='function')return;
  A.events.on('stream:commentReceived',p=>{if(p&&p.id&&typeof p.text==='string')chat(p.name||p.id,p.text,p.avatarUrl,{id:p.id,follower:!!p.isFollower});});
  A.events.on('stream:likeReceived',p=>{if(p&&p.id)onLike(p.id,p.count,p.name,p.avatarUrl);});
  A.events.on('stream:giftReceived',p=>onStreamGift(p));}
bindStream();
function renderQueue(){renderRoster();}
const rosterHp=[];
function renderRoster(){const L=$('rosterList');if(!L)return;L.innerHTML='';rosterHp.length=0;
  const inRing=FS.filter(alive),q=G.queue||[];$('rosterN').textContent=inRing.length+q.length;
  const item=(name,av,col,cls)=>{const d=document.createElement('div');d.className='ro '+cls;d.style.setProperty('--c',col);d.appendChild(avatarEl(name,av,'rav'));const n=document.createElement('span');n.className='rn';n.textContent=name;d.appendChild(n);L.appendChild(d);return d;};
  for(const F of inRing){const d=item(F.name,F.avatar,F.col,isWaiting(F)&&G.phase==='fight'?'w':'');const b=document.createElement('span');b.className='rhp';const i=document.createElement('i');b.appendChild(i);d.appendChild(b);rosterHp.push([F,i]);}
  if(q.length){const sep=document.createElement('div');sep.className='ro-sep';sep.textContent='بالدور';L.appendChild(sep);
    q.slice(0,14).forEach((p,i)=>{const d=item(p.name,p.avatar,'#3a2a5c','q');const n=document.createElement('span');n.className='rq';n.textContent=i+1;d.appendChild(n);});
    if(q.length>14){const m=document.createElement('div');m.className='ro-more';m.textContent='+'+(q.length-14);L.appendChild(m);}}}
function renderQueueOld(){const q=$('qlist');if(!q)return;q.innerHTML='';G.waiting.slice(0,6).forEach(p=>{const li=document.createElement('li');li.textContent=p.name;q.appendChild(li);});
  if(!G.waiting.length){const li=document.createElement('li');li.textContent=SET.autoJoin?'اكتب «'+SET.keyword+'» بالشات':'الدخول التلقائي مقفول';li.style.color='var(--mut)';q.appendChild(li);}
  if(G.waiting.length>6){const li=document.createElement('li');li.textContent='+'+(G.waiting.length-6);q.appendChild(li);}}
const cardEls=[];
function renderCards(){const wrap=$('cards');wrap.innerHTML='';cardEls.length=0;wrap.classList.toggle('many',G.matches.length>2);
  G.matches.forEach(M=>{const c=document.createElement('div');c.className='card'+(M.final?' final':'');
    const side=(F,cls)=>{const p=document.createElement('div');p.className='p '+cls;p.style.setProperty('--c',F.col);p.appendChild(avatarEl(F.name,F.avatar,'av'));
      const pi=document.createElement('div');pi.className='pi';pi.innerHTML='<span class="nm"></span><div class="bar"><i class="gh"></i><i class="hp"></i><span class="v"></span></div><div class="cb"><i></i></div>';
      pi.querySelector('.nm').textContent=F.name;pi.querySelector('.hp').style.background=F.col;p.appendChild(pi);return p;};
    const pl=side(M.a,'l'),pr=side(M.b,'r'),vs=document.createElement('span');vs.className='vs';vs.textContent='ضد';c.append(pl,vs,pr);
    wrap.appendChild(c);cardEls.push({M,c,sides:[[M.a,pl],[M.b,pr]]});});}
function renderAll(){renderChips();renderQueue();renderCards();
  const fin=G.matches.length===1&&G.matches[0].final;
  $('phase').textContent={intro:fin?'النهائي · استعدوا':'استعدوا…',fight:fin?'النهائي':(G.roundNo>1?'الدور '+G.roundNo:'القتال'),champion:'التتويج'}[G.phase]||'';}
addEventListener('keydown',e=>{if(e.key==='Escape'){$('picker').classList.remove('show');if(document.body.classList.contains('settings-open'))closeSettings();}});


/* ===== الحلقة الرئيسية ===== */
const comp=new EffectComposer(R,new THREE.WebGLRenderTarget(4,4,{samples:QL==='low'?0:4,type:THREE.HalfFloatType}));comp.addPass(new RenderPass(scene,cam));
const bloomPass=new UnrealBloomPass(new THREE.Vector2(256,256),.18,.35,.93);comp.addPass(bloomPass);comp.addPass(new OutputPass());
function resize(){const r=stage.getBoundingClientRect();R.setSize(r.width,r.height,false);comp.setPixelRatio(R.getPixelRatio());comp.setSize(r.width,r.height);cam.aspect=r.width/Math.max(1,r.height);cam.updateProjectionMatrix();}
addEventListener('resize',resize);
const camPos=cam.position.clone(),camTgt=V(0,.32,0);
let last=performance.now(),T=0,autoT=0;
function frame(now){requestAnimationFrame(frame);const rdt=Math.min(.05,(now-last)/1000);last=now;
  // الإعدادات الأولى واللوبي يغطّون الشاشة كاملة: نوقف الرسم توفيراً للجهاز
  if(UI.phase==='settings'||UI.phase==='lobby'){PERF.t0=0;PERF.frames=0;return;}
  if(now>G.slowUntil)G.slow+=(1-G.slow)*Math.min(1,rdt*6);const dt=rdt*G.slow;T+=dt;G.st+=dt;
  if(G.phase==='intro'&&G.st>1.5){G.phase='fight';renderAll();}
  if(G.phase==='intro'||G.phase==='fight')refill(now);
  for(const [F,i] of rosterHp)i.style.width=Math.max(0,F.hp)/CONFIG.hp*100+'%';
  entryTick(now);
  for(const M of G.matches){if(M.done)continue;if(M.pending){M.gap=1.05;continue;}M.gapT-=dt;if(M.gapT<=0){const close=Math.random()<.6;const far=G.matches.length>1?rnd(.8,.95):rnd(1,1.3);
    M.gap=close?rnd(.6,.7):far;M.gapT=close?rnd(2.2,3.8):rnd(1.4,2.4);}}
  // التجربة: محاكاة تكبيس المشاهدين وهداياهم (بالبث الحقيقي تجي من تيك توك)
  if(G.demo&&G.phase==='fight'){autoT-=rdt;if(autoT<=0){autoT=.15;for(const F of FS)if(active(F)&&F.pid.startsWith('demo:'))onLike(F.pid,Math.floor(rnd(0,4)));}
    G.demoGiftT-=rdt;if(G.demoGiftT<=0){G.demoGiftT=rnd(2.6,4);const cand=FS.filter(F=>active(F)&&F.pid.startsWith('demo:'));
      if(cand.length){const F=cand[Math.floor(Math.random()*cand.length)];const pw=Math.random()<.05?'donut':['rose','rose','gift5','tiktok'][Math.floor(Math.random()*4)];
        const g=giftById(SET.gifts[pw]);if(g)onStreamGift({id:F.pid,name:F.name,giftName:g.id,giftValue:g.coins,repeatCount:1});}}}
  if(tapsHotT&&now-tapsHotT>900){tapsHotT=0;$('tapsIn').classList.remove('hot');}
  for(const F of [...FS])updateFighter(F,dt,T);
  for(const M of G.matches){const a=M.a,b=M.b;if(a.gone||b.gone||M.done)continue;if(b.x-a.x<.4&&!DOWN.includes(a.state)&&!DOWN.includes(b.state)){const m=(a.x+b.x)/2;a.x=m-.2;b.x=m+.2;}}
  for(const F of FS)poseFighter(F,T);
  for(let i=icons.length-1;i>=0;i--){const ic=icons[i];ic.t+=dt;if(ic.t>ic.dur||ic.F.gone){scene.remove(ic.s);ic.s.material.dispose();icons.splice(i,1);continue;}
    ic.s.visible=true;ic.s.position.copy(ic.F.headPos).add(V(0,.22,0));const k=Math.min(1,ic.t/.2)*(1-ss(ic.dur-.15,ic.dur,ic.t));ic.s.scale.setScalar(.32*k*(1+.08*Math.sin(T*20)));}
  sparks.update(dt);petals.update(dt);bits.update(dt);pluses.update(dt);smoke.update(dt);
  for(let i=rings.length-1;i>=0;i--){const r=rings[i];r.t+=dt;const k=r.t/r.dur;if(k>=1){scene.remove(r.m);r.m.geometry.dispose();r.m.material.dispose();rings.splice(i,1);continue;}
    r.m.scale.setScalar(.05+r.size*ss(0,1,Math.sqrt(k)));r.m.material.opacity=1-k;if(!r.flat)r.m.lookAt(cam.position);}
  for(let i=stars.length-1;i>=0;i--){const s=stars[i];s.t+=dt;const k=s.t/s.dur;if(k>=1){scene.remove(s.s);s.s.material.dispose();stars.splice(i,1);continue;}s.s.scale.setScalar(s.size*Math.sin(Math.min(1,k*1.3)*Math.PI*.5+.2));s.s.material.opacity=1-k;s.s.material.rotation+=dt*3;}
  if(ropeHit>0){ropeHit=Math.max(0,ropeHit-dt*2.5);for(const r of ropes){if(Math.abs(r.base.x)>1.5&&Math.sign(r.base.x)===ropeSide)r.m.position.x=r.base.x+ropeSide*.06*ropeHit*Math.sin(T*40);}}
  if(G.confT>=0){G.confT+=dt;if(G.confT>.6){conf.visible=true;const m=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler(),tt=G.confT-.6;
    confData.forEach((c,i)=>{const y=3-((tt*c.s+c.d)%3.6);e.set(c.r+tt*c.w,c.r*2+tt*c.w*.7,0);q.setFromEuler(e);m.compose(V(c.x+.1*Math.sin(tt*c.w+c.r),y,c.z),q,V(1,1,1));conf.setMatrixAt(i,m);});conf.instanceMatrix.needsUpdate=true;}}
  if(Q.extras)beams.forEach(([m,k])=>{m.rotation.z=.45*Math.sin(T*.7+k*1.3);m.rotation.x=.25*Math.cos(T*.5+k);});
  // الكاميرا: لقطة واسعة للحلبة كاملة، وتقريب وقت الدونات والضربة القاضية والتتويج
  const asp=cam.aspect;let pos,tgt,fov;
  const f=G.focus&&now<G.focus.until&&G.focus.F&&!G.focus.F.gone?G.focus.F:null;
  if(f){const fx=f.char.position.x,fz=f.z;pos=V(fx*.8,.85,fz+1.45);tgt=V(fx,G.focus.ty||.5,fz);fov=asp<1?72:48;}
  else{const alive=FS.filter(F=>!F.gone);const cx=alive.length?alive.reduce((s,F)=>s+F.x,0)/alive.length*.35:0;
    const hw=2.45;let dist=4.2,vf=2*Math.atan(Math.tan(Math.atan(hw/dist))/asp)*180/Math.PI;
    if(vf>62){vf=62;dist=Math.min(6.5,hw/(Math.tan(vf*Math.PI/360)*asp));}
    pos=V(cx+Math.sin(T*.12)*.3,.55+dist*.42,dist);tgt=V(cx,.25,0);fov=vf;}
  const k=Math.min(1,rdt*(f?4:2.2));camPos.lerp(pos,k);camTgt.lerp(tgt,k);cam.fov+=(fov-cam.fov)*k;cam.updateProjectionMatrix();
  G.shake*=Math.exp(-rdt*7);cam.position.copy(camPos).add(V(rnd(-1,1),rnd(-1,1),0).multiplyScalar(G.shake));cam.lookAt(camTgt);
  camFill.position.copy(cam.position).add(V(0,.25,0));
  if(FS.length!==G._rosterCount){G._rosterCount=FS.length;renderRoster();}
  for(const {M,c,sides} of cardEls){c.classList.toggle('done',M.done);for(const [F,el] of sides){F.ghost+=(F.hp-F.ghost)*Math.min(1,rdt*2.5);
    el.querySelector('.hp').style.width=F.hp/CONFIG.hp*100+'%';el.querySelector('.gh').style.width=F.ghost/CONFIG.hp*100+'%';el.querySelector('.v').textContent=(F.gone||eliminated(F))?'أُقصي':Math.ceil(F.hp);
    if(now/1000-F.lastTap>CONFIG.comboWindow&&F.combo>0)F.combo=0;el.querySelector('.cb i').style.width=F.combo/CONFIG.comboTaps*100+'%';}}
  if(Q.bloom)comp.render();else R.render(scene,cam);
  perfTick(now);}
crowdGroup.visible=Q.extras;beams.forEach(([m])=>{m.visible=Q.extras;});bloomPass.enabled=Q.bloom;
resize();renderSettings();renderQBadge();renderFs();renderActs();setPhase('settings');renderLobby();
$('loading').remove();requestAnimationFrame(frame);

/* ===== الربط بالمنصة: الاتصال بالبث (إحصائيات الستريمر وساعاته والبثوث النشطة تنحسب من هالاتصال)،
   احتياط التكبيس لو الخادم ما يرسله، والتحكم عن بعد — نفس فورمولا ون ===== */
const STREAM_KEY='agp:agp-stream-connection';
let _connected=false,liveLikes=false,likesPoll=0;
function readJSON(k,f){try{const r=localStorage.getItem(k);return r?JSON.parse(r):f;}catch(e){return f;}}
function updateLive(){let st=null;try{const A=window.AymanGamesPlatform;st=A&&A.streamConnector&&A.streamConnector.getStatus?A.streamConnector.getStatus('tiktok'):null;}catch(e){}
  const on=st==='connected',el=$('liveBadge');if(!el)return;el.classList.toggle('on',on);el.querySelector('span').textContent=on?'متصل بالبث':(_connected?'جاري الاتصال…':'غير متصل بالبث');}
function connect(){const saved=readJSON(STREAM_KEY,null),A=window.AymanGamesPlatform;
  if(_connected||!saved||!saved.username||!A||!A.streamConnector){updateLive();return;}
  _connected=true;startLikesPoll();try{A.streamConnector.connect('tiktok',{username:saved.username});}catch(e){}updateLive();}
function stopLikesPoll(){if(likesPoll){clearInterval(likesPoll);likesPoll=0;}}
// احتياط: لو أحداث التكبيس ما وصلت من الخادم نقرأ عدّاد المكبّسين من إحصائيات البث كل ثانية
function startLikesPoll(){if(likesPoll||liveLikes)return;let base=null,inflight=false;
  const poll=()=>{const A=window.AGPAuth;if(liveLikes){stopLikesPoll();return;}if(inflight||!A||typeof A.request!=='function')return;inflight=true;
    A.request('/api/stream/session-stats?sections=likers:20').then(d=>{inflight=false;if(liveLikes||!d||!d.success||!d.stats||!d.stats.sections)return;
      const list=d.stats.sections.likers||[],next={};list.forEach(r=>{if(r&&r.username)next[r.username]=Number(r.count)||0;});
      if(base)list.forEach(r=>{if(!r||!r.username)return;const prev=base[r.username],delta=next[r.username]-(prev==null?0:prev);
        if(delta>0)onLike(r.username,delta,r.name,(r.avatarUrls&&r.avatarUrls[0])||null);});
      base=Object.assign(base||{},next);},()=>{inflight=false;});};
  likesPoll=setInterval(poll,1000);poll();}
(function bindPlatform(){const A=window.AymanGamesPlatform;
  if(A&&A.events&&typeof A.events.on==='function'){A.events.on('stream:likeReceived',()=>{liveLikes=true;stopLikesPoll();});A.events.on('stream:statusChanged',updateLive);}
  addEventListener('storage',e=>{if(e.key===STREAM_KEY)connect();});addEventListener('agp:stream-connected',connect);
  connect();setInterval(updateLive,3000);})();

// ---- التحكم عن بعد (js/agp-remote-control.js): من جوال المتحكم أو بأوامر الشات ----
(function attachRemote(){const A=window.AymanGamesPlatform,RC=A&&A.remoteControl;if(!RC||typeof RC.attach!=='function')return;
  const SEC='إعدادات الحلبة',onOff=(arg,cur)=>String(arg||'').trim()?RC.parseBool(arg):!cur;
  const Q_NAMES=['تلقائي','ضعيفة','متوازنة','قوية'],Q_IDS=['auto','low','balanced','high'];
  RC.attach({game:'arena',page:'الحلبة',connect,
    status(){if(UI.phase==='settings')return '⚙ الإعدادات';if(UI.phase==='lobby')return 'اللوبي: '+G.lobby.length+' لاعب · كلمة الدخول «'+SET.keyword+'»';
      if(UI.phase==='win')return '🏆 الفائز '+(G.winner?G.winner.name:'');return '🥊 القتال شغّال · بالحلبة '+FS.filter(alive).length+' · بالدور '+G.queue.length;},
    commands:[
      {names:['ابدأ','ابدا'],desc:'يبدأ القتال',label:'ابدأ القتال 🥊',tone:'primary',run(){if(UI.phase==='settings'){setPhase('lobby');renderLobby();}
        if(UI.phase!=='lobby')return {ok:false,msg:'اللعبة مو باللوبي'};if(!G.lobby.length)return {ok:false,msg:'ما فيه لاعبين باللوبي'};startTournament();return 'بدأ القتال 🥊';}},
      {names:['لوبي','اللوبي'],desc:'يفتح لوبي الدخول',label:'لوبي الدخول',run(){if(UI.phase!=='settings')return {ok:false,msg:'اللعبة مو بالإعدادات'};setPhase('lobby');renderLobby();return 'فتح لوبي الدخول';}},
      {names:['تجربة'],desc:'لاعبين تجريبيين بتكبيس وهدايا محاكاة (بدون نقاط)',label:'تجربة ▷',run(){if(UI.phase!=='lobby')return {ok:false,msg:'التجربة من اللوبي بس'};$('testBtn').click();return 'انضافوا لاعبين تجريبيين';}},
      {names:['جديد','جولة جديدة'],desc:'جولة جديدة من اللوبي',label:'جولة جديدة',run(){if(UI.phase!=='win')return {ok:false,msg:'الجولة ما خلصت'};$('wNew').click();return 'رجعنا للوبي';}},
      {names:['اعادة','إعادة'],desc:'إعادة بنفس اللاعبين',label:'إعادة بنفس اللاعبين 🔁',run(){if(UI.phase!=='win')return {ok:false,msg:'الجولة ما خلصت'};$('wSame').click();return 'بدأت الإعادة';}},
      {names:['شيل','اطرد'],args:'<اسم>',desc:'يشيل لاعب من اللوبي',section:'اللوبي',pick(){return G.lobby.map(p=>p.name);},run(arg){const q=RC.norm(arg);
        const p=G.lobby.find(x=>RC.norm(x.name)===q)||G.lobby.find(x=>RC.norm(x.name).indexOf(q)===0);if(!p)return {ok:false,msg:'ما لقيت هاللاعب'};G.lobby=G.lobby.filter(x=>x!==p);renderLobby();return 'انشال '+p.name;}},
      {names:['الحلبة','عدد الحلبة'],args:'<2–8>',desc:'عدد اللاعبين داخل الحلبة (2، 4، 6، 8)',section:SEC,ui:{type:'number',min:2,max:8,step:2,get(){return SET.ringSize;}},run(arg){const v=RC.toInt(arg);
        if(![2,4,6,8].includes(v))return {ok:false,msg:'2 أو 4 أو 6 أو 8'};SET.ringSize=v;saveSet();renderSettings();return 'داخل الحلبة: '+v;}},
      {names:['الرسوم','جودة'],args:'<'+Q_NAMES.join(' / ')+'>',desc:'جودة الرسوم',section:SEC,ui:{type:'choice',options:Q_NAMES,get(){return Math.max(0,Q_IDS.indexOf(SET.quality));}},run(arg){
        const k=RC.toInt(arg),i=k!=null&&/^\d+$/.test(String(arg).trim())?k:Q_NAMES.map(RC.norm).indexOf(RC.norm(arg));if(i<0||i>3)return {ok:false,msg:Q_NAMES.join(' / ')};
        $('setQ').querySelector('[data-v="'+Q_IDS[i]+'"]').click();return 'الرسوم: '+Q_NAMES[i];}},
      {names:['كلمة','كلمة الدخول'],args:'<الكلمة>',desc:'كلمة الدخول بالشات',section:SEC,ui:{type:'text',get(){return SET.keyword;}},run(arg){const v=String(arg||'').trim().slice(0,20);
        if(!v)return {ok:false,msg:'اكتب الكلمة'};SET.keyword=v;saveSet();renderSettings();renderLobby();return 'كلمة الدخول: '+v;}},
      {names:['المتابعين','متابعين فقط'],args:'[تشغيل / ايقاف]',desc:'الانضمام للمتابعين فقط',section:SEC,ui:{type:'toggle',get(){return SET.joinMode==='followers';}},run(arg){
        const v=onOff(arg,SET.joinMode==='followers');if(v==null)return {ok:false,msg:'تشغيل أو ايقاف'};SET.joinMode=v?'followers':'all';saveSet();renderSettings();return v?'المتابعين فقط':'الجميع يقدر يدخل';}},
      {names:['الدخول التلقائي','تلقائي'],args:'[تشغيل / ايقاف]',desc:'اللي يكتب الكلمة وقت القتال يدخل بالدور',section:SEC,ui:{type:'toggle',get(){return !!SET.autoJoin;}},run(arg){
        const v=onOff(arg,SET.autoJoin);if(v==null)return {ok:false,msg:'تشغيل أو ايقاف'};SET.autoJoin=v;saveSet();renderAJ();renderSettings();return 'الدخول التلقائي: '+(v?'تشغيل':'ايقاف');}},
      {names:['الصوت','الأصوات'],args:'[تشغيل / ايقاف]',desc:'أصوات الضربات والهدايا',section:SEC,ui:{type:'toggle',get(){return !!SET.sfx;}},run(arg){
        const v=onOff(arg,SET.sfx);if(v==null)return {ok:false,msg:'تشغيل أو ايقاف'};$('setSfx').checked=v;$('setSfx').dispatchEvent(new Event('change'));return 'الأصوات: '+(v?'تشغيل':'ايقاف');}}
    ]});})();

ARENA_API.ready=true;if(window.AymanGamesPlatform)window.AymanGamesPlatform.arena=ARENA_API;
if(/[?&]demo=1/.test(location.search)){window.BeastArena=ARENA_API;window.arenaReady=true;}

