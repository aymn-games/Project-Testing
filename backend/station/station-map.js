/**
 * «محطة سهيل» — ثوابت الخريطة على الخادم (التصميم الجديد: 14 غرفة بزوايا مقطوعة،
 * 21 ممر، 14 مهمة، 12 فتحة).
 *
 * منسوخة حرفياً من games/intruder/play.html (ROOMS/CORR/TASKS/VENTS/BTN/DEV ومقياس
 * MS=1.45 وinRoom/roomAt وwalk). الخادم يستخدمها للتحقق من الحركة والمسافات
 * والمقاعد — أي تعديل على الخريطة لازم ينعكس بالملفين معاً.
 */
'use strict';
const RAD=22, SPEED=270, LONG_K=['samples','upload','reactor'];
const ROOMS=[
 {id:'lounge',n:'الاستراحة',x:860,y:60,w:580,h:500,ch:130,f:'#1d1a2b'},
 {id:'engines',n:'المحركات',x:420,y:200,w:340,h:260,ch:40,f:'#26201a'},
 {id:'reactor',n:'المفاعل',x:40,y:260,w:300,h:880,ch:60,f:'#2b1a1f'},
 {id:'security',n:'الأمن',x:440,y:560,w:300,h:240,ch:40,f:'#1a2230'},
 {id:'electrical',n:'الكهرباء',x:420,y:940,w:340,h:260,ch:30,f:'#262214'},
 {id:'hydro',n:'الحديقة المائية',x:420,y:1300,w:360,h:260,ch:50,f:'#16281f'},
 {id:'clinic',n:'العيادة',x:860,y:660,w:260,h:240,ch:30,f:'#1a2a24'},
 {id:'admin',n:'الإدارة',x:1180,y:640,w:300,h:260,ch:30,f:'#2a1a24'},
 {id:'storage',n:'المخزن',x:900,y:1040,w:480,h:480,ch:70,f:'#2a2218'},
 {id:'weapons',n:'الأسلحة',x:1580,y:120,w:300,h:320,ch:60,f:'#2a1c1c'},
 {id:'lab',n:'المختبر',x:1600,y:560,w:260,h:240,ch:30,f:'#17262a'},
 {id:'command',n:'القيادة',x:1960,y:200,w:300,h:660,ch:90,f:'#1a2033'},
 {id:'shields',n:'الدروع',x:1600,y:980,w:300,h:280,ch:60,f:'#1c2433'},
 {id:'comms',n:'الاتصالات',x:1520,y:1340,w:360,h:220,ch:30,f:'#211c33'}];
const CORR=[[760,250,100,110,0],[1440,210,140,110,0],[540,460,110,100,1],[340,620,100,110,0],[340,320,80,100,0],[340,980,80,100,0],[540,800,110,140,1],[540,1200,110,100,1],[780,1360,120,90,0],[970,900,110,140,1],[990,560,100,100,1],[1210,560,100,80,1],[1210,900,100,140,1],[1480,670,120,100,0],[1680,440,110,120,1],[1860,620,100,110,0],[1880,290,80,90,0],[1690,800,110,180,1],[1700,1260,110,80,1],[1380,1110,220,90,0],[1380,1370,140,80,0]].map(([x,y,w,h,v],i)=>({i,x,y,w,h,v:!!v}));
const TASKS=[
 {id:'t1',n:'ضبط المحرك',r:'engines',x:680,y:410,k:'calibrate'},
 {id:'t2',n:'ضبط المسار',r:'command',x:2100,y:480,k:'route'},
 {id:'t3',n:'فحص العينات',r:'lab',x:1650,y:760,k:'samples'},
 {id:'t4',n:'توصيل أسلاك الإرسال',r:'comms',x:1820,y:1440,k:'wires'},
 {id:'t5',n:'تمرير بطاقة الدخول',r:'clinic',x:1060,y:860,k:'swipe'},
 {id:'t6',n:'فتح قفل المخزن',r:'storage',x:1300,y:1460,k:'lock'},
 {id:'t7',n:'تنظيف الأحواض',r:'hydro',x:740,y:1360,k:'trash'},
 {id:'t8',n:'إصلاح المفاعل',r:'reactor',x:270,y:1060,k:'reactor'},
 {id:'t9',n:'تنظيف النفايات',r:'lounge',x:1360,y:470,k:'trash'},
 {id:'t10',n:'تصويب النيازك',r:'weapons',x:1660,y:200,k:'aim'},
 {id:'t11',n:'رفع البيانات',r:'admin',x:1230,y:850,k:'upload'},
 {id:'t12',n:'معايرة الدروع',r:'shields',x:1840,y:1060,k:'calibrate'},
 {id:'t13',n:'توصيل أسلاك الكهرباء',r:'electrical',x:700,y:1120,k:'wires'},
 {id:'t14',n:'توجيه الكاميرات',r:'security',x:690,y:760,k:'route'}];
