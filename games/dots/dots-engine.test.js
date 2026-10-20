// Run: node dots-engine.test.js
const E=require('./dots-engine.js');
let pass=0, fail=0; const t=(name,fn)=>{ try{ fn(); pass++; }catch(e){ fail++; console.log('✗',name,'—',e.message); } };
const eq=(a,b,m)=>{ if(JSON.stringify(a)!==JSON.stringify(b)) throw new Error((m||'')+' expected '+JSON.stringify(b)+' got '+JSON.stringify(a)); };

t('parse basic', ()=>{ eq(E.parseCommand('2-3'),{a:2,b:3}); eq(E.parseCommand('  2 - 3 '),{a:2,b:3}); eq(E.parseCommand('٢-٣'),{a:2,b:3}); eq(E.parseCommand('2—3'),{a:2,b:3}); });
t('parse rejects chatter', ()=>{ eq(E.parseCommand('هلا 2-3'),null); eq(E.parseCommand('2-3-4'),null); eq(E.parseCommand('abc'),null); eq(E.parseCommand('23'),null); });
t('numbering L→R, T→B', ()=>{ const g=E.createGame(3,3); eq(E.dotRC(g,1),{r:0,c:0}); eq(E.dotRC(g,4),{r:0,c:3}); eq(E.dotRC(g,5),{r:1,c:0}); eq(E.dotCount(g),16); });
t('adjacency', ()=>{ const g=E.createGame(3,3);
  eq(E.edgeFor(g,1,2).ok,true); eq(E.edgeFor(g,2,1).edge,{kind:'h',i:0}); eq(E.edgeFor(g,1,5).edge,{kind:'v',i:0});
  eq(E.edgeFor(g,4,5).reason,'not_adjacent'); eq(E.edgeFor(g,1,6).reason,'not_adjacent'); eq(E.edgeFor(g,1,3).reason,'not_adjacent');
  eq(E.edgeFor(g,0,1).reason,'no_dot'); eq(E.edgeFor(g,16,17).reason,'no_dot'); eq(E.edgeFor(g,3,3).reason,'same_dot'); });
t('taken line rejected', ()=>{ let g=E.createGame(2,2); g=E.applyMove(g,1,2,'blue').game; const r=E.applyMove(g,2,1,'pink'); eq(r.ok,false); eq(r.reason,'taken'); });
t('turn alternates and enforces', ()=>{ let g=E.createGame(2,2); let r=E.applyMove(g,1,2,'blue'); eq(r.game.turn,'pink'); eq(E.applyMove(r.game,2,3,'blue').reason,'not_turn'); });
t('complete box scores + extra turn', ()=>{ let g=E.createGame(2,2);
  g=E.applyMove(g,1,2,'blue').game; g=E.applyMove(g,1,4,'pink').game; g=E.applyMove(g,4,5,'blue').game;
  const r=E.applyMove(g,2,5,'pink'); eq(r.completed,[0]); eq(r.game.scores,{blue:0,pink:1}); eq(r.game.turn,'pink'); eq(r.extraTurn,true); eq(r.game.boxes[0],'pink'); });
t('one line completes two boxes', ()=>{ let g=E.createGame(1,2,{mode:'free'});
  for(const [a,b] of [[1,2],[2,3],[4,5],[5,6],[1,4],[3,6]]) g=E.applyMove(g,a,b,'blue').game;
  const r=E.applyMove(g,2,5,'pink'); eq(r.completed.length,2); eq(r.game.scores.pink,2); eq(r.game.over,true); eq(r.game.winner,'pink'); });
t('immutability', ()=>{ const g=E.createGame(2,2); E.applyMove(g,1,2,'blue'); eq(g.h[0],null); eq(g.moves.length,0); });
t('free mode ignores turn', ()=>{ let g=E.createGame(2,2,{mode:'free'}); g=E.applyMove(g,1,2,'blue').game; eq(E.applyMove(g,2,3,'blue').ok,true); });
t('full game ends with winner', ()=>{ let g=E.createGame(2,2,{mode:'free'}); const N=E.dotCount(g);
  for(let a=1;a<=N;a++) for(const b of [a+1,a+3]) { const r=E.applyMove(g,a,b,'blue'); if(r.ok) g=r.game; }
  eq(g.over,true); eq(g.scores.blue,4); eq(g.winner,'blue'); eq(E.remaining(g),0); eq(E.progress(g),1); });
t('router dedupe by id', ()=>{ const R=E.createRouter({cooldownMs:0}); eq(R.route({id:'x',user:'a',text:'1-2'}).status,'cmd'); eq(R.route({id:'x',user:'a',text:'1-2'}).status,'dup'); });
t('router dedupe fallback', ()=>{ const R=E.createRouter({cooldownMs:0,dedupeMs:1000}); eq(R.route({user:'a',text:'1-2',ts:0}).status,'cmd'); eq(R.route({user:'a',text:'1-2',ts:500}).status,'dup'); eq(R.route({user:'a',text:'1-2',ts:2000}).status,'cmd'); });
t('router cooldown', ()=>{ const R=E.createRouter({cooldownMs:1000}); eq(R.route({id:1,user:'a',text:'1-2',ts:0}).status,'cmd'); eq(R.route({id:2,user:'a',text:'2-3',ts:300}).status,'rate'); eq(R.route({id:3,user:'b',text:'2-3',ts:300}).status,'cmd'); });
t('router auto balance', ()=>{ const R=E.createRouter({cooldownMs:0}); const ts=['a','b','c','d'].map((u,i)=>R.route({id:i,user:u,text:'1-2'}).team); eq(ts,['blue','pink','blue','pink']); eq(R.route({id:9,user:'a',text:'3-4'}).team,'blue'); });
t('router choose policy', ()=>{ const R=E.createRouter({policy:'choose',cooldownMs:0}); eq(R.route({id:1,user:'a',text:'1-2'}).status,'no_team'); eq(R.route({id:2,user:'a',text:'وردي'}).status,'join'); eq(R.route({id:3,user:'a',text:'1-2'}).team,'pink'); eq(R.route({id:4,user:'a',text:'ازرق'}).status,'chat'); });
t('router ignores chatter', ()=>{ const R=E.createRouter(); eq(R.route({id:1,user:'a',text:'هلا والله'}).status,'chat'); });
t('concurrent same edge: only first wins', ()=>{ let g=E.createGame(2,2,{mode:'free'}); const out=[];
  const Q=E.createQueue(m=>{ const r=E.applyMove(g,m.a,m.b,m.team,m.u); if(r.ok) g=r.game; out.push(r.ok?'ok':r.reason); });
  Q.push({a:1,b:2,team:'blue',u:'x'}); Q.push({a:2,b:1,team:'pink',u:'y'}); Q.push({a:1,b:2,team:'pink',u:'z'});
  eq(out,['ok','taken','taken']); eq(g.h[0],'blue'); eq(g.moves.length,1); });
t('endByTime picks leader', ()=>{ const g={...E.createGame(2,2),scores:{blue:1,pink:2}}; eq(E.endByTime(g).winner,'pink'); });

console.log(`\n${pass} passed, ${fail} failed`); if(typeof process!=='undefined'&&fail) process.exitCode=1;
