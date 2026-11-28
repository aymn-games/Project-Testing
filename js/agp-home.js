/**
 * ألعاب أيمن — الصفحة الرئيسية (التصميم الجديد): خانة رقم الغرفة، صناع النجاح،
 * المنصة بالأرقام، شركاء الإبداع، إعلان الأدمن، وبطاقة متابعة تيك توك.
 * كل البيانات حقيقية من الخادم عبر auth/auth-client.js (window.AGPAuth)،
 * والدخول بالغرف عبر js/agp-join-room.js (window.AGPJoinRoom).
 * يعتمد على js/agp-site.js قبله.
 */
(function(){
  var root=document.documentElement,reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  function $(s){return document.querySelector(s)}
  function toast(t){if(window.AGPSite)window.AGPSite.toast(t)}
  function toLatin(s){return String(s).replace(/[٠-٩]/g,function(c){return String(c.charCodeAt(0)-1632)}).replace(/[۰-۹]/g,function(c){return String(c.charCodeAt(0)-1776)})}
  function esc(t){return String(t==null?'':t).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  /* ---------- room code ---------- */
  var cells=[].slice.call(document.querySelectorAll('.digits input')),form=$('#room'),msg=$('#room-msg'),go=$('#room-go');
  cells.forEach(function(inp,i){
    inp.addEventListener('input',function(){var v=toLatin(inp.value).replace(/\D/g,'');inp.value=v.slice(-1);if(v&&cells[i+1])cells[i+1].focus();if(cells.every(function(c){return c.value}))go.focus()});
    inp.addEventListener('keydown',function(e){if(e.key==='Backspace'&&!inp.value&&cells[i-1]){cells[i-1].focus();cells[i-1].value=''}});
    inp.addEventListener('paste',function(e){var t=toLatin((e.clipboardData||{}).getData?e.clipboardData.getData('text'):'').replace(/\D/g,'').slice(0,4);if(!t)return;e.preventDefault();t.split('').forEach(function(ch,j){if(cells[j])cells[j].value=ch});(cells[t.length]||go).focus()});
  });
  form.addEventListener('submit',function(e){
    e.preventDefault();var code=cells.map(function(c){return c.value}).join('');
    msg.className='room-msg';
    if(code.length<4){msg.classList.add('err');msg.textContent='اكتب الأرقام الأربعة كاملة';form.classList.remove('shake');void form.offsetWidth;form.classList.add('shake');(cells.find(function(c){return !c.value})||cells[0]).focus();return}
    go.classList.add('loading');go.setAttribute('aria-busy','true');msg.textContent='جاري البحث عن الغرفة';
    function done(){go.classList.remove('loading');go.removeAttribute('aria-busy')}
    function notFound(){msg.className='room-msg err';msg.textContent='الغرفة غير موجودة تأكد من الرقم';form.classList.remove('shake');void form.offsetWidth;form.classList.add('shake')}
    var J=window.AGPJoinRoom;if(!J){done();notFound();return}
    J.findRoom(code).then(function(r){done();
      if(r.go){msg.className='room-msg ok';msg.textContent='لقينا الغرفة وندخلك الحين';J.goTo(r.go,code);return}
      if(r.choose){msg.className='room-msg ok';msg.innerHTML='الرقم موجود بأكثر من لعبة اختر لعبتك <span class="room-pick">'+r.choose.map(function(g){return '<button type="button" class="btn btn-secondary btn-sm" data-room-game="'+esc(g)+'">'+esc(J.games[g].name)+'</button>'}).join('')+'</span>';return}
      notFound()}).catch(function(){done();notFound()});
  });

  msg.addEventListener('click',function(e){var b=e.target.closest('[data-room-game]');if(b&&window.AGPJoinRoom)window.AGPJoinRoom.goTo(b.dataset.roomGame,cells.map(function(c){return c.value}).join(''))});
  /* ---------- صناع النجاح: بيانات حقيقية من السيرفر (الأسبوع الحالي من السبت، والداعمين من بداية المنصة) ---------- */
  var ICON={sup:'<path d="M208,128v72a8,8,0,0,1-8,8H56a8,8,0,0,1-8-8V128Z" opacity="0.2"/><path d="M216,72H180.92c.39-.33.79-.65,1.17-1A29.53,29.53,0,0,0,192,49.57,32.62,32.62,0,0,0,158.44,16,29.53,29.53,0,0,0,137,25.91a54.94,54.94,0,0,0-9,14.48,54.94,54.94,0,0,0-9-14.48A29.53,29.53,0,0,0,97.56,16,32.62,32.62,0,0,0,64,49.57,29.53,29.53,0,0,0,73.91,71c.38.33.78.65,1.17,1H40A16,16,0,0,0,24,88v32a16,16,0,0,0,16,16v64a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V136a16,16,0,0,0,16-16V88A16,16,0,0,0,216,72ZM149,36.51a13.69,13.69,0,0,1,10-4.5h.49A16.62,16.62,0,0,1,176,49.08a13.69,13.69,0,0,1-4.5,10c-9.49,8.4-25.24,11.36-35,12.4C137.7,60.89,141,45.5,149,36.51Zm-64.09.36A16.63,16.63,0,0,1,96.59,32h.49a13.69,13.69,0,0,1,10,4.5c8.39,9.48,11.35,25.2,12.39,34.92-9.72-1-25.44-4-34.92-12.39a13.69,13.69,0,0,1-4.5-10A16.6,16.6,0,0,1,84.87,36.87ZM40,88h80v32H40Zm16,48h64v64H56Zm144,64H136V136h64Zm16-80H136V88h80v32Z"/>',pla:'<path d="M216.86,207.57a28,28,0,0,1-24.66-7.77L150.09,152H172a51.94,51.94,0,0,0,51.2-61h0l16.36,84.17A28,28,0,0,1,216.86,207.57Z" opacity="0.2"/><path d="M176,112H152a8,8,0,0,1,0-16h24a8,8,0,0,1,0,16ZM104,96H96V88a8,8,0,0,0-16,0v8H72a8,8,0,0,0,0,16h8v8a8,8,0,0,0,16,0v-8h8a8,8,0,0,0,0-16ZM241.48,200.65a36,36,0,0,1-54.94,4.81c-.12-.12-.24-.24-.35-.37L146.48,160h-37L69.81,205.09l-.35.37A36.08,36.08,0,0,1,44,216,36,36,0,0,1,8.56,173.75a.68.68,0,0,1,0-.14L24.93,89.52A59.88,59.88,0,0,1,83.89,40H172a60.08,60.08,0,0,1,59,49.25c0,.06,0,.12,0,.18l16.37,84.17a.68.68,0,0,1,0,.14A35.74,35.74,0,0,1,241.48,200.65ZM172,144a44,44,0,0,0,0-88H83.89A43.9,43.9,0,0,0,40.68,92.37l0,.13L24.3,176.59A20,20,0,0,0,58,194.3l41.92-47.59a8,8,0,0,1,6-2.71Zm59.7,32.59-8.74-45A60,60,0,0,1,172,160h-4.2L198,194.31a20.09,20.09,0,0,0,17.46,5.39,20,20,0,0,0,16.23-23.11Z"/>',str:'<path d="M160,128a32,32,0,1,1-32-32A32,32,0,0,1,160,128Z" opacity="0.2"/><path d="M128,88a40,40,0,1,0,40,40A40,40,0,0,0,128,88Zm0,64a24,24,0,1,1,24-24A24,24,0,0,1,128,152Zm73.71,7.14a80,80,0,0,1-14.08,22.2,8,8,0,0,1-11.92-10.67,63.95,63.95,0,0,0,0-85.33,8,8,0,1,1,11.92-10.67,80.08,80.08,0,0,1,14.08,84.47ZM69,103.09a64,64,0,0,0,11.26,67.58,8,8,0,0,1-11.92,10.67,79.93,79.93,0,0,1,0-106.67A8,8,0,1,1,80.29,85.34,63.77,63.77,0,0,0,69,103.09ZM248,128a119.58,119.58,0,0,1-34.29,84,8,8,0,1,1-11.42-11.2,103.9,103.9,0,0,0,0-145.56A8,8,0,1,1,213.71,44,119.58,119.58,0,0,1,248,128ZM53.71,200.78A8,8,0,1,1,42.29,212a119.87,119.87,0,0,1,0-168,8,8,0,1,1,11.42,11.2,103.9,103.9,0,0,0,0,145.56Z"/>'};
  var TIC={sup:'<svg viewBox="0 0 256 256" fill="currentColor"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm12,152h-4v8a8,8,0,0,1-16,0v-8H104a8,8,0,0,1,0-16h36a12,12,0,0,0,0-24H116a28,28,0,0,1,0-56h4V72a8,8,0,0,1,16,0v8h16a8,8,0,0,1,0,16H116a12,12,0,0,0,0,24h24a28,28,0,0,1,0,56Z"/></svg>',
    pla:'<svg viewBox="0 0 256 256" fill="currentColor"><path d="M232,64H208V48a8,8,0,0,0-8-8H56a8,8,0,0,0-8,8V64H24A16,16,0,0,0,8,80V96a40,40,0,0,0,40,40h3.65A80.13,80.13,0,0,0,120,191.61V216H96a8,8,0,0,0,0,16h64a8,8,0,0,0,0-16H136V191.58c31.94-3.23,58.44-25.64,68.08-55.58H208a40,40,0,0,0,40-40V80A16,16,0,0,0,232,64ZM48,120A24,24,0,0,1,24,96V80H48v32q0,4,.39,8ZM232,96a24,24,0,0,1-24,24h-.5a81.81,81.81,0,0,0,.5-8.9V80h24Z"/></svg>',
    str:'<svg viewBox="0 0 256 256" fill="currentColor"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm56,112H128a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v48h48a8,8,0,0,1,0,16Z"/></svg>'};
  var CAT={sup:{t:'الداعمين',money:true,unit:'',rows:[]},pla:{t:'اللاعبين',unit:'فوز',rows:[]},str:{t:'الاستريمرز',unit:'ساعة',rows:[]}};
  /* last week: filled from GET /api/public/last-week-ranking (saved by the server every Saturday) */
  var WEEK={str:[],pla:[]};
  var loaded={sup:false,pla:false,str:false,week:false};
  var WEEKU={str:'ساعة',pla:'فوز'},WEEKT={str:'الاستريمرز الأكثر ساعات',pla:'اللاعبين الأكثر فوز'};
  var AV={};
  var HUES=[['#6b48c4','#2b1d52'],['#3f6ec4','#1b2a52'],['#c4487e','#4f1d36'],['#2f9e86','#123f38'],['#c48a3f','#4f3417'],['#8a48c4','#361d52']];
  function hue(n){var h=0;for(var i=0;i<n.length;i++)h=(h*31+n.charCodeAt(i))>>>0;return HUES[h%HUES.length]}
  function initial(n){return AV[n]?'<img src="'+esc(AV[n])+'" alt="" loading="lazy">':esc(n.replace(/^(أبو|ال)\s*/,'').charAt(0))}
  var FEATHER='<svg viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="fgl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#efe2ff"/><stop offset="1" stop-color="#b48cff"/></linearGradient></defs><path d="M33 4C20 6 9 16 7 31l2 1c3-7 8-13 15-17-6 5-10 10-13 18l2 .8C17 23 26 13 33 4z" fill="url(#fgl)"/><path d="M33 4C22 12 14 22 9 33" stroke="#9b7fd6" stroke-width="1" fill="none"/></svg>';
  var SPARKS=[[200,0],[235,.7],[300,1.4],[330,2.1],[20,.35],[60,1.05],[110,1.75],[150,2.45]].map(function(sp){var r=sp[0]*Math.PI/180;
    return '<span class="fspk" style="left:'+(50+Math.cos(r)*57-2.5).toFixed(1)+'%;top:'+(50+Math.sin(r)*57-2.5).toFixed(1)+'%;animation-delay:'+sp[1]+'s"></span>'}).join('');
  function fav(name,rank,kind){var c=hue(name);
    if(kind==='spark')return '<span class="fav fr-spark"><span class="aura"></span><span class="av" style="--a1:'+c[0]+';--a2:'+c[1]+'">'+initial(name)+'</span>'+
      '<span class="fart"><img class="glow" src="assets/site/sparkring.webp" alt=""><img class="lag" src="assets/site/sparkring.webp" alt=""><img src="assets/site/sparkring.webp" alt=""></span>'+SPARKS+'<span class="trank"><b>'+rank+'</b></span></span>';
    if(kind==='gold')return '<span class="fav fr-gold"><span class="aura"></span><span class="av" style="--a1:'+c[0]+';--a2:'+c[1]+'">'+initial(name)+'</span><span class="fcomet"></span>'+
      '<span class="fart"><img class="glow" src="assets/site/goldring.webp" alt=""><img src="assets/site/goldring.webp" alt=""></span>'+SPARKS+'<span class="trank"><b>'+rank+'</b></span></span>';
    return '<span class="fav"><span class="aura"></span><span class="av" style="--a1:'+c[0]+';--a2:'+c[1]+'">'+initial(name)+'</span><span class="fcomet"></span>'+
      '<span class="fart"><img class="glow" src="assets/site/crystal.webp" alt=""><img src="assets/site/crystal.webp" alt=""><span class="fshine"></span></span>'+SPARKS+
      '<span class="fbfo b1"><span class="fbf">'+FEATHER+'</span></span><span class="fbfo b2"><span class="fbf">'+FEATHER+'</span></span>'+
      '<span class="trank"><b>'+rank+'</b></span></span>'}
  function metaLine(k,r,cls){
    if(CAT[k].money)return r[2]?'<span class="'+cls+' msg">'+esc(r[2])+'</span>':'';
    return '<span class="'+cls+' idl">'+(r[2]?'<span class="h">@'+esc(r[2])+'</span>':'')+(r[3]?'<span class="id">ID <span class="num">'+esc(r[3])+'</span></span>':'')+'</span>'}
  function num(k,n,cur){n=Number(n)||0;if(!CAT[k].money)return n.toLocaleString('en-US',{maximumFractionDigits:1});var v=n.toLocaleString('en-US',{maximumFractionDigits:2});return cur&&cur!=='USD'?v+' '+cur:'$'+v}
  function simpleFav(name,rank){var c=hue(name);
    return '<span class="fav fr-simple"><span class="aura"></span><span class="av" style="--a1:'+c[0]+';--a2:'+c[1]+'">'+initial(name)+'</span><span class="oring"><i></i></span><span class="trank"><b>'+rank+'</b></span></span>'}
  function throne(k,rows,unit){
    var order=rows.length>3?[3,1,0,2,4]:[1,0,2];
    return '<div class="throne'+(rows.length>3?' five':'')+'">'+order.map(function(i){var r=rows[i];if(!r)return '';
      return '<div class="tcol rk'+(i+1)+'">'+(i>2&&k!=='sup'?simpleFav(r[0],i+1):fav(r[0],i+1,k==='pla'?'spark':k==='str'?'gold':'crystal'))+'<span class="tname">'+esc(r[0])+'</span>'+metaLine(k,r,'tmeta')+'<span class="tcount"><span class="tic">'+TIC[k]+'</span><span class="tnum">'+num(k,r[1],r[3])+'</span>'+((unit||CAT[k].unit)?'<span class="tunit">'+(unit||CAT[k].unit)+'</span>':'')+'</span></div>'}).join('')+'</div>'}
  function title(k,extra,label){return '<h3 class="grp-t"><span class="ti"><svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">'+ICON[k]+'</svg></span>'+(label||CAT[k].t)+(extra?' <small>'+extra+'</small>':'')+'</h3>'}
  /* weekly reset: every Saturday 00:00 Riyadh time (UTC+3, no daylight saving) */
  var WEEK_MS=7*864e5,KSA=3*36e5;
  function nextReset(now){var t=now+KSA,d=new Date(t),day=d.getUTCDay(),mid=t-(t%864e5),add=(6-day+7)%7;if(add===0)add=7;return mid+add*864e5-KSA}
  function fmtDay(ms){try{return new Date(ms).toLocaleDateString('ar-SA-u-nu-latn-ca-gregory',{weekday:'long',day:'numeric',month:'long',timeZone:'Asia/Riyadh'}).replace(/،/g,'')}catch(e){return new Date(ms).toDateString()}}
  function thisWeekLabel(){var nr=nextReset(Date.now());return 'من '+fmtDay(nr-WEEK_MS)+' لين الآن'}
  function lastWeekLabel(){var nr=nextReset(Date.now()),start=nr-2*WEEK_MS,end=nr-WEEK_MS-1;return 'من '+fmtDay(start)+' إلى '+fmtDay(end)}
  var rsEls={d:$('#rs-d'),h:$('#rs-h'),m:$('#rs-m'),s:$('#rs-s'),bar:$('#rs-bar'),pct:$('#rs-pct')};
  function pad(n){return (n<10?'0':'')+n}
  function tickReset(){var now=Date.now(),nr=nextReset(now),left=Math.max(0,nr-now),done=1-left/WEEK_MS;
    var sec=Math.floor(left/1000),d=Math.floor(sec/86400),h=Math.floor(sec%86400/3600),m=Math.floor(sec%3600/60),ss=sec%60;
    rsEls.d.textContent=d;rsEls.h.textContent=pad(h);rsEls.m.textContent=pad(m);rsEls.s.textContent=pad(ss);
    rsEls.bar.style.strokeDashoffset=(138.2*(1-done)).toFixed(1);rsEls.pct.textContent=Math.round(done*100)+'%';
    if(left<1000&&document.querySelector('.tab[aria-selected="true"]').dataset.k==='week')render('week')}
  tickReset();setInterval(function(){if(!document.hidden)tickReset()},1000);
  function render(k){
    var b=$('#board'),meta=$('#lb-meta');
    if(k==='week'){
      meta.innerHTML='<span class="pill"><i></i>الأسبوع الماضي</span><span>'+lastWeekLabel()+'</span>';
      b.innerHTML='<p class="lw-note">هنا يظهر توب الأسبوع الماضي كامل من السبت إلى الجمعة وتتجدد القائمة كل سبت الساعة 12 منتصف الليل</p><div class="weeks">'+['str','pla'].map(function(c){return '<div class="grp">'+title(c,0,WEEKT[c])+
        (WEEK[c].length?throne(c,WEEK[c],WEEKU[c]):'<div class="lw-empty"><svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M224,128a96,96,0,1,1-96-96A96,96,0,0,1,224,128Z" opacity="0.2"/><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm64-88a8,8,0,0,1-8,8H128a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v48h48A8,8,0,0,1,192,128Z"/></svg><b>'+(loaded.week?'ما فيه نتائج للأسبوع الماضي':'نجيب القائمة')+'</b><span>'+(loaded.week?'القائمة تظهر هنا بعد أول أسبوع كامل':'لحظات')+'</span></div>')+'</div>'}).join('')+'</div>';
    } else {
      var rows=CAT[k].rows;
      var pill=k==='sup'?'الأحدث':'هذا الأسبوع';
      if(!rows.length){meta.innerHTML='<span class="pill"><i></i>'+pill+'</span><span>'+CAT[k].t+'</span>';b.innerHTML='<div class="lw-empty" style="margin:0 auto"><b>'+(loaded[k]?'ما فيه أحد بالقائمة للحين':'نجيب القائمة')+'</b><span>'+(loaded[k]?'القائمة تتعبى أول ما يبدأ النشاط هالأسبوع':'لحظات')+'</span></div>';b.classList.remove('panel-fade');void b.offsetWidth;b.classList.add('panel-fade');return}
      meta.innerHTML='<span class="pill"><i></i>'+pill+'</span><span>'+(k==='sup'?'آخر <span class="num">5</span> داعمين، كل دعم جديد يصير الأول':'توب <span class="num">5</span> '+CAT[k].t)+'</span>';
      b.innerHTML='<div class="big">'+throne(k,rows)+(k==='sup'?'<a class="btn btn-primary btn-lg support-btn" href="https://creators.sa/aymngame" target="_blank" rel="noopener"><svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M232,102c0,66-104,122-104,122S24,168,24,102A54,54,0,0,1,78,48c22.59,0,41.94,12.31,50,32,8.06-19.69,27.41-32,50-32A54,54,0,0,1,232,102Z" opacity="0.2"/><path d="M178,40c-20.65,0-38.73,8.88-50,23.89C116.73,48.88,98.65,40,78,40a62.07,62.07,0,0,0-62,62c0,70,103.79,126.66,108.21,129a8,8,0,0,0,7.58,0C136.21,228.66,240,172,240,102A62.07,62.07,0,0,0,178,40ZM128,214.8C109.74,204.16,32,155.69,32,102A46.06,46.06,0,0,1,78,56c19.45,0,35.78,10.36,42.6,27a8,8,0,0,0,14.8,0c6.82-16.67,23.15-27,42.6-27a46.06,46.06,0,0,1,46,46C224,155.61,146.24,204.15,128,214.8Z"/></svg>دعم المنصة</a>':'')+'</div>';
    }
    b.classList.remove('panel-fade');void b.offsetWidth;b.classList.add('panel-fade');
  }
  /* load the lists from the server and redraw the open tab */
  function nm(x){return String((x&&(x.displayName||x.name||x.username||x.tiktokUsername))||'').trim()}
  function avatar(x){var n=nm(x);if(n&&x.avatarBase64&&/^data:image\//.test(x.avatarBase64))AV[n]=x.avatarBase64}
  function redraw(k){loaded[k]=true;var t=document.querySelector('.tab[aria-selected="true"]');if(t&&t.dataset.k===k)render(k)}
  var A=window.AGPAuth;
  if(A){
    /* الداعمين: آخر 5 (الأحدث أولاً، مو حسب المبلغ) — تلقائي من Streamlabs المنصة (backend/supporters/platform-streamlabs.js) */
    if(A.getRecentSupporters)A.getRecentSupporters(5).then(function(r){
      CAT.sup.rows=((r&&r.supporters)||[]).slice(0,5).map(function(s){avatar(s);return [nm(s),s.amount,s.message||'',s.currency||'USD']});redraw('sup')}).catch(function(){redraw('sup')});
    else loaded.sup=true;
    if(A.getTopStreamers)A.getTopStreamers(5).then(function(r){CAT.str.rows=((r&&r.streamers)||[]).slice(0,5).map(function(x){avatar(x);return [nm(x),x.totalHours,x.tiktokUsername,x.customId]});redraw('str')}).catch(function(){redraw('str')});
    if(A.getTopPlayersByWins)A.getTopPlayersByWins(5).then(function(r){CAT.pla.rows=((r&&r.players)||[]).slice(0,5).map(function(x){avatar(x);return [nm(x),x.gamesWon,x.username,x.customId]});redraw('pla')}).catch(function(){redraw('pla')});
    if(A.getLastWeekRanking)A.getLastWeekRanking().then(function(d){if(!d||!d.success)return redraw('week');
      WEEK.str=(d.streamers||[]).slice(0,3).map(function(x){avatar(x);return [nm(x),x.totalHours,x.tiktokUsername,x.customId]});
      WEEK.pla=(d.players||[]).slice(0,3).map(function(x){avatar(x);return [nm(x),x.gamesWon,x.username,x.customId]});redraw('week')}).catch(function(){redraw('week')});
  } else ['sup','pla','str','week'].forEach(function(k){loaded[k]=true});
  var tabs=[].slice.call(document.querySelectorAll('.tab'));
  function select(t){tabs.forEach(function(x){var on=x===t;x.setAttribute('aria-selected',String(on));x.tabIndex=on?0:-1});$('#board').setAttribute('aria-labelledby',t.id);render(t.dataset.k)}
  tabs.forEach(function(t,i){t.addEventListener('click',function(){select(t)});t.addEventListener('keydown',function(e){
    var n=e.key==='ArrowLeft'?1:e.key==='ArrowRight'?-1:0;if(!n)return;e.preventDefault();var nt=tabs[(i+n+tabs.length)%tabs.length];nt.focus();select(nt)})});
  render('week');

  /* ---------- المنصة بالأرقام: الحسابات والاستريمرز والجولات من الخادم، وعدد الألعاب من games.html
     (نفس طريقة الرئيسية القديمة)، والبث والمشاهدات تقدير يكبر كل شهر وما يتعدى نص الاستريمرز ---------- */
  var segs=[].slice.call(document.querySelectorAll('#stats .seg'));
  function setStat(i,v){var s=segs[i];if(!s||v==null||isNaN(v))return;var b=s.querySelector('.big');b.dataset.to=v;
    if(s.classList.contains('go'))b.textContent=(+b.dataset.dec?Number(v).toFixed(+b.dataset.dec):Math.round(v).toLocaleString('en-US'))}
  function estimates(streamers){var d=new Date(),m=Math.max(0,(d.getFullYear()-2026)*12+d.getMonth()-10);
    var live=Math.min(Math.round(240*Math.pow(1.05,m)),Math.floor((streamers||550)*.48)),views=Math.round(100000*Math.pow(1.09,m)/100)*100;
    setStat(3,live);setStat(5,views);[].forEach.call(document.querySelectorAll('[data-grow-text="live"]'),function(el){el.textContent=live.toLocaleString('en')})}
  var A=window.AGPAuth;
  if(A&&A.getPlatformStats)A.getPlatformStats().then(function(r){var s=r&&r.success&&r.stats;if(!s)return;
    setStat(0,s.totalAccounts);setStat(2,s.activeStreamersThisMonth);setStat(4,s.totalRoundsPlayed);estimates(s.activeStreamersThisMonth)}).catch(function(){});
  function gamesCount(){fetch('js/agp-games-library.js',{cache:'no-store'}).then(function(r){return r.text()}).then(function(h){var m=/var REAL_GAMES\s*=\s*(\[[\s\S]*?\]);/.exec(h);if(m)setStat(1,JSON.parse(m[1]).length)}).catch(function(){})}
  if(document.readyState==='complete')setTimeout(gamesCount,1500);else addEventListener('load',function(){setTimeout(gamesCount,1500)});

  /* ---------- شركاء الإبداع: من الخادم (GET /api/partners) ---------- */
  var PHUES=[['#6b48c4','#2b1d52'],['#3f6ec4','#1b2a52'],['#c4487e','#4f1d36'],['#2f9e86','#123f38'],['#c48a3f','#4f3417'],['#8a48c4','#361d52']];
  function ar(n){return String(n).replace(/[0-9]/g,function(d){return '٠١٢٣٤٥٦٧٨٩'[d]})}
  function pcard(p,i,dup){var n=String(p.name||'').trim(),c=PHUES[i%PHUES.length];
    var av=p.avatarBase64&&/^data:image\//.test(p.avatarBase64)?'<img src="'+esc(p.avatarBase64)+'" alt="" loading="lazy">':esc(n.charAt(0));
    return '<li class="pc"'+(dup?' aria-hidden="true"':'')+'><span class="pav" style="--a1:'+c[0]+';--a2:'+c[1]+'">'+av+'</span><span class="pinfo"><b>'+esc(n)+'</b>'+
      (p.customId?'<span class="pid">ID <span class="num">'+esc(p.customId)+'</span></span>':'')+'</span></li>'}
  function pblock(list,sp){var items=list.map(function(p,i){return pcard(p,i)}).join('');
    if(list.length<5)return '<ul class="pc-row">'+items+'</ul>';
    return '<div class="marquee in"><ul class="mq-track" style="--sp:'+sp+'s">'+items+list.map(function(p,i){return pcard(p,i,1)}).join('')+'</ul></div>'}
  function fillGroup(sel,list,word,sp){var g=$(sel);if(!g)return;var cnt=g.querySelector('.pg-count');if(cnt)cnt.textContent=ar(list.length)+' '+word;
    var old=g.querySelector('.marquee,.pc-row');if(!old)return;var t=document.createElement('div');t.innerHTML=pblock(list,sp);old.replaceWith(t.firstChild)}
  if(A&&A.getPartners)A.getPartners().then(function(r){var p=r&&r.success&&r.partners;if(!p)return;
    if(p.idea&&p.idea.length)fillGroup('.pg-idea',p.idea,'مبدعين',38);if(p.dev&&p.dev.length)fillGroup('.pg-dev',p.dev,'مطورين',40)}).catch(function(){});

  /* ---------- إعلان الأدمن (لوحة الأدمن ← الإعلان) فوق خانة رقم الغرفة ---------- */
  if(A&&A.getAnnouncement)A.getAnnouncement().then(function(r){var a=r&&r.success&&r.announcement;if(!a||!a.text)return;
    var room=$('#room');if(!room||document.getElementById('agp-announcement-notice'))return;
    var box=document.createElement('div');box.id='agp-announcement-notice';box.className='ann';
    var row=document.createElement('div');row.className='ann-row';var dot=document.createElement('i');dot.setAttribute('aria-hidden','true');
    var t=document.createElement('span');t.textContent=a.text;row.appendChild(dot);row.appendChild(t);box.appendChild(row);
    if(a.imageFilename){var img=document.createElement('img');img.src=a.imageFilename;img.alt='إعلان';img.loading='lazy';box.appendChild(img)}
    room.parentNode.insertBefore(box,room)}).catch(function(){});

  /* ---------- بطاقة متابعة حساب المنصة على تيك توك تحت «انضم إلى المجتمع» ---------- */
  var join=$('.join');if(join&&window.AGPTikTokFollow){var card=window.AGPTikTokFollow.insertAfter(join);if(card)card.style.marginTop='24px'}
})();