const VENTS=[{id:'v1',x:130,y:420,to:['v2','v3']},{id:'v2',x:470,y:410,to:['v1','v5']},{id:'v3',x:110,y:1060,to:['v1','v4']},{id:'v4',x:470,y:1150,to:['v3','v5']},{id:'v5',x:480,y:760,to:['v2','v4']},{id:'v6',x:1000,y:480,to:['v7','v8']},{id:'v7',x:1440,y:860,to:['v6','v8']},{id:'v8',x:950,y:1100,to:['v6','v7']},{id:'v9',x:1640,y:400,to:['v10','v12']},{id:'v10',x:2040,y:800,to:['v9','v11']},{id:'v11',x:1650,y:1210,to:['v10','v12']},{id:'v12',x:1650,y:1500,to:['v11','v9']}];
const BTN={x:1150,y:310}, FIX={x:250,y:470};
const DEV=[{id:'r1',k:'reactor',x:250,y:470,n:'جهاز المفاعل ١'},{id:'r2',k:'reactor',x:250,y:900,n:'جهاز المفاعل ٢'},{id:'lights',k:'lights',x:500,y:1000,n:'لوحة الكهرباء'},{id:'o2a',k:'o2',x:480,y:1380,n:'أكسجين · الحديقة'},{id:'o2b',k:'o2',x:2190,y:300,n:'أكسجين · القيادة'},{id:'comms',k:'comms',x:1580,y:1420,n:'جهاز الاتصالات'}];
const MS=1.45, BTN0={x:BTN.x,y:BTN.y};
ROOMS.forEach(r=>{ r.x*=MS; r.y*=MS; r.w*=MS; r.h*=MS; r.ch=(r.ch||0)*MS; }); CORR.forEach(c=>{ c.x*=MS; c.y*=MS; c.w*=MS; c.h*=MS; }); [...TASKS,...VENTS,BTN,FIX,...DEV].forEach(o=>{ o.x*=MS; o.y*=MS; });
const inR=(x,y,a,sx,sy)=>x>=a.x+sx&&x<=a.x+a.w-sx&&y>=a.y+sy&&y<=a.y+a.h-sy;
const inRoom=(x,y,r,p)=>{ if(!inR(x,y,r,p,p)) return false; if(!r.ch) return true; const c=r.ch+p*1.414, a=x-r.x, b=r.x+r.w-x, u=y-r.y, d=r.y+r.h-y; return a+u>=c&&b+u>=c&&a+d>=c&&b+d>=c; };
const roomAt=(x,y)=>{ const r=ROOMS.find(r=>inRoom(x,y,r,0)); return r?r.id:null; };
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const rand=(a,b)=>a+Math.random()*(b-a);
const shuffle=a=>{ a=a.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };
CORR.forEach(c=>{ const cx=c.x+c.w/2, cy=c.y+c.h/2; c.e1=c.v?{x:cx,y:c.y-45}:{x:c.x-45,y:cy}; c.e2=c.v?{x:cx,y:c.y+c.h+45}:{x:c.x+c.w+45,y:cy}; c.a=roomAt(c.e1.x,c.e1.y); c.b=roomAt(c.e2.x,c.e2.y); });

function walk(x,y,lk){ for(const r of ROOMS) if(inRoom(x,y,r,RAD)) return true; for(const c of CORR){ if(lk&&lk.has(c.i)) continue; if(inR(x,y,c,c.v?RAD:-RAD-14,c.v?-RAD-14:RAD)) return true; } return false; }

module.exports = {
    RAD: RAD, SPEED: SPEED, LONG_K: LONG_K, ROOMS: ROOMS, CORR: CORR, TASKS: TASKS, VENTS: VENTS,
    BTN: BTN, DEV: DEV, MS: MS, roomAt: roomAt, dist: dist, rand: rand, shuffle: shuffle, walk: walk
};
