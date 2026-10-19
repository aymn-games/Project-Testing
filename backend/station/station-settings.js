// نسخة الخادم من games/intruder/station-settings.js (نفس المخطط والتحقق) — أي تعديل هناك ينعكس هنا.
(function(){ var window={};
  const S=[
    {id:'players',n:'اللاعبين',icon:'👥',f:[
      {k:'minPlayers',n:'أقل عدد للبدء',t:'num',min:4,max:15,step:1,d:4},
      {k:'maxPlayers',n:'أكثر عدد بالروم',t:'num',min:4,max:20,step:1,d:15},
      {k:'startRule',n:'شرط البدء',t:'opt',o:['الحد الأدنى','الروم ممتلئ'],d:'الحد الأدنى'},
      {k:'speed',n:'سرعة الحركة',t:'num',min:.5,max:2,step:.25,d:1,u:'×'},
      {k:'startDelay',n:'عدّ تنازلي قبل البدء',t:'num',min:0,max:10,step:1,d:3,u:'ث'}]},
    {id:'tasks',n:'المهام',icon:'🛠️',f:[
      {k:'shortTasks',n:'مهام قصيرة',t:'num',min:0,max:6,step:1,d:3},
      {k:'longTasks',n:'مهام طويلة',t:'num',min:0,max:3,step:1,d:1},
      {k:'difficulty',n:'صعوبة المهام',t:'opt',o:['سهل','عادي','صعب'],d:'عادي'},
      {k:'commonTasks',n:'نفس المهام للكل',t:'bool',d:false},
      {k:'ghostTasks',n:'الميت يكمّل مهامه',t:'bool',d:true}]},
    {id:'round',n:'الجولة',icon:'⏱️',f:[
      {k:'roundMin',n:'مدة الجولة',t:'num',min:0,max:20,step:1,d:0,u:'د',zero:'بدون حد'},
      {k:'timeoutWinner',n:'عند انتهاء الوقت يفوز',t:'opt',o:['الامبوسترز','المواطنين'],d:'الامبوسترز'},
      {k:'talkSec',n:'مدة النقاش',t:'num',min:0,max:120,step:5,d:15,u:'ث'},
      {k:'voteSec',n:'مدة التصويت',t:'num',min:10,max:180,step:5,d:30,u:'ث'},
      {k:'resultSec',n:'مدة عرض النتيجة',t:'num',min:3,max:10,step:1,d:6,u:'ث'},
      {k:'emergencies',n:'اجتماعات الطوارئ لكل لاعب',t:'num',min:0,max:5,step:1,d:1},
      {k:'emergencyCd',n:'انتظار زر الطوارئ',t:'num',min:0,max:60,step:5,d:15,u:'ث'}]},
    {id:'imp',n:'الامبوستر',icon:'🔪',f:[
      {k:'impostors',n:'عدد الامبوسترز',t:'num',min:1,max:3,step:1,d:1},
      {k:'killCd',n:'انتظار بين القتل',t:'num',min:10,max:60,step:2.5,d:25,u:'ث'},
      {k:'sabCd',n:'انتظار بين التخريب',t:'num',min:10,max:60,step:5,d:25,u:'ث'},
      {k:'impVision',n:'رؤية الامبوستر',t:'num',min:.5,max:3,step:.25,d:1.5,u:'×'},
      {k:'reactorSab',n:'تخريب المفاعل',t:'bool',d:true},
      {k:'o2Sab',n:'تخريب الأكسجين',t:'bool',d:true},
      {k:'lightsSab',n:'تخريب الكهرباء',t:'bool',d:true},
      {k:'commsSab',n:'تخريب الاتصالات',t:'bool',d:true},
      {k:'o2Sec',n:'وقت إصلاح الأكسجين',t:'num',min:20,max:90,step:5,d:45,u:'ث'},
      {k:'doorSec',n:'مدة قفل الأبواب',t:'num',min:5,max:20,step:1,d:10,u:'ث'},
      {k:'doorSab',n:'قفل الأبواب',t:'bool',d:true},
      {k:'vents',n:'الفتحات',t:'bool',d:true},
      {k:'reactorSec',n:'وقت إصلاح المفاعل',t:'num',min:20,max:90,step:5,d:45,u:'ث'},
      {k:'impWinReactor',n:'يفوز إذا انفجر المفاعل أو نفد الأكسجين',t:'bool',d:true}]},
    {id:'crew',n:'المواطنين',icon:'🧑‍🚀',f:[
      {k:'crewVision',n:'رؤية المواطنين',t:'num',min:.5,max:3,step:.25,d:1,u:'×'},
      {k:'showNames',n:'أسماء اللاعبين فوق الشخصيات',t:'bool',d:true},
      {k:'crewWinTasks',n:'يفوز إذا خلّص كل المهام',t:'bool',d:true},
      {k:'ghostSeeAll',n:'الميت يشوف الماب كامل',t:'bool',d:true}]},
    {id:'vote',n:'التصويت',icon:'🗳️',f:[
      {k:'anonVotes',n:'تصويت مجهول',t:'bool',d:true},
      {k:'allowSkip',n:'السماح بالتخطي',t:'bool',d:true},
      {k:'tieRule',n:'عند التعادل',t:'opt',o:['ما أحد ينطرد','طرد عشوائي'],d:'ما أحد ينطرد'},
      {k:'confirmEject',n:'كشف دور المطرود',t:'bool',d:true}]},
    {id:'map',n:'الخريطة',icon:'🗺️',f:[
      {k:'map',n:'الخريطة',t:'opt',o:['محطة سُهيل'],d:'محطة سُهيل'},
      {k:'spawn',n:'مكان البداية',t:'opt',o:['طاولة الاستراحة','غرف عشوائية'],d:'طاولة الاستراحة'},
      {k:'taskSpots',n:'أماكن المهام',t:'opt',o:['ثابتة','عشوائية كل جولة'],d:'ثابتة'}]}
  ];
  const FIELDS={}; S.forEach(s=>s.f.forEach(f=>FIELDS[f.k]=f));
  const DEFAULTS={}; Object.values(FIELDS).forEach(f=>DEFAULTS[f.k]=f.d);
  const PRESETS={
    'افتراضي':{},
    'مبتدئين':{speed:1,shortTasks:2,longTasks:1,difficulty:'سهل',talkSec:30,voteSec:60,killCd:35,impVision:1.25,crewVision:1.25,emergencies:2,anonVotes:false,doorSab:false},
    'محترفين':{speed:1.25,shortTasks:4,longTasks:2,difficulty:'صعب',talkSec:10,voteSec:25,killCd:20,impVision:1.75,crewVision:.75,emergencies:1,roundMin:12}
  };
  function validate(v,n){
    const o={...DEFAULTS};
    Object.keys(FIELDS).forEach(k=>{ const f=FIELDS[k], x=v?v[k]:undefined;
      if(f.t==='num'){ let y=Number(x); if(!isFinite(y)) y=f.d; y=Math.min(f.max,Math.max(f.min,Math.round(y/f.step)*f.step)); o[k]=+y.toFixed(2); }
      else if(f.t==='bool') o[k]=typeof x==='boolean'?x:f.d;
      else o[k]=f.o.includes(x)?x:f.d; });
    if(o.maxPlayers<o.minPlayers) o.maxPlayers=o.minPlayers;
    if(o.shortTasks+o.longTasks<1) o.shortTasks=1;
    const cap=impCap(n==null?o.maxPlayers:n); if(o.impostors>cap) o.impostors=cap;
    return o;
  }
  function impCap(n){ return n>=13?3:n>=7?2:1; }
  function fmt(f,v){ if(f.t==='bool') return v?'مفعّل':'مقفل'; if(f.t==='opt') return v; if(f.zero&&v===0) return f.zero; return (Number.isInteger(v)?v:v.toFixed(2).replace(/0$/,''))+(f.u?' '+f.u:''); }
  module.exports={SECTIONS:S,FIELDS,DEFAULTS,PRESETS,validate,impCap,fmt};
})();
