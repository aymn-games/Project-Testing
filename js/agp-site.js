/**
 * ألعاب أيمن — سكربت الواجهة المشترك للتصميم الجديد (الهيدر، القائمة، السطوع،
 * جودة الرسوميات، حركة المؤشر، الظهور عند النزول، نافذة الدخول الحقيقية،
 * النوافذ التعريفية، الأسئلة الشائعة، ضوء الافتتاح).
 *
 * الدخول وإنشاء الحساب عبر auth/auth-client.js (window.AGPAuth) — نفس الخادم
 * والتوكن ومعرّف الجهاز لكل صفحات الموقع. الدخول بقوقل واسترجاع كلمة المرور
 * يكملون بصفحة login.html.
 *
 * يكشف للصفحات window.AGPSite = { toast, openAuth, user() } فقط.
 */
(function(){
  var root=document.documentElement;
  function $(s){return document.querySelector(s)}
  function store(k,v){try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(e){return null}}
  function toast(t){var el=$('#toast');el.textContent=t;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(function(){el.classList.remove('show')},2200)}

  function toLatin(s){return String(s).replace(/[٠-٩]/g,function(c){return String(c.charCodeAt(0)-1632)}).replace(/[۰-۹]/g,function(c){return String(c.charCodeAt(0)-1776)})}
  function esc(t){return String(t==null?'':t).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  /* ---------- adaptive graphics quality ---------- */
  var NAMES={eco:'اقتصادي',balanced:'متوازن',ultra:'عالي'};
  var Q={pref:store('agp-gfx')||'auto',level:'balanced',reason:'',downgraded:false};
  function detect(){
    var why=[];
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){why.push('تقليل الحركة مفعّل');return['eco',why]}
    var c=navigator.connection;if(c&&c.saveData){why.push('توفير البيانات مفعّل');return['eco',why]}
    var cores=navigator.hardwareConcurrency,mem=navigator.deviceMemory;
    if((mem&&mem<=2)||(cores&&cores<=2)){why.push('جهاز بموارد محدودة');return['eco',why]}
    if(c&&/(^|-)2g$/.test(c.effectiveType||'')){why.push('اتصال بطيء');return['eco',why]}
    if(mem>=8&&cores>=8&&innerWidth>=1200){why.push('جهاز قوي وشاشة كبيرة');return['ultra',why]}
    why.push(cores||mem?'جهاز متوسط':'ما توفرت معلومات عن الجهاز');return['balanced',why];
  }
  function apply(){
    var lvl=Q.pref==='auto'?Q.level:Q.pref;
    root.setAttribute('data-gfx',lvl);
    $('#gfx-badge').textContent=Q.pref==='auto'?'تلقائي':NAMES[lvl];
    $('#auto-note').textContent='الحالي '+NAMES[Q.level];
    $('#gfx-why').textContent=Q.pref==='auto'?('السبب '+Q.reason):'اخترته يدويًا والتلقائي ما يغيّره';
    document.querySelectorAll('.dd-item').forEach(function(b){b.setAttribute('aria-checked',String(b.dataset.mode===Q.pref))});
  }
  var d=detect();Q.level=d[0];Q.reason=d[1].join(' و ');apply();
  /* one short sample after load; only ever steps down, once, and never overrides a manual choice */
  function sample(){
    if(Q.pref!=='auto'||Q.level==='eco'||document.hidden)return;
    var n=0,t0=performance.now(),slow=0,last=t0;
    function f(t){n++;if(t-last>50)slow++;last=t;
      if(t-t0<1500){requestAnimationFrame(f);return}
      if(document.hidden)return;
      var fps=n*1000/(t-t0);
      if(fps<40&&slow>8&&!Q.downgraded){Q.downgraded=true;Q.level=Q.level==='ultra'?'balanced':'eco';Q.reason='لاحظنا بطء بالعرض فخففنا الرسوميات';apply();toast('خففنا الرسوميات عشان تكون أسلس')}}
    requestAnimationFrame(f);
  }
  setTimeout(sample,2600);

  var dd=$('#gfx-dd'),gb=$('#gfx-btn');
  function openDD(o){dd.classList.toggle('open',o);gb.setAttribute('aria-expanded',String(o));if(o)dd.querySelector('[aria-checked="true"]').focus()}
  gb.addEventListener('click',function(e){e.stopPropagation();openDD(!dd.classList.contains('open'))});
  document.querySelectorAll('.dd-item').forEach(function(b){b.addEventListener('click',function(){
    Q.pref=b.dataset.mode;store('agp-gfx',Q.pref);apply();openDD(false);gb.focus();
    toast('جودة الرسوميات '+(Q.pref==='auto'?'تلقائي':NAMES[Q.pref]))})});
  $('#gfx-menu').addEventListener('keydown',function(e){
    var items=[].slice.call(this.querySelectorAll('.dd-item')),i=items.indexOf(document.activeElement);
    if(e.key==='ArrowDown'){e.preventDefault();items[(i+1)%items.length].focus()}
    if(e.key==='ArrowUp'){e.preventDefault();items[(i-1+items.length)%items.length].focus()}
  });
  document.addEventListener('click',function(e){if(!dd.contains(e.target))openDD(false)});

  /* ---------- brightness toggle ---------- */
  var tb=$('#tone-btn');
  function setTone(t,say){if(t==='bright')root.setAttribute('data-tone','bright');else root.removeAttribute('data-tone');
    tb.setAttribute('aria-pressed',String(t==='bright'));tb.setAttribute('aria-label',t==='bright'?'الوضع المعتم':'السطوع');store('agp-tone',t);if(say)toast(t==='bright'?'السطوع مفعّل':'الوضع المعتم')}
  setTone(root.getAttribute('data-tone')==='bright'?'bright':'dim');
  tb.addEventListener('click',function(){setTone(root.getAttribute('data-tone')==='bright'?'dim':'bright',true)});
  /* ---------- mobile menu ---------- */
  var mb=$('#menu-btn'),mn=$('#mnav'),sc=$('#scrim');
  function openM(o){mn.classList.toggle('open',o);sc.classList.toggle('open',o);mb.setAttribute('aria-expanded',String(o));mb.setAttribute('aria-label',o?'إغلاق القائمة':'فتح القائمة');if(o)mn.querySelector('a').focus();else mb.focus()}
  function syncM(){var t=root.getAttribute('data-tone')==='bright';$('#m-tone').setAttribute('aria-checked',String(t));
    [].forEach.call(document.querySelectorAll('#m-gfx button'),function(b){var on=b.dataset.mode===Q.pref;b.setAttribute('aria-checked',String(on));b.tabIndex=on?0:-1});
    var an=$('#auto-note');$('#m-gfx-note').textContent=Q.pref==='auto'?(an&&an.textContent||'يختار حسب جهازك'):'اخترتها بنفسك'}
  $('#m-tone').addEventListener('click',function(){tb.click();syncM()});
  $('#m-gfx').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;var it=document.querySelector('.dd-item[data-mode="'+b.dataset.mode+'"]');if(it)it.click();syncM()});
  $('#m-gfx').addEventListener('keydown',function(e){var bs=[].slice.call(this.children),i=bs.indexOf(document.activeElement),d=e.key==='ArrowLeft'?1:e.key==='ArrowRight'?-1:0;if(!d||i<0)return;e.preventDefault();var n=bs[(i+d+4)%4];n.focus();n.click()});
  mb.addEventListener('click',function(){syncM();openM(!mn.classList.contains('open'))});
  sc.addEventListener('click',function(){openM(false)});
  mn.addEventListener('click',function(e){if(e.target.closest('a'))openM(false)});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'){if(mn.classList.contains('open'))openM(false);if(dd.classList.contains('open')){openDD(false);gb.focus()}}});

  /* ---------- pointer motion: page glow, card spotlight, border light, gentle tilt ---------- */
  root.classList.add('js');
  var fine=matchMedia('(hover:hover) and (pointer:fine)').matches,reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var glow=$('#cglow'),cards=[].slice.call(document.querySelectorAll('.q'));
  if(fine&&!reduce){
    var px=-999,py=-999,gx=-999,gy=-999,raf=0,rects=null;
    function measure(){rects=cards.map(function(c){var r=c.getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom}})}
    addEventListener('scroll',function(){rects=null},{passive:true});addEventListener('resize',function(){rects=null});
    function loop(){
      gx+=(px-gx)*.2;gy+=(py-gy)*.2;glow.style.transform='translate3d('+gx.toFixed(1)+'px,'+gy.toFixed(1)+'px,0)';
      if(root.dataset.gfx!=='eco'){if(!rects)measure();
        cards.forEach(function(c,i){var r=rects[i];var dx=Math.max(r.l-px,0,px-r.r),dy=Math.max(r.t-py,0,py-r.b),d=Math.hypot(dx,dy);
          var near=Math.max(0,1-d/220);if(near>0||c._n>0){c.style.setProperty('--mx',(px-r.l).toFixed(0)+'px');c.style.setProperty('--my',(py-r.t).toFixed(0)+'px');c.style.setProperty('--near',near.toFixed(2))}c._n=near})}
      if(Math.abs(px-gx)>.5||Math.abs(py-gy)>.5)raf=requestAnimationFrame(loop);else raf=0;
    }
    addEventListener('pointermove',function(e){px=e.clientX;py=e.clientY;if(gx<-900){gx=px;gy=py}glow.classList.add('on');if(!raf)raf=requestAnimationFrame(loop)},{passive:true});
    document.addEventListener('pointerleave',function(){glow.classList.remove('on')});
    cards.forEach(function(c){
      c.addEventListener('pointermove',function(e){if(root.dataset.gfx==='eco')return;var r=c.getBoundingClientRect(),nx=(e.clientX-r.left)/r.width-.5,ny=(e.clientY-r.top)/r.height-.5;
        var k=root.dataset.gfx==='ultra'?7:5;c.style.setProperty('--ry',(nx*k).toFixed(2)+'deg');c.style.setProperty('--rx',(-ny*k).toFixed(2)+'deg')});
      c.addEventListener('pointerleave',function(){c.style.setProperty('--rx','0deg');c.style.setProperty('--ry','0deg')});
    });
  }
  /* pause looping animations in sections that are off screen */
  if('IntersectionObserver' in window){var pio=new IntersectionObserver(function(es){es.forEach(function(e){e.target.classList.toggle('paused',!e.isIntersecting)})},{rootMargin:'120px 0px'});
    [].forEach.call(document.querySelectorAll('.hero,#ranks,#stats,#partners,.verse,.site-foot'),function(el){pio.observe(el)})}
  /* reveal everything below the first screen as it scrolls in, staggered per group */
  var rvs=[].slice.call(document.querySelectorAll('[data-rv]'));
  if('IntersectionObserver' in window && !reduce){
    var vh=innerHeight;
    rvs.forEach(function(el){if(el.getBoundingClientRect().top>vh*0.92)el.classList.add('rv-wait')});
    var rio=new IntersectionObserver(function(es){
      var batch=es.filter(function(e){return e.isIntersecting}).map(function(e){return e.target});
      batch.sort(function(a,b){return a.getBoundingClientRect().top-b.getBoundingClientRect().top||b.getBoundingClientRect().left-a.getBoundingClientRect().left});
      batch.forEach(function(el,i){el.style.setProperty('--d',(i*0.08)+'s');el.classList.add('rv-show');el.classList.remove('rv-wait');rio.unobserve(el)});
    },{threshold:.15,rootMargin:'0px 0px -6% 0px'});
    rvs.forEach(function(el){if(el.classList.contains('rv-wait'))rio.observe(el)});
  }
  cards.forEach(function(c){c.addEventListener('click',function(){c.classList.remove('press');void c.offsetWidth;c.classList.add('press');if(c.target==='_blank')toast('فتحنا الصفحة بتبويب جديد')})});
  /* count the platform numbers up once when they scroll into view */
  /* live streams and monthly views: estimates that start in November 2026 and grow a little each month
     live stays under half the active streamers */
  (function(){var d=new Date(),m=Math.max(0,(d.getFullYear()-2026)*12+d.getMonth()-10),STREAMERS=550;
    var live=Math.min(Math.round(240*Math.pow(1.05,m)),Math.floor(STREAMERS*.48)),views=Math.round(100000*Math.pow(1.09,m)/100)*100;
    [].forEach.call(document.querySelectorAll('[data-grow]'),function(el){el.dataset.to=el.dataset.grow==='live'?live:views});
    [].forEach.call(document.querySelectorAll('[data-grow-text="live"]'),function(el){el.textContent=live.toLocaleString('en')})})();
  function countUp(el){var to=parseFloat(el.dataset.to),dec=+el.dataset.dec,t0=null,D=1800;
    function f(t){if(!t0)t0=t;var k=Math.min(1,(t-t0)/D),e=1-Math.pow(1-k,4),v=to*e;
      el.textContent=dec?v.toFixed(dec):Math.round(v).toLocaleString('en-US');if(k<1)requestAnimationFrame(f)}
    if(reduce||root.dataset.gfx==='eco'){el.textContent=dec?to.toFixed(dec):to.toLocaleString('en-US');return}
    requestAnimationFrame(f)}
  var stats=[].slice.call(document.querySelectorAll('.seg'));
  if('IntersectionObserver' in window){var sio=new IntersectionObserver(function(es){es.forEach(function(e){if(!e.isIntersecting)return;
    var i=stats.indexOf(e.target);setTimeout(function(){e.target.classList.add('go');countUp(e.target.querySelector('.big'))},i*110);sio.unobserve(e.target)})},{threshold:.4});
    stats.forEach(function(s){sio.observe(s)})}else stats.forEach(function(s){s.classList.add('go');countUp(s.querySelector('.big'))});
  /* ---------- sign-in: one button, the email decides login or new account ---------- */
  var au=$('#au'),aus=$('#au-scrim'),auBack=$('#au-back'),opener=null,auHist=[],auMail='';
  var STEP_IX={start:0,login:1,signup:1,code:2,done:2};
  function show(st,push){[].forEach.call(au.querySelectorAll('.au-step'),function(x){x.hidden=x.dataset.step!==st});
    if(push!==false&&auHist[auHist.length-1]!==st)auHist.push(st);
    auBack.hidden=auHist.length<2||st==='done';
    [].forEach.call(au.querySelectorAll('.au-steps li'),function(li,i){li.classList.toggle('on',i<=STEP_IX[st])});
    var f=au.querySelector('.au-step:not([hidden]) input:not([type=radio]):not([type=checkbox])');if(f)setTimeout(function(){f.focus()},60)}
  function openAuth(e){if(e&&e.currentTarget&&e.currentTarget.dataset&&e.currentTarget.dataset.signed){location.href='profile.html';return}opener=e&&e.currentTarget||null;if(mn.classList.contains('open'))openM(false);au.hidden=aus.hidden=false;document.body.classList.add('lock');auHist=[];show('start')}
  function closeAuth(){au.hidden=aus.hidden=true;document.body.classList.remove('lock');if(opener)opener.focus()}
  [].forEach.call(document.querySelectorAll('[data-auth]'),function(b){b.addEventListener('click',openAuth)});
  $('#au-close').addEventListener('click',closeAuth);aus.addEventListener('click',closeAuth);
  auBack.addEventListener('click',function(){auHist.pop();show(auHist[auHist.length-1]||'start',false)});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!au.hidden)closeAuth()});
  au.addEventListener('click',function(e){var t=e.target.closest('[data-to]');if(t){auHist=[];show(t.dataset.to)}});
  [].forEach.call(au.querySelectorAll('.au-eye'),function(b){b.addEventListener('click',function(){var i=b.previousElementSibling,on=i.type==='password';i.type=on?'text':'password';b.setAttribute('aria-label',on?'إخفاء كلمة المرور':'إظهار كلمة المرور')})});
  function busy(form,on){var b=form.querySelector('.au-go');b.classList.toggle('loading',on);b.disabled=on}
  function say(id,t,k){var m=$(id);m.textContent=t;m.className='au-msg'+(k?' '+k:'')}
  var MAILRE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  /* ---------- fox mascot ---------- */
  var fox=$('#fox'),foxT=null,blinkT=null;
  function fx(add,ms){fox.classList.remove('happy','sad');if(add){fox.classList.add(add);clearTimeout(foxT);if(ms)foxT=setTimeout(function(){fox.classList.remove(add)},ms)}}
  function blinkLoop(){clearTimeout(blinkT);blinkT=setTimeout(function(){if(!fox.classList.contains('shy')){fox.classList.add('blink');setTimeout(function(){fox.classList.remove('blink')},140)}blinkLoop()},2600+Math.random()*2600)}
  blinkLoop();
  function track(inp){var len=inp.value.length,k=Math.min(1,len/26),x=-6+12*k;fox.style.setProperty('--px',x.toFixed(1)+'px');fox.style.setProperty('--py','4px');fox.style.setProperty('--hx',((k-.5)*10).toFixed(1))}
  /* the cat always looks down at the form; it only covers its eyes on a password field,
     and every move from one field to another makes it happy for a moment */
  function down(){fox.classList.add('look');fox.style.setProperty('--py','4px')}
  function unlook(){fox.style.setProperty('--px','0px');fox.style.setProperty('--hx','0');down()}
  down();
  var lastField=null,hopT=null;
  function isPw(i){return i&&(i.id==='au-pass'||i.id==='au-npass')}
  au.addEventListener('focusin',function(e){var i=e.target;if(!i.matches||!i.matches('input:not([type=radio]):not([type=checkbox])'))return;
    var moved=lastField&&lastField!==i;lastField=i;
    if(isPw(i)){fox.classList.remove('happy');fox.classList.add('shy');fox.classList.toggle('peek',i.type==='text');return}
    fox.classList.remove('shy','peek');track(i);
    if(moved){fox.classList.remove('sad');fox.classList.add('happy');clearTimeout(hopT);hopT=setTimeout(function(){fox.classList.remove('happy')},700)}});
  au.addEventListener('focusout',function(){setTimeout(function(){var a=document.activeElement;if(!au.contains(a)||!isPw(a))fox.classList.remove('shy','peek')},40)});
  [].forEach.call(au.querySelectorAll('input[type=email],#au-dname,#au-user,.au-code input'),function(inp){inp.addEventListener('input',function(){track(inp);fox.classList.remove('sad')});inp.addEventListener('click',function(){track(inp)})});
  [].forEach.call(au.querySelectorAll('.au-eye'),function(b){b.addEventListener('click',function(){var i=b.previousElementSibling;fox.classList.toggle('peek',i.type==='text');i.focus()})});
  var _say=say;say=function(id,t,k){_say(id,t,k);if(k==='err')fx('sad',2200)};
  var _show=show;show=function(st,push){_show(st,push);fox.classList.remove('shy','peek');lastField=null;unlook();if(st==='done')fx('happy');else if(st==='code'||st==='login'||st==='signup')fx('happy',1200);else fx(null)};
  [].forEach.call(document.querySelectorAll('[data-auth]'),function(b){b.addEventListener('click',function(){fx(null)})});
  /* real accounts through auth/auth-client.js (window.AGPAuth): the same server, token and device id as every other page */
  var A=window.AGPAuth||null;
  function here(){var p=location.pathname.split('/').pop()||'./';return p+location.search+location.hash}
  function userName(u){return (u&&(u.display_name||u.username))||''}
  var currentUser=null;
  function applyUser(u){if(!u)return;currentUser=u;signedIn(userName(u)||'حسابي')}
  function afterLogin(u,title){
    if(A&&A.needsAccountTypeChoice&&A.needsAccountTypeChoice(u)){location.href='choose-account-type.html';return}
    applyUser(u);$('#au-done-t').textContent=title+' '+userName(u);$('#au-done-s').textContent='تم تسجيل الدخول بحسابك';show('done');
    if(A&&A.refreshUser)A.refreshUser().then(function(full){if(full)applyUser(full)}).catch(function(){})}
  /* restore the session on load */
  if(A&&A.getToken&&A.getToken()){var cached=A.getCachedUser&&A.getCachedUser();if(cached&&cached.username)applyUser(cached);
    if(A.refreshUser)A.refreshUser().then(function(u){if(u)applyUser(u)}).catch(function(){})}
  var USERRE=/^[A-Za-z0-9_.؀-ۿ-]{2,40}$/;
  var ERR={invalid_credentials:'الإيميل أو اسم المستخدم أو كلمة المرور غلط',already_exists:'الإيميل أو اسم المستخدم مستخدم من قبل',username_too_short:'اسم المستخدم 3 حروف على الأقل',
    invalid_email:'اكتب بريد إلكتروني صحيح',password_too_short:'كلمة المرور لازم 8 خانات على الأقل',code_resend_wait:'انتظر شوي قبل ما نرسل رمز جديد',
    email_send_failed:'ما قدرنا نرسل الرمز لبريدك حاول مرة ثانية',email_code_required:'اكتب الرمز اللي وصلك',invalid_or_expired_code:'الرمز غلط أو انتهت صلاحيته'};
  function errText(r,fallback){return (r&&r.error==='device_locked'&&r.message)||(r&&ERR[r.error])||fallback||'صار خطأ حاول مرة ثانية'}
  var NET='تعذر الاتصال بالخادم حاول مرة ثانية';
  $('#au-email-form').addEventListener('submit',function(e){e.preventDefault();var inp=$('#au-email'),v=inp.value.trim();
    var isMail=v.indexOf('@')>-1;
    if(isMail?!MAILRE.test(v.toLowerCase()):!USERRE.test(v)){inp.classList.add('bad');say('#au-email-msg','اكتب إيميل أو اسم مستخدم صحيح','err');inp.focus();return}
    inp.classList.remove('bad');say('#au-email-msg','');auMail=isMail?v.toLowerCase():v;
    $('#au-who-mail').textContent=auMail;$('#au-who-name').textContent=isMail?auMail.split('@')[0]:auMail;$('#au-av').textContent=($('#au-who-name').textContent.charAt(0)||'ا').toUpperCase();
    $('#au-pass').value='';say('#au-login-msg','');show('login')});
  $('#au-login-form').addEventListener('submit',function(e){e.preventDefault();var p=$('#au-pass');
    if(p.value.length<1){p.classList.add('bad');say('#au-login-msg','اكتب كلمة المرور','err');p.focus();return}
    if(!A){say('#au-login-msg',NET,'err');return}
    p.classList.remove('bad');say('#au-login-msg','');busy(this,true);var f=this;
    A.login(auMail,p.value).then(function(r){busy(f,false);
      if(r&&r.success){p.value='';afterLogin(r.user,'أهلًا');return}
      p.classList.add('bad');say('#au-login-msg',errText(r),'err');p.focus()
    }).catch(function(){busy(f,false);say('#au-login-msg',NET,'err')})});
  /* the full reset flow and Google sign-in live on login.html */
  $('#au-forgot').addEventListener('click',function(){location.href='login.html?next='+encodeURIComponent(here())});
  $('#au-google').addEventListener('click',function(){location.href='login.html?next='+encodeURIComponent(here())});
  $('#au-tiktok').addEventListener('click',function(){if(A&&A.tiktokLoginUrl)location.href=A.tiktokLoginUrl(here());else location.href='login.html'});
  $('#au-create').addEventListener('click',function(){$('#au-new-sub').textContent='عبّ بياناتك وابدأ';var em=$('#au-email').value.trim();$('#au-nmail').value=MAILRE.test(em)?em:'';show('signup')});
  var npass=$('#au-npass');npass.addEventListener('input',function(){var v=npass.value,sc=(v.length>=8)+(/[A-Z]/.test(v)&&/[a-z]/.test(v))+/\d/.test(v)+/[^A-Za-z0-9]/.test(v)+(v.length>=12);
    var m=$('#au-meter');m.style.width=Math.min(100,sc*20)+'%';m.style.backgroundColor=sc<2?'#e07a8b':sc<4?'#e8d8a6':'#7fd1ae';
    $('#au-meter-t').textContent=v.length<8?'8 خانات على الأقل':sc<3?'مقبولة وتقدر تقوّيها بأرقام ورموز':'كلمة مرور قوية'});
  [].forEach.call(au.querySelectorAll('input[name="au-type"]'),function(r){r.addEventListener('change',function(){$('#au-type-note').hidden=r.value!=='streamer'||!r.checked})});
  var cdT=null,pending=null;
  function startCd(n){n=n||30;var b=$('#au-resend');b.disabled=true;clearInterval(cdT);b.innerHTML='إعادة الإرسال بعد <span class="num">'+n+'</span> ثانية';
    cdT=setInterval(function(){n--;if(n<=0){clearInterval(cdT);b.disabled=false;b.textContent='إعادة إرسال الرمز';return}b.querySelector('.num').textContent=n},1000)}
  function sendCode(){return A.sendSignupCode(pending.username,pending.email)}
  $('#au-resend').addEventListener('click',function(){if(!pending||!A)return;sendCode().then(function(r){
      if(r&&r.success){toast('أرسلنا رمز جديد');startCd()}else{say('#au-code-msg',errText(r),'err');if(r&&r.retryAfter)startCd(Math.ceil(r.retryAfter/1000)||30)}
    }).catch(function(){say('#au-code-msg',NET,'err')})});
  $('#au-signup-form').addEventListener('submit',function(e){e.preventDefault();var u=$('#au-user'),em=$('#au-nmail'),pw=$('#au-npass'),tm=$('#au-terms'),bad=null;
    [u,em,pw].forEach(function(x){x.classList.remove('bad')});tm.parentNode.classList.remove('bad');
    if(!/^[A-Za-z0-9_.]{3,20}$/.test(u.value.trim())){bad=u;say('#au-signup-msg','اسم المستخدم من 3 إلى 20 حرف إنجليزي أو رقم','err')}
    else if(!MAILRE.test(em.value.trim())){bad=em;say('#au-signup-msg','اكتب بريد إلكتروني صحيح','err')}
    else if(pw.value.length<8){bad=pw;say('#au-signup-msg','كلمة المرور لازم 8 خانات على الأقل','err')}
    else if(!tm.checked){tm.parentNode.classList.add('bad');say('#au-signup-msg','لازم توافق على الشروط والسياسات','err');tm.focus();return}
    if(bad){bad.classList.add('bad');bad.focus();return}
    if(!A){say('#au-signup-msg',NET,'err');return}
    var type=au.querySelector('input[name="au-type"]:checked');
    pending={username:u.value.trim(),email:em.value.trim().toLowerCase(),password:pw.value,streamer:!!(type&&type.value==='streamer')};
    say('#au-signup-msg','');busy(this,true);var f=this;
    sendCode().then(function(r){busy(f,false);
      if(r&&r.success){auMail=pending.email;$('#au-code-mail').textContent=auMail;show('code');startCd();return}
      say('#au-signup-msg',errText(r),'err')
    }).catch(function(){busy(f,false);say('#au-signup-msg',NET,'err')})});
  var cc=[].slice.call(au.querySelectorAll('.au-code input'));
  cc.forEach(function(inp,i){inp.addEventListener('input',function(){inp.value=toLatin(inp.value).replace(/\D/g,'').slice(-1);if(inp.value&&cc[i+1])cc[i+1].focus()});
    inp.addEventListener('keydown',function(e){if(e.key==='Backspace'&&!inp.value&&cc[i-1])cc[i-1].focus()});
    inp.addEventListener('paste',function(e){var t=toLatin(e.clipboardData.getData('text')).replace(/\D/g,'').slice(0,6);if(!t)return;e.preventDefault();t.split('').forEach(function(c,j){if(cc[j])cc[j].value=c});(cc[t.length]||cc[5]).focus()})});
  $('#au-code-form').addEventListener('submit',function(e){e.preventDefault();var c=cc.map(function(x){return x.value}).join('');
    if(c.length<6){say('#au-code-msg','اكتب الأرقام الستة كاملة','err');(cc.find(function(x){return !x.value})||cc[0]).focus();return}
    if(!pending||!A)return;busy(this,true);var f=this,P=pending;
    A.signup(P.username,P.email,P.password,P.streamer,c).then(function(r){
      if(!(r&&r.success)){busy(f,false);say('#au-code-msg',errText(r),'err');return}
      return A.login(P.email,P.password).then(function(l){busy(f,false);clearInterval(cdT);
        if(l&&l.success){pending=null;afterLogin(l.user,'حياك');$('#au-done-s').textContent='تم إنشاء حسابك وسجلنا دخولك وتقدر توثّق تيك توك من ملفك'}
        else{say('#au-code-msg','انشأنا حسابك سجّل دخولك بالإيميل وكلمة المرور','err');show('start')}})
    }).catch(function(){busy(f,false);say('#au-code-msg',NET,'err')})});
  $('#au-finish').addEventListener('click',closeAuth);
  var signedInState=false;
  function signedIn(n){signedInState=true;[].forEach.call(document.querySelectorAll('[data-auth]'),function(b){var s=b.querySelector('span');if(s)s.textContent='البروفايل';else b.lastChild.textContent='البروفايل';b.setAttribute('aria-label','البروفايل: '+n);b.title=n;b.dataset.signed='1'})}
  /* links to a section of the home page (the ranking goes to صناع النجاح) from any view */
  document.addEventListener('click',function(e){var a=e.target.closest('[data-goto]');if(!a)return;e.preventDefault();
    var el=document.getElementById(a.dataset.goto);if(!el){location.href='./#'+a.dataset.goto;return}if(mn.classList.contains('open'))openM(false);
    function go(){el.scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'})}
    go()});
  /* footer: FAQ dialog and copy buttons */
  /* about, community rules and why we changed: same content as info.html in a closable dialog */
  (function(){
    var DOCS={"why": {"t": "ليش غيرنا المعادلة", "i": "هدفنا نسهل صناعة المحتوى ونخلي كل بث تجربة ممتعة لك ولجمهورك", "s": [["البث صار أسهل", "ما تحتاج برامج معقدة ولا إعدادات طويلة تختار اللعبة وتتصل ببثك وتبدأ خلال دقيقة", ["كل الألعاب تشتغل من المتصفح", "تيك توك وكيك وتويتش من نفس المكان"]], ["جمهورك جزء من البث", "متابعينك يلعبون معك بالتعليقات والهدايا بدون تحميل أي تطبيق فيصير بثك تفاعلي ويرجعون له", ["تفاعل مباشر يرفع حماس البث", "ألعاب للجوالات والجمعات بدون بث بعد"]], ["كل شي بمكان واحد", "ألعاب البثوث والديسكورد والتصنيفات والإطارات في منصة وحدة باشتراك واحد", ["نفس المميزات بكل الباقات", "يوم مجاني تجرب فيه كل شي"]], ["نكبر مع المجتمع", "أفكار كثيرة من الستريمرز واللاعبين صارت ألعاب فعلية ونطورها معكم أول بأول", ["اقتراحاتك توصلنا مباشرة", "أصحاب الأفكار تلقاهم في شركاء الإبداع"]]]}, "about": {"t": "عن المنصة", "i": "منصة ألعاب تفاعلية لصناع المحتوى وجمهورهم بروح وبصمة سعودية", "s": [["وش نسوي", "نصنع ألعاب يشارك فيها الجمهور مباشرة من بث صانع المحتوى بدون تحميل أي تطبيق", ["ألعاب سريعة تشتغل من المتصفح", "تفاعل مباشر عبر التعليقات والهدايا"]], ["هدفنا", "نسهل صناعة المحتوى ونعطي كل ستريمر أدوات تخلي بثه أمتع وجمهوره أقرب", []], ["المجتمع شريكنا", "أفكار كثيرة من اللاعبين والستريمرز صارت ألعاب فعلية على المنصة", ["أصحاب الأفكار تلقاهم في شركاء الإبداع", "باب الأفكار مفتوح دائما عبر التواصل"]]]}, "rules": {"t": "قواعد المجتمع", "i": "كيف نحافظ على جو نظيف وممتع للجميع داخل الألعاب والبثوث", "s": [["الاحترام أولا", "الاختلاف طبيعي والإساءة ما لها مكان", ["ممنوع السخرية من الأشخاص أو الفئات", "ممنوع التهديد أو التحريض على أي شخص"]], ["اللعب النظيف", "الفوز يكون بمهارتك مو بالاستغلال", ["ممنوع استغلال الأخطاء البرمجية", "ممنوع التنسيق المسبق للنتائج"], "الغش المتكرر يؤدي لحذف النقاط والإطارات المكتسبة"], ["المحتوى داخل البث", "الألعاب تظهر لجمهور واسع فالمحتوى لازم يكون مناسب", ["ممنوع المحتوى المخالف للأنظمة أو للأعراف", "احترم قوانين المنصة اللي تبث عليها"]], ["الإبلاغ والعقوبات", "أي مخالفة تراجع من فريق المجتمع", ["بلغ عن أي سلوك مخالف من داخل اللعبة", "العقوبات تتدرج من تنبيه إلى إيقاف دائم"]]]}};
    var d=$('#doc'),sc=$('#doc-scrim'),x=$('#doc-close'),opener=null;
    function esc(t){return String(t).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
    function open(k,from){var D=DOCS[k];if(!D)return;opener=from||null;$('#doc-title').textContent=D.t;$('#doc-intro').textContent=D.i;
      $('#doc-body').innerHTML=D.s.map(function(x,i){return '<section class="doc-sec" style="--i:'+i+'"><span class="doc-n">'+(i+1)+'</span><div><h3>'+esc(x[0])+'</h3><p>'+esc(x[1])+'</p>'+
        (x[2]&&x[2].length?'<ul>'+x[2].map(function(p){return '<li>'+esc(p)+'</li>'}).join('')+'</ul>':'')+(x[3]?'<p class="doc-note">'+esc(x[3])+'</p>':'')+'</div></section>'}).join('');
      d.hidden=sc.hidden=false;$('#doc-body').scrollTop=0;document.body.classList.add('lock');x.focus()}
    function close(){if(d.hidden)return;d.hidden=sc.hidden=true;if(!$('#au')||$('#au').hidden)document.body.classList.remove('lock');if(opener)opener.focus({preventScroll:true})}
    document.addEventListener('click',function(e){var a=e.target.closest('[data-doc]');if(!a)return;e.preventDefault();open(a.dataset.doc,a)});
    x.addEventListener('click',close);sc.addEventListener('click',close);
    document.addEventListener('keydown',function(e){if(d.hidden)return;if(e.key==='Escape'){e.stopImmediatePropagation();close()}
      if(e.key==='Tab'){e.preventDefault();x.focus()}},true);
  })();
  var fq=$('#faq'),fs=$('#faq-scrim'),fo=$('#faq-open'),fc=$('#faq-close');if(fq&&fo){
  function faq(o){fq.hidden=fs.hidden=!o;document.body.classList.toggle('lock',o);if(o)fc.focus();else fo.focus()}
  fo.addEventListener('click',function(){faq(true)});fc.addEventListener('click',function(){faq(false)});fs.addEventListener('click',function(){faq(false)});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!fq.hidden)faq(false)});
  fq.addEventListener('keydown',function(e){if(e.key!=='Tab')return;var f=[].slice.call(fq.querySelectorAll('button,summary,a'));var a=f[0],z=f[f.length-1];
    if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}});
  }
  [].forEach.call(document.querySelectorAll('[data-copy]'),function(b){b.addEventListener('click',function(){var t=b.dataset.copy;
    try{navigator.clipboard.writeText(t).then(function(){toast('نسخنا البريد')},function(){toast(t)})}catch(e){toast(t)}})});
  /* the verse lights up once when it comes into view */
  var verse=$('.verse');if(verse){
  if('IntersectionObserver' in window){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){verse.classList.add('in');io.disconnect()}})},{threshold:.4});io.observe(verse)}else verse.classList.add('in');
  setTimeout(function(){verse.classList.add('in')},6000)}

  /* ---------- opening light ---------- */
  function lightUp(){requestAnimationFrame(function(){root.classList.add('lit')})}
  if(document.fonts&&document.fonts.ready){Promise.race([document.fonts.ready,new Promise(function(r){setTimeout(r,1200)})]).then(function(){setTimeout(lightUp,500)})}else setTimeout(lightUp,800);
  window.AGPSite={toast:toast,openAuth:function(){openAuth()},user:function(){return currentUser}};
})();
