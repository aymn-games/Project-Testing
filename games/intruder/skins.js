// (crew-base.js inlined below)
// CrewBase: one shared space-crew body for all platform games.
// Local coords face right (+x); origin at body center-bottom area; feet ≈ y 28, head top ≈ y -31.
// draw(ctx,{color,face,t,state:'idle'|'walk'|'run',alpha, behind(ctx,A), front(ctx,A)})
(function(){
  const OL='rgba(8,10,18,.55)', LW=2;
  function shade(h,k){ h=String(h||'#ef4444').replace('#',''); if(h.length===3) h=h.split('').map(x=>x+x).join('');
    let r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16); const T=k>0?255:0,a=Math.abs(k);
    r=Math.round(r+(T-r)*a); g=Math.round(g+(T-g)*a); b=Math.round(b+(T-b)*a); return 'rgb('+r+','+g+','+b+')'; }
  function rr(ctx,x,y,w,h,r){ ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(x,y,w,h,r); else { ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); } }
  const A={ body:{cx:0,cy:-15,rx:22,ry:38}, headTop:-53, visor:{x:-7,y:-44,w:32,h:21,cx:9,cy:-34}, chestY:-6, hipY:14, feetY:40, backX:-22, frontX:20 };
  function pose(t,state){
    const mv=state==='walk'||state==='run', ph=state==='run'?t/85:state==='walk'?t/130:0;
    return { mv, ph, bob:mv?-Math.abs(Math.sin(ph))*(state==='run'?3:2.2):Math.sin(t/650)*.8, lean:state==='run'?.08:0,
      leg:s=>mv?{dx:Math.sin(ph+(s<0?0:Math.PI))*(state==='run'?6:4.5),lift:Math.max(0,Math.cos(ph+(s<0?0:Math.PI)))*(state==='run'?4.5:3)}:{dx:0,lift:0},
      arm:s=>mv?Math.sin(ph+(s<0?Math.PI:0))*(state==='run'?.7:.45):Math.sin(t/650+s)*.05 };
  }
  function bodyPath(ctx,B,inset){ const i=inset||0, l=B.cx-B.rx+i, r=B.cx+B.rx-i, t=B.cy-B.ry+i, bt=B.cy+B.ry-i, w=r-l, tr=w/2, br=Math.min(19,w/2), bg=4, sy=t+tr, ey=bt-br, my=(sy+ey)/2;
    ctx.beginPath(); ctx.moveTo(l,sy); ctx.arc(l+tr,sy,tr,Math.PI,0); ctx.bezierCurveTo(r+bg,my-12,r+bg,my+12,r,ey); ctx.quadraticCurveTo(r,bt,r-br,bt); ctx.lineTo(l+br,bt); ctx.quadraticCurveTo(l,bt,l,ey); ctx.bezierCurveTo(l-bg,my+12,l-bg,my-12,l,sy); ctx.closePath(); }
  function limb(ctx,x,y,w,h,rot,c1,c2,rad){ ctx.save(); ctx.translate(x,y); ctx.rotate(rot); const g=ctx.createLinearGradient(-w/2,0,w/2,0); g.addColorStop(0,c1); g.addColorStop(1,c2); rr(ctx,-w/2,0,w,h,rad||w/2); ctx.fillStyle=g; ctx.fill(); ctx.lineWidth=LW; ctx.strokeStyle=OL; ctx.stroke(); ctx.restore(); }
  function draw(ctx,o){
    const c=o.color||'#ef4444', face=o.face<0?-1:1, P=pose(o.t||0,o.state||'idle'), B=A.body;
    ctx.save(); ctx.globalAlpha*=o.alpha==null?1:o.alpha; ctx.lineJoin='round'; ctx.lineCap='round';
    ctx.beginPath(); ctx.ellipse(0,A.feetY+2,19+P.bob*.6,5,0,0,7); ctx.fillStyle='rgba(0,0,0,.32)'; ctx.fill();
    ctx.scale(face,1);
    // legs (back first)
    [-1,1].forEach(s=>{ const L=P.leg(s), X=s*9.5+L.dx, Y=8+P.bob*.4, H=A.feetY-8-L.lift; limb(ctx,X,Y,15,H,0,shade(c,s<0?-.3:-.08),shade(c,s<0?-.45:-.3),5);
      if(o.legColor){ const lc=o.legColor; limb(ctx,X,Y,15,H*(o.legCover||1),0,shade(lc,s<0?-.3:-.08),shade(lc,s<0?-.45:-.3),5); } });
    const ac=o.armColor||c;
    ctx.translate(0,P.bob); ctx.rotate(P.lean);
    if(o.behind) o.behind(ctx,A,P);
    limb(ctx,A.backX+1,-10,9,17,.25+P.arm(-1),shade(ac,-.38),shade(ac,-.55));
    // body
    bodyPath(ctx,B);
    const g=ctx.createLinearGradient(B.cx-B.rx,0,B.cx+B.rx,0); g.addColorStop(0,shade(c,-.12)); g.addColorStop(.28,shade(c,.1)); g.addColorStop(.6,c); g.addColorStop(1,shade(c,-.32)); ctx.fillStyle=g; ctx.fill();
    ctx.save(); ctx.clip(); const tg=ctx.createRadialGradient(-6,B.cy-B.ry+10,1,-6,B.cy-B.ry+10,22); tg.addColorStop(0,'rgba(255,255,255,.16)'); tg.addColorStop(1,'rgba(255,255,255,0)'); ctx.fillStyle=tg; ctx.fillRect(B.cx-B.rx,B.cy-B.ry,B.rx*2,40); ctx.beginPath(); ctx.ellipse(2,B.cy+B.ry+4,27,12,0,0,7); ctx.fillStyle='rgba(0,0,0,.2)'; ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.moveTo(B.cx-B.rx+3,B.cy+6); ctx.lineTo(B.cx-B.rx+3,B.cy-B.ry+B.rx); ctx.arc(B.cx,B.cy-B.ry+B.rx,B.rx-3,Math.PI,Math.PI*1.32); ctx.strokeStyle='rgba(255,255,255,.12)'; ctx.lineWidth=2.4; ctx.stroke();
    bodyPath(ctx,B); ctx.lineWidth=LW; ctx.strokeStyle=OL; ctx.stroke();
    if(o.onBody) o.onBody(ctx,A,P);
    // visor
    const V=A.visor; rr(ctx,V.x,V.y,V.w,V.h,V.h/2);
    const vg=ctx.createLinearGradient(0,V.y,0,V.y+V.h); vg.addColorStop(0,'#3b4352'); vg.addColorStop(.35,'#1c222c'); vg.addColorStop(1,'#07090d'); ctx.fillStyle=vg; ctx.fill();
    ctx.save(); ctx.clip(); ctx.beginPath(); ctx.ellipse(V.cx-2,V.y+V.h+2,20,7,0,0,7); ctx.fillStyle='rgba(30,64,120,.35)'; ctx.fill(); ctx.restore();
    rr(ctx,V.x,V.y,V.w,V.h,V.h/2); ctx.lineWidth=LW; ctx.strokeStyle=OL; ctx.stroke();
    rr(ctx,V.x+6,V.y+3.5,14,3.5,1.8); ctx.fillStyle='rgba(255,255,255,.22)'; ctx.fill();
    ctx.beginPath(); ctx.arc(V.x+V.w-6,V.y+4.5,1.8,0,7); ctx.fillStyle='rgba(255,255,255,.18)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(V.x+6,V.y+V.h-4); ctx.quadraticCurveTo(V.cx,V.y+V.h-1.5,V.x+V.w-5,V.y+V.h-5); ctx.strokeStyle='rgba(120,170,255,.28)'; ctx.lineWidth=1.6; ctx.stroke();
    if(o.front) o.front(ctx,A,P);
    limb(ctx,A.frontX-1,-9,9,16,-.2+P.arm(1),shade(ac,-.05),shade(ac,-.32));
    if(o.top) o.top(ctx,A,P);
    ctx.restore();
  }
  window.CrewBase={draw,shade,rr,bodyPath,anchors:A,pose};
})();

