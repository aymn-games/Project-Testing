// Dots & Boxes — pure rules engine + chat command router. No DOM. Works in browser (window.DotsEngine) and Node (module.exports).
(function(root){
  const AR='٠١٢٣٤٥٦٧٨٩', FA='۰۱۲۳۴۵۶۷۸۹';
  const normDigits=s=>String(s).replace(/[٠-٩]/g,d=>AR.indexOf(d)).replace(/[۰-۹]/g,d=>FA.indexOf(d));

  // Dots numbered 1..(rows+1)*(cols+1), left→right, top→bottom.
  function createGame(rows,cols,opts={}){
    rows=Math.max(1,Math.min(12,rows|0)); cols=Math.max(1,Math.min(12,cols|0));
    return { rows, cols, h:Array((rows+1)*cols).fill(null), v:Array(rows*(cols+1)).fill(null),
      boxes:Array(rows*cols).fill(null), scores:{blue:0,pink:0}, turn:opts.first||'blue',
      mode:opts.mode||'turns', moves:[], over:false, winner:null };
  }
  const dotRC=(g,n)=>({r:Math.floor((n-1)/(g.cols+1)), c:(n-1)%(g.cols+1)});
  const dotCount=g=>(g.rows+1)*(g.cols+1);

  function parseCommand(text){
    const m=normDigits(text).trim().match(/^(\d{1,3})\s*[-–—_]\s*(\d{1,3})$/);
    return m?{a:+m[1],b:+m[2]}:null;
  }

  // → {ok:true, edge:{kind:'h'|'v', i}} | {ok:false, reason}
  function edgeFor(g,a,b){
    const N=dotCount(g);
    if(!(a>=1&&a<=N&&b>=1&&b<=N)) return {ok:false,reason:'no_dot'};
    if(a===b) return {ok:false,reason:'same_dot'};
    if(a>b) [a,b]=[b,a];
    const A=dotRC(g,a), B=dotRC(g,b);
    if(A.r===B.r&&B.c-A.c===1) return {ok:true,edge:{kind:'h',i:A.r*g.cols+A.c},a,b};
    if(A.c===B.c&&B.r-A.r===1) return {ok:true,edge:{kind:'v',i:A.r*(g.cols+1)+A.c},a,b};
    return {ok:false,reason:'not_adjacent'};
  }

  function boxDone(g,h,v,r,c){ return h[r*g.cols+c]&&h[(r+1)*g.cols+c]&&v[r*(g.cols+1)+c]&&v[r*(g.cols+1)+c+1]; }

  // Pure: returns {ok, reason?, game, completed:[boxIdx], extraTurn}
  function applyMove(g,a,b,team,player){
    if(g.over) return {ok:false,reason:'over',game:g};
    if(team!=='blue'&&team!=='pink') return {ok:false,reason:'no_team',game:g};
    const e=edgeFor(g,a,b); if(!e.ok) return {...e,game:g};
    if(g.mode==='turns'&&team!==g.turn) return {ok:false,reason:'not_turn',game:g};
    const arr=e.edge.kind==='h'?g.h:g.v;
    if(arr[e.edge.i]) return {ok:false,reason:'taken',game:g};
    const h=g.h.slice(), v=g.v.slice(), boxes=g.boxes.slice(), scores={...g.scores};
    (e.edge.kind==='h'?h:v)[e.edge.i]=team;
    const cand=[];
    if(e.edge.kind==='h'){ const r=Math.floor(e.edge.i/g.cols), c=e.edge.i%g.cols; if(r>0) cand.push([r-1,c]); if(r<g.rows) cand.push([r,c]); }
    else { const r=Math.floor(e.edge.i/(g.cols+1)), c=e.edge.i%(g.cols+1); if(c>0) cand.push([r,c-1]); if(c<g.cols) cand.push([r,c]); }
    const completed=[];
    for(const [r,c] of cand){ const k=r*g.cols+c; if(!boxes[k]&&boxDone(g,h,v,r,c)){ boxes[k]=team; scores[team]++; completed.push(k); } }
    const extraTurn=completed.length>0;
    const turn=g.mode==='turns'?(extraTurn?team:(team==='blue'?'pink':'blue')):g.turn;
    const over=boxes.every(Boolean);
    const winner=over?(scores.blue>scores.pink?'blue':scores.pink>scores.blue?'pink':'draw'):null;
    const move={a:e.a,b:e.b,kind:e.edge.kind,i:e.edge.i,team,player:player||null,completed,n:g.moves.length+1};
    return {ok:true,completed,extraTurn,move,game:{...g,h,v,boxes,scores,turn,over,winner,moves:[...g.moves,move]}};
  }

  function endByTime(g){ if(g.over) return g; const s=g.scores; return {...g,over:true,winner:s.blue>s.pink?'blue':s.pink>s.blue?'pink':'draw'}; }
  const remaining=g=>g.boxes.filter(x=>!x).length;
  const progress=g=>{ const t=g.h.length+g.v.length; return t?(g.moves.length/t):0; };

  // Chat → command. Dedupe by event id, fallback user+text within a window. Per-user cooldown. Team assignment.
  function createRouter(o={}){
    const R={ policy:o.policy||'auto', cooldownMs:o.cooldownMs??1500, dedupeMs:o.dedupeMs??4000,
      seenIds:new Map(), seenKeys:new Map(), lastByUser:new Map(), teams:new Map() };
    let JOIN={blue:/^(ازرق|أزرق|الازرق|الأزرق|blue)$/i, pink:/^(وردي|الوردي|pink)$/i};
    const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    R.setJoinWords=w=>{ JOIN={blue:new RegExp('^('+w.blue.map(esc).join('|')+')$','i'), pink:new RegExp('^('+w.pink.map(esc).join('|')+')$','i')}; };
    const prune=(m,now,ttl)=>{ if(m.size>2000) for(const [k,t] of m) if(now-t>ttl) m.delete(k); };
    R.teamOf=u=>R.teams.get(u)||null;
    R.counts=()=>{ let b=0,p=0; for(const t of R.teams.values()) t==='blue'?b++:p++; return {blue:b,pink:p}; };
    R.assign=(u,t)=>{ R.teams.set(u,t); return t; };
    R.reset=()=>{ R.seenIds.clear(); R.seenKeys.clear(); R.lastByUser.clear(); };
    // ev: {id?, user, text, ts?} → {status:'dup'|'rate'|'chat'|'join'|'no_team'|'cmd', team?, cmd?}
    R.route=ev=>{
      const now=ev.ts??Date.now(), user=String(ev.user||'').trim(), text=String(ev.text||'').trim();
      if(!user||!text) return {status:'chat'};
      if(ev.id!=null&&ev.id!==''){ if(R.seenIds.has(ev.id)) return {status:'dup'}; R.seenIds.set(ev.id,now); prune(R.seenIds,now,60000); }
      else { const k=user+'|'+text, t=R.seenKeys.get(k); if(t!=null&&now-t<R.dedupeMs) return {status:'dup'}; R.seenKeys.set(k,now); prune(R.seenKeys,now,R.dedupeMs); }
      const n=normDigits(text).trim();
      for(const t of ['blue','pink']) if(JOIN[t].test(n)){ if(R.policy==='choose'&&!R.teams.has(user)){ R.assign(user,t); return {status:'join',team:t}; } return {status:'chat'}; }
      const cmd=parseCommand(text); if(!cmd) return {status:'chat'};
      const last=R.lastByUser.get(user); if(last!=null&&now-last<R.cooldownMs) return {status:'rate'};
      R.lastByUser.set(user,now);
      let team=R.teams.get(user);
      if(!team){ if(R.policy==='choose') return {status:'no_team',cmd}; const c=R.counts(); team=R.assign(user,c.blue<=c.pink?'blue':'pink'); }
      return {status:'cmd',team,cmd};
    };
    return R;
  }

  // Serial queue: commands applied one at a time, so concurrent comments can never race on the same edge.
  function createQueue(handler){ const q=[]; let busy=false;
    const pump=()=>{ if(busy) return; busy=true; try{ while(q.length) handler(q.shift()); } finally{ busy=false; } };
    return { push:x=>{ q.push(x); pump(); }, size:()=>q.length }; }

  const REASONS={no_dot:'رقم نقطة غير موجود',same_dot:'نفس النقطة',not_adjacent:'النقطتان غير متجاورتين',taken:'الخط مرسوم من قبل',not_turn:'مو دور فريقك',over:'الجولة انتهت',no_team:'اختر فريقك أول (أزرق / وردي)',paused:'اللعبة متوقفة مؤقتاً',closed:'استقبال الأوامر مقفل',rate:'انتظر شوي قبل الأمر الجاي',dup:'أمر مكرر'};

  const api={normDigits,createGame,parseCommand,edgeFor,applyMove,endByTime,remaining,progress,dotRC,dotCount,createRouter,createQueue,REASONS};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else root.DotsEngine=api;
})(typeof window!=='undefined'?window:globalThis);