// Shared character + cosmetics renderer for الدخيل (Play, Join, Lobby)
(function(){
  const HATS=[
    {id:'none',n:'بدون'},{id:'crown',n:'تاج'},{id:'cap',n:'كاب'},{id:'party',n:'حفلة'},{id:'chef',n:'شيف'},
    {id:'horns',n:'قرون'},{id:'halo',n:'هالة'},{id:'phones',n:'سماعات'},{id:'flower',n:'وردة'},{id:'beanie',n:'طاقية'},
    {id:'shmagh',n:'شماغ'},{id:'helmet',n:'خوذة'},{id:'tophat',n:'قبعة رسمية'},{id:'cowboy',n:'كاوبوي'},{id:'pirate',n:'قرصان'},{id:'wizard',n:'ساحر'},{id:'beret',n:'بيريه'},{id:'santa',n:'بابا نويل'},{id:'viking',n:'فايكنغ'},{id:'bandana',n:'باندانا'}];
  const ACCS=[
    {id:'none',n:'بدون'},{id:'shades',n:'نظارة شمسية'},{id:'glasses',n:'نظارة'},{id:'stache',n:'شنب'},{id:'mask',n:'كمامة'},{id:'bow',n:'فيونكة'},{id:'scarf',n:'وشاح'},{id:'monocle',n:'مونوكل'},{id:'beard',n:'لحية'},{id:'vr',n:'نظارة VR'},{id:'patch',n:'رقعة عين'},{id:'clown',n:'أنف مهرج'},{id:'blush',n:'خدود'}];
  const TOPS=[{id:'none',n:'بدون'},{id:'tee',n:'تيشيرت'},{id:'hoodie',n:'هودي'},{id:'suit',n:'بدلة'},{id:'thobe',n:'ثوب'},{id:'jersey',n:'قميص رياضي'},{id:'lab',n:'لاب كوت'},{id:'vest',n:'سترة أمان'},{id:'armor',n:'درع'},{id:'tux',n:'سموكن'},{id:'overall',n:'أفرول'},{id:'sweater',n:'كنزة مخططة'}];
  const PANTS=[{id:'none',n:'بدون'},{id:'jeans',n:'جينز'},{id:'black',n:'أسود'},{id:'khaki',n:'كاكي'},{id:'shorts',n:'شورت'},{id:'camo',n:'عسكري'},{id:'white',n:'أبيض'},{id:'track',n:'رياضي'}];
  const BACKS=[{id:'none',n:'بدون'},{id:'backpack',n:'شنطة'},{id:'cape',n:'عباءة'},{id:'wings',n:'أجنحة'},{id:'jetpack',n:'جت باك'},{id:'sword',n:'سيف'},{id:'balloon',n:'بالون'},{id:'tank',n:'خزان أكسجين'},{id:'guitar',n:'جيتار'}];
  const PANT_C={jeans:'#2563eb',black:'#1f2937',khaki:'#a16207',shorts:'#dc2626',camo:'#4d7c0f',white:'#e5e7eb',track:'#7c3aed'};
  const el=(ctx,x,y,rx,ry,f,rot)=>{ ctx.beginPath(); ctx.ellipse(x,y,rx,ry,rot||0,0,7); ctx.fillStyle=f; ctx.fill(); };
  const ln=(ctx,pts,c,w)=>{ ctx.beginPath(); ctx.moveTo(pts[0],pts[1]); for(let i=2;i<pts.length;i+=2) ctx.lineTo(pts[i],pts[i+1]); ctx.strokeStyle=c; ctx.lineWidth=w; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.stroke(); };
  function hat(ctx,id,c,face){
    switch(id){
      case 'crown': ctx.beginPath(); ctx.moveTo(-14,-30); ctx.lineTo(-16,-46); ctx.lineTo(-8,-38); ctx.lineTo(0,-50); ctx.lineTo(8,-38); ctx.lineTo(16,-46); ctx.lineTo(14,-30); ctx.closePath(); ctx.fillStyle='#facc15'; ctx.fill(); ctx.strokeStyle='#a16207'; ctx.lineWidth=2; ctx.stroke(); el(ctx,0,-36,3,3,'#ef4444'); break;
      case 'cap': el(ctx,0,-32,18,10,'#2563eb'); ctx.fillStyle='#2563eb'; ctx.fillRect(-18,-32,36,4); el(ctx,face*16,-28,14,4,'#1d4ed8'); el(ctx,0,-41,3,2,'#93c5fd'); break;
      case 'party': ctx.beginPath(); ctx.moveTo(-11,-31); ctx.lineTo(2,-60); ctx.lineTo(13,-31); ctx.closePath(); ctx.fillStyle='#ec4899'; ctx.fill(); ln(ctx,[-7,-40,9,-44],'#fde68a',3); ln(ctx,[-3,-50,6,-52],'#fde68a',3); el(ctx,2,-61,4,4,'#fde68a'); break;
      case 'chef': ctx.fillStyle='#f8fafc'; ctx.fillRect(-12,-40,24,10); el(ctx,-8,-46,9,9,'#f8fafc'); el(ctx,8,-46,9,9,'#f8fafc'); el(ctx,0,-52,10,9,'#f8fafc'); ln(ctx,[-12,-33,12,-33],'#cbd5e1',2); break;
      case 'horns': [[-1,1],[1,-1]].forEach(([s])=>{ ctx.beginPath(); ctx.moveTo(s*8,-30); ctx.quadraticCurveTo(s*14,-44,s*20,-48); ctx.quadraticCurveTo(s*14,-38,s*16,-28); ctx.closePath(); ctx.fillStyle='#dc2626'; ctx.fill(); }); break;
      case 'halo': ctx.beginPath(); ctx.ellipse(0,-46,14,4.5,0,0,7); ctx.strokeStyle='#fde047'; ctx.lineWidth=3.5; ctx.shadowColor='#fde047'; ctx.shadowBlur=8; ctx.stroke(); ctx.shadowBlur=0; break;
      case 'phones': ctx.beginPath(); ctx.arc(0,-14,23,Math.PI*1.05,Math.PI*1.95); ctx.strokeStyle='#1f2937'; ctx.lineWidth=4; ctx.stroke(); el(ctx,-21,-12,5,8,'#111827'); el(ctx,21,-12,5,8,'#111827'); el(ctx,-21,-12,2.5,4,'#a855f7'); el(ctx,21,-12,2.5,4,'#a855f7'); break;
      case 'flower': for(let i=0;i<5;i++){ const a=i/5*Math.PI*2; el(ctx,-10+Math.cos(a)*5,-32+Math.sin(a)*5,4,4,'#f9a8d4'); } el(ctx,-10,-32,3,3,'#facc15'); break;
      case 'beanie': ctx.beginPath(); ctx.arc(0,-24,19,Math.PI,0); ctx.fillStyle='#16a34a'; ctx.fill(); ctx.fillStyle='#15803d'; ctx.fillRect(-20,-27,40,6); el(ctx,0,-44,5,5,'#bbf7d0'); break;
      case 'shmagh': ctx.beginPath(); ctx.moveTo(-22,-14); ctx.quadraticCurveTo(-24,-38,0,-37); ctx.quadraticCurveTo(24,-38,22,-14); ctx.lineTo(26,6); ctx.lineTo(16,-6); ctx.quadraticCurveTo(0,-30,-16,-6); ctx.lineTo(-26,6); ctx.closePath(); ctx.fillStyle='#f8fafc'; ctx.fill();
        ctx.save(); ctx.clip(); ctx.strokeStyle='rgba(220,38,38,.75)'; ctx.lineWidth=1.6; for(let i=-40;i<40;i+=6){ ctx.beginPath(); ctx.moveTo(i,-40); ctx.lineTo(i+30,10); ctx.stroke(); ctx.beginPath(); ctx.moveTo(i,-40); ctx.lineTo(i-30,10); ctx.stroke(); } ctx.restore();
        ctx.beginPath(); ctx.ellipse(0,-32,17,4,0,0,7); ctx.strokeStyle='#111'; ctx.lineWidth=3; ctx.stroke(); break;
      case 'tophat': ctx.fillStyle='#111827'; ctx.fillRect(-11,-56,22,24); el(ctx,0,-32,19,4,'#111827'); ctx.fillStyle='#dc2626'; ctx.fillRect(-11,-38,22,4); break;
      case 'cowboy': el(ctx,0,-31,27,6,'#92400e'); ctx.beginPath(); ctx.ellipse(0,-38,13,11,0,Math.PI,0); ctx.fillStyle='#b45309'; ctx.fill(); ctx.fillStyle='#78350f'; ctx.fillRect(-13,-36,26,3); break;
      case 'pirate': ctx.beginPath(); ctx.moveTo(-24,-30); ctx.quadraticCurveTo(0,-62,24,-30); ctx.quadraticCurveTo(0,-38,-24,-30); ctx.fillStyle='#111827'; ctx.fill(); el(ctx,0,-41,4,4,'#f8fafc'); break;
      case 'wizard': ctx.beginPath(); ctx.moveTo(-17,-31); ctx.lineTo(face*6,-70); ctx.lineTo(17,-31); ctx.closePath(); ctx.fillStyle='#4338ca'; ctx.fill(); el(ctx,0,-31,21,4,'#3730a3'); el(ctx,-3,-46,2.5,2.5,'#fde047'); el(ctx,4,-55,2,2,'#fde047'); break;
      case 'beret': el(ctx,face*3,-33,19,7,'#be123c',face*-.2); el(ctx,face*3,-40,2.5,3,'#9f1239'); break;
      case 'santa': ctx.beginPath(); ctx.moveTo(-17,-32); ctx.quadraticCurveTo(0,-62,face*22,-44); ctx.lineTo(17,-32); ctx.closePath(); ctx.fillStyle='#dc2626'; ctx.fill(); el(ctx,0,-32,19,5,'#f8fafc'); el(ctx,face*22,-44,5,5,'#f8fafc'); break;
      case 'viking': ctx.beginPath(); ctx.arc(0,-26,18,Math.PI,0); ctx.fillStyle='#9ca3af'; ctx.fill(); ctx.fillStyle='#6b7280'; ctx.fillRect(-19,-28,38,4); [[-1],[1]].forEach(([d])=>{ ctx.beginPath(); ctx.moveTo(d*16,-30); ctx.quadraticCurveTo(d*30,-34,d*28,-50); ctx.quadraticCurveTo(d*24,-38,d*14,-36); ctx.closePath(); ctx.fillStyle='#f5f5f4'; ctx.fill(); }); break;
      case 'bandana': ctx.beginPath(); ctx.arc(0,-22,20,Math.PI*1.02,Math.PI*1.98); ctx.lineTo(18,-26); ctx.lineTo(-18,-26); ctx.closePath(); ctx.fillStyle='#ea580c'; ctx.fill(); el(ctx,-face*20,-24,5,3,'#ea580c'); el(ctx,-4,-32,1.6,1.6,'#fff'); el(ctx,6,-34,1.6,1.6,'#fff'); break;
      case 'helmet': ctx.beginPath(); ctx.ellipse(0,-12,25,28,0,0,7); ctx.fillStyle='rgba(186,230,253,.18)'; ctx.fill(); ctx.strokeStyle='rgba(224,242,254,.8)'; ctx.lineWidth=2.5; ctx.stroke(); el(ctx,-10,-28,6,3,'rgba(255,255,255,.5)',-.5); break;
    }
  }
  function acc(ctx,id,c,face){
    const ex=face*4;
    switch(id){
      case 'shades': ctx.fillStyle='#0f172a'; ctx.beginPath(); ctx.roundRect?ctx.roundRect(ex-13,-20,26,10,4):ctx.rect(ex-13,-20,26,10); ctx.fill(); ln(ctx,[ex-13,-16,-20,-18],'#0f172a',2.5); ln(ctx,[ex+13,-16,20,-18],'#0f172a',2.5); el(ctx,ex-6,-17,3,1.4,'rgba(255,255,255,.4)'); break;
      case 'glasses': ctx.beginPath(); ctx.arc(ex,-15,11,0,7); ctx.strokeStyle='#78350f'; ctx.lineWidth=2.5; ctx.stroke(); ln(ctx,[ex-11,-15,-20,-17],'#78350f',2); ln(ctx,[ex+11,-15,20,-17],'#78350f',2); break;
      case 'stache': ctx.beginPath(); ctx.moveTo(ex,-3); ctx.quadraticCurveTo(ex-8,-8,ex-13,-2); ctx.quadraticCurveTo(ex-7,0,ex,-1); ctx.quadraticCurveTo(ex+7,0,ex+13,-2); ctx.quadraticCurveTo(ex+8,-8,ex,-3); ctx.fillStyle='#3f2a14'; ctx.fill(); break;
      case 'mask': ctx.beginPath(); ctx.ellipse(ex*.6,-1,14,7,0,0,7); ctx.fillStyle='#e0f2fe'; ctx.fill(); ln(ctx,[ex*.6-14,-2,-19,-8],'#e0f2fe',1.5); ln(ctx,[ex*.6+14,-2,19,-8],'#e0f2fe',1.5); ln(ctx,[ex*.6-8,-2,ex*.6+8,-2],'rgba(14,116,144,.4)',1.2); break;
      case 'bow': ctx.beginPath(); ctx.moveTo(0,4); ctx.lineTo(-10,-1); ctx.lineTo(-10,9); ctx.closePath(); ctx.moveTo(0,4); ctx.lineTo(10,-1); ctx.lineTo(10,9); ctx.closePath(); ctx.fillStyle='#dc2626'; ctx.fill(); el(ctx,0,4,3,3,'#991b1b'); break;
      case 'monocle': ctx.beginPath(); ctx.arc(ex+2,-15,10.5,0,7); ctx.strokeStyle='#ca8a04'; ctx.lineWidth=2.5; ctx.stroke(); ln(ctx,[ex+10,-9,ex+12,6],'#ca8a04',1.2); break;
      case 'beard': ctx.beginPath(); ctx.moveTo(-17,-6); ctx.quadraticCurveTo(-14,14,0,16); ctx.quadraticCurveTo(14,14,17,-6); ctx.quadraticCurveTo(0,4,-17,-6); ctx.fillStyle='#3f2a14'; ctx.fill(); break;
      case 'vr': ctx.fillStyle='#e5e7eb'; ctx.beginPath(); ctx.roundRect?ctx.roundRect(ex-15,-24,30,16,5):ctx.rect(ex-15,-24,30,16); ctx.fill(); ctx.fillStyle='#38bdf8'; ctx.fillRect(ex-11,-20,22,6); ln(ctx,[ex-15,-17,-20,-18],'#111827',3); break;
      case 'patch': ln(ctx,[-18,-26,18,-8],'#111827',2); el(ctx,ex,-15,8,7,'#111827'); break;
      case 'clown': el(ctx,ex+3,-4,5.5,5.5,'#ef4444'); el(ctx,ex+1.5,-6,1.6,1.6,'rgba(255,255,255,.6)'); break;
      case 'blush': el(ctx,ex-11,-5,4.5,2.6,'rgba(244,114,182,.75)'); el(ctx,ex+13,-5,4.5,2.6,'rgba(244,114,182,.75)'); break;
      case 'scarf': ctx.beginPath(); ctx.ellipse(0,3,19,5,0,0,7); ctx.fillStyle='#f97316'; ctx.fill(); ctx.fillStyle='#ea580c'; ctx.fillRect(face*-8,3,7,16); break;
    }
  }
  const ARM_C={tee:'#f8fafc',hoodie:'#475569',suit:'#1e293b',thobe:'#f8fafc',jersey:'#16a34a',lab:'#f8fafc',vest:'#f97316',armor:'#9ca3af',tux:'#0f172a',sweater:'#dc2626'};
  function shadeOver(ctx){ const g=ctx.createLinearGradient(-22,0,22,0); g.addColorStop(0,'rgba(0,0,0,.18)'); g.addColorStop(.3,'rgba(255,255,255,.07)'); g.addColorStop(.6,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(0,0,0,.28)'); ctx.fillStyle=g; ctx.fillRect(-26,-60,52,90); }
  function top(ctx,id,A,face){
    const CB=window.CrewBase; ctx.save(); CB.bodyPath(ctx,A.body); ctx.clip(); const F=(col,y,h)=>{ ctx.fillStyle=col; ctx.fillRect(-26,y,52,h||60); };
    switch(id){
      case 'tee': F('#f8fafc',-27); break;
      case 'hoodie': F('#475569',-30); ln(ctx,[4,-22,4,-10],'#e2e8f0',1.6); ln(ctx,[13,-22,13,-10],'#e2e8f0',1.6); el(ctx,6,6,12,5,'#334155'); break;
      case 'suit': F('#1e293b',-27); ctx.beginPath(); ctx.moveTo(2,-27); ctx.lineTo(9,-8); ctx.lineTo(16,-27); ctx.fillStyle='#f8fafc'; ctx.fill(); ln(ctx,[9,-21,9,-6],'#dc2626',3); break;
      case 'thobe': F('#f8fafc',-30,80); ln(ctx,[9,-22,9,2],'#e2e8f0',1.4); el(ctx,9,-17,1.5,1.5,'#cbd5e1'); el(ctx,9,-11,1.5,1.5,'#cbd5e1'); break;
      case 'jersey': F('#16a34a',-27); ctx.fillRect(-26,-27,52,4); ctx.save(); ctx.translate(4,2); ctx.scale(face<0?-1:1,1); ctx.fillStyle='#f8fafc'; ctx.font='900 14px sans-serif'; ctx.textAlign='center'; ctx.fillText('10',0,0); ctx.restore(); break;
      case 'lab': F('#f8fafc',-27); ln(ctx,[7,-24,7,23],'#cbd5e1',1.6); ctx.fillStyle='#38bdf8'; ctx.fillRect(11,-14,6,7); break;
      case 'vest': F('#f97316',-27); ln(ctx,[-24,-12,24,-12],'#fde047',3); ln(ctx,[-24,-3,24,-3],'#fde047',3); break;
      case 'armor': F('#9ca3af',-29); ln(ctx,[-24,-14,24,-14],'#6b7280',2); el(ctx,7,-4,6,6,'#facc15'); break;
      case 'tux': F('#0f172a',-27); ctx.beginPath(); ctx.moveTo(2,-27); ctx.lineTo(9,-4); ctx.lineTo(16,-27); ctx.fillStyle='#f8fafc'; ctx.fill(); ctx.beginPath(); ctx.moveTo(4,-23); ctx.lineTo(9,-20); ctx.lineTo(4,-17); ctx.moveTo(14,-23); ctx.lineTo(9,-20); ctx.lineTo(14,-17); ctx.fillStyle='#111'; ctx.fill(); break;
      case 'overall': F('#1d4ed8',-6); ctx.fillStyle='#1d4ed8'; ctx.fillRect(-2,-27,5,22); ctx.fillRect(14,-27,5,22); el(ctx,0,-6,1.8,1.8,'#facc15'); el(ctx,16,-6,1.8,1.8,'#facc15'); break;
      case 'sweater': for(let i=0;i<10;i++) F(i%2?'#f8fafc':'#dc2626',-27+i*6,6); break;
    }
    shadeOver(ctx); ctx.restore();
  }
  function back(ctx,id,c,face){
    const bx=-face*14;
    switch(id){
      case 'backpack': ctx.fillStyle='#78350f'; ctx.beginPath(); ctx.roundRect?ctx.roundRect(bx-9,-24,14,30,5):ctx.rect(bx-9,-24,14,30); ctx.fill(); ctx.fillStyle='#92400e'; ctx.fillRect(bx-8,-6,12,7); break;
      case 'cape': ctx.beginPath(); ctx.moveTo(-14,-26); ctx.quadraticCurveTo(-face*34,0,-face*22,26); ctx.lineTo(face*6,22); ctx.quadraticCurveTo(0,-4,14,-26); ctx.closePath(); ctx.fillStyle='#b91c1c'; ctx.fill(); break;
      case 'wings': [-1,1].forEach(d=>{ ctx.beginPath(); ctx.moveTo(d*8,-18); ctx.quadraticCurveTo(d*44,-40,d*36,-2); ctx.quadraticCurveTo(d*26,-8,d*10,-4); ctx.closePath(); ctx.fillStyle='rgba(248,250,252,.95)'; ctx.fill(); ctx.strokeStyle='#cbd5e1'; ctx.lineWidth=1.2; ctx.stroke(); }); break;
      case 'jetpack': [-6,6].forEach(o=>{ ctx.fillStyle='#64748b'; ctx.fillRect(bx+o-5,-26,10,26); el(ctx,bx+o,4,4,6,'#f97316'); el(ctx,bx+o,6,2,4,'#fde047'); }); break;
      case 'sword': ln(ctx,[bx-6,10,bx+14,-44],'#cbd5e1',4); ln(ctx,[bx-2,-2,bx+8,4],'#a16207',4); break;
      case 'balloon': ln(ctx,[face*20,4,face*30,-44],'#e5e7eb',1); el(ctx,face*30,-56,11,13,'#ec4899'); el(ctx,face*26,-61,3,4,'rgba(255,255,255,.5)'); break;
      case 'tank': ctx.fillStyle='#e5e7eb'; ctx.beginPath(); ctx.roundRect?ctx.roundRect(bx-7,-30,13,32,6):ctx.rect(bx-7,-30,13,32); ctx.fill(); ctx.fillStyle='#22c55e'; ctx.fillRect(bx-7,-20,13,4); break;
      case 'guitar': ctx.save(); ctx.translate(bx,-6); ctx.rotate(-face*.5); el(ctx,0,10,10,12,'#b45309'); ctx.fillStyle='#78350f'; ctx.fillRect(-2,-32,4,34); el(ctx,0,10,3,3,'#1f2937'); ctx.restore(); break;
    }
  }
  function bean(ctx,x,y,c,face,t,mv,alpha,sk){
    sk=sk||{}; const CB=window.CrewBase; ctx.save(); ctx.translate(x,y-4); ctx.scale(.85,.85);
    const pc=sk.pants&&sk.pants!=='none'?PANT_C[sk.pants]:null, wear=(fn)=>(cx,A,P)=>{ cx.save(); fn(cx,A,P); cx.restore(); };
    CB.draw(ctx,{color:c,face,t,state:mv?'walk':'idle',alpha:alpha==null?1:alpha,legColor:pc,legCover:sk.pants==='shorts'?.42:1,armColor:ARM_C[sk.top]||null,
      behind:sk.back&&sk.back!=='none'&&sk.back!=='balloon'?wear(cx=>{ cx.translate(0,-8); cx.scale(1.15,1.15); back(cx,sk.back,c,1); }):null,
      onBody:(cx,A)=>{ const tp=sk.top&&sk.top!=='none'; if(tp) top(cx,sk.top,A,face);
        if(pc){ cx.save(); CB.bodyPath(cx,A.body); cx.clip(); cx.fillStyle=pc; cx.fillRect(-26,9,52,20); shadeOver(cx); cx.restore(); }
        if(tp||pc){ CB.bodyPath(cx,A.body); cx.lineWidth=2; cx.strokeStyle='rgba(8,10,18,.55)'; cx.stroke(); } },
      front:sk.acc&&sk.acc!=='none'?wear(cx=>{ cx.translate(5,-17.5); cx.scale(1.1,1.1); acc(cx,sk.acc,c,1); }):null,
      top:wear(cx=>{ if(sk.hat&&sk.hat!=='none'){ cx.save(); cx.translate(0,-17.8); cx.scale(1.1,1.1); hat(cx,sk.hat,c,1); cx.restore(); } if(sk.back==='balloon'){ cx.translate(0,-8); cx.scale(1.15,1.15); back(cx,'balloon',c,1); } }) });
    ctx.restore();
  }
  const cache={};
  function thumb(c,sk,size){
    sk=sk||{}; size=size||96; const key=[c,sk.hat,sk.acc,sk.top,sk.pants,sk.back,size].join('|'); if(cache[key]) return cache[key];
    const dpr=2, w=size, h=Math.round(size*1.5), cv=document.createElement('canvas'); cv.width=w*dpr; cv.height=h*dpr;
    const ctx=cv.getContext('2d'), s=w/80*dpr; ctx.setTransform(s,0,0,s,40*s,78*s); bean(ctx,0,0,c,1,0,false,1,sk);
    return cache[key]=cv.toDataURL();
  }
  const pick=a=>a[Math.floor(Math.random()*a.length)].id;
  const SLOTS=[{k:'hat',n:'الراس',icon:'🎩',items:HATS},{k:'acc',n:'الوجه',icon:'🕶️',items:ACCS},{k:'top',n:'الملابس',icon:'👕',items:TOPS},{k:'pants',n:'البنطلون',icon:'👖',items:PANTS},{k:'back',n:'الظهر',icon:'🎒',items:BACKS}];
  const opt=(a,p)=>Math.random()<p?pick(a):'none';
  const clean=sk=>{ const o={}; SLOTS.forEach(s=>{ const v=sk&&sk[s.k]; o[s.k]=s.items.some(i=>i.id===v)?v:'none'; }); return o; };
  window.StationSkins={HATS,ACCS,TOPS,PANTS,BACKS,SLOTS,bean,thumb,clean,randomSkin:()=>({hat:opt(HATS,.8),acc:opt(ACCS,.45),top:opt(TOPS,.6),pants:opt(PANTS,.5),back:opt(BACKS,.3)})};
})();
