/**
 * حصيلة — صور الفئات (SVG بالكود) وبياناتها: اسم الفئة ولونها.
 * منقولة من تصميم شاشة اختيار الفئات (mockups/quiz-board/art.js).
 * AGP.hasilaArt = { CATS, svgFor(cat, uniqueId) }.
 */
window.AymanGamesPlatform = window.AymanGamesPlatform || {};
(function (AGP) {
'use strict';
const CATS=[
 {k:'flags',t:'أعلام الدول',n:'195 سؤال',c1:'#5ccfff',dk:'#2d4f9e'},
 {k:'games',t:'تحدي الألعاب',n:'120 سؤال',c1:'#a77bff',dk:'#4a2a9a'},
 {k:'songs',t:'الأغاني العربية',n:'300 سؤال',c1:'#ff8a65',dk:'#7a2e1f'},
 {k:'blur',t:'الصورة المغبشة',n:'300 سؤال',c1:'#8b9dff',dk:'#2e3a8c'},
 {k:'general',t:'معلومات عامة',n:'329 سؤال',c1:'#b28cf5',dk:'#4a2a9a'},
 {k:'apps',t:'شعارات التطبيقات',n:'213 سؤال',c1:'#38e0c8',dk:'#145e5a'},
 {k:'brands',t:'شعارات البراندات',n:'219 سؤال',c1:'#f6c66b',dk:'#7a5414'},
 {k:'islamic',t:'أسئلة إسلامية',n:'213 سؤال',c1:'#7fd8a4',dk:'#1c5a3c'},
 {k:'prophets',t:'قصص الأنبياء',n:'204 سؤال',c1:'#5eead4',dk:'#1d5c63'},
 {k:'spl',t:'الدوري السعودي',n:'300 سؤال',c1:'#6fe3a5',dk:'#1f6550'},
 {k:'wc',t:'كأس العالم',n:'300 سؤال',c1:'#ffc83d',dk:'#7a4a1a'},
 {k:'crests',t:'الشعارات الكروية',n:'300 سؤال',c1:'#ff7ce8',dk:'#74246e'},
 {k:'saudi',t:'السعودية',n:'309 سؤال',c1:'#34d399',dk:'#0f5132',neu:1},
 {k:'proverbs',t:'أمثال',n:'328 سؤال',c1:'#fb923c',dk:'#7c2d12',neu:1},
 {k:'riddles',t:'ألغاز وفوازير',n:'310 سؤال',c1:'#60a5fa',dk:'#1e3a8a',neu:1},
 {k:'emoji',t:'إيموجي',n:'314 سؤال',c1:'#facc15',dk:'#713f12',neu:1},
];
const spark=(x,y,s,o=1)=>`<path transform="translate(${x} ${y})" opacity="${o}" fill="#fff" d="M0,-${s}Q0,0 ${s},0Q0,0 0,${s}Q0,0 -${s},0Q0,0 0,-${s}z"/>`;
function frame(c,id,inner){return `<svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet" overflow="visible" xmlns="http://www.w3.org/2000/svg">
<defs>
 <radialGradient id="bg${id}" cx=".5" cy=".38" r=".75"><stop offset="0" stop-color="${c.c1}" stop-opacity=".62"/><stop offset=".45" stop-color="${c.c1}" stop-opacity=".22"/><stop offset="1" stop-color="${c.c1}" stop-opacity="0"/></radialGradient>
 <radialGradient id="bp${id}" cx=".2" cy="1" r=".8"><stop offset="0" stop-color="#7c3aed" stop-opacity=".35"/><stop offset="1" stop-color="#7c3aed" stop-opacity="0"/></radialGradient>
 <radialGradient id="sp${id}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
 <linearGradient id="w${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e4dcf7"/></linearGradient>
 <linearGradient id="gd${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe9b0"/><stop offset=".5" stop-color="#ffc83d"/><stop offset="1" stop-color="#d98b1f"/></linearGradient>
 <pattern id="dt${id}" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".8" fill="#fff" opacity=".07"/></pattern>
 <filter id="sh${id}" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#0a0616" flood-opacity=".55"/></filter>
 <filter id="gl${id}"><feGaussianBlur stdDeviation="10"/></filter>
</defs>
<rect x="-300" y="-300" width="800" height="800" fill="#140b24"/>
<rect x="-300" y="-300" width="800" height="800" fill="url(#bg${id})"/>
<rect x="-300" y="-300" width="800" height="800" fill="url(#bp${id})"/>
<rect x="-300" y="-300" width="800" height="800" fill="url(#dt${id})"/>
<circle cx="100" cy="100" r="58" fill="${c.c1}" opacity=".28" filter="url(#gl${id})"/>
<circle cx="100" cy="98" r="70" fill="url(#sp${id})"/>
<circle cx="100" cy="98" r="64" fill="none" stroke="#fff" stroke-opacity=".10" stroke-width="1" stroke-dasharray="2 5"/>
<ellipse cx="100" cy="166" rx="50" ry="7" fill="#05030a" opacity=".45" filter="url(#sh${id})"/>
<g filter="url(#sh${id})">${inner}</g>
${spark(36,42,6,.85)}${spark(168,60,4.5,.7)}${spark(160,148,5,.6)}${spark(44,138,3.5,.5)}
</svg>`}
const ART={
flags:(c,i)=>`
 <circle cx="100" cy="118" r="46" fill="url(#w${i})"/>
 <path d="M70,96c10-8 22-6 28 2s-2 16 6 22-4 18-14 16-14-12-22-12-14-10-8-18 4-6 10-10z" fill="${c.c1}" opacity=".85"/>
 <path d="M118,92c8-2 18 4 20 12s-6 10-4 18-8 14-14 10-2-12-8-16-6-20 6-24z" fill="${c.c1}" opacity=".85"/>
 <path d="M54,118h92M100,72v92M62,96q38,10 76,0M62,140q38,-10 76,0" stroke="${c.dk}" stroke-opacity=".22" stroke-width="1.5" fill="none"/>
 <ellipse cx="100" cy="118" rx="22" ry="46" fill="none" stroke="${c.dk}" stroke-opacity=".22" stroke-width="1.5"/>
 <rect x="66" y="34" width="3.5" height="56" rx="1.7" fill="#efeaff"/>
 <path d="M69.5,36q14,-6 28,0t28,0v24q-14,6 -28,0t-28,0z" transform="rotate(-14 69 36)" fill="#a77bff"/>
 <path d="M69.5,44q14,-6 28,0t28,0v8q-14,6 -28,0t-28,0z" transform="rotate(-14 69 36)" fill="#fff"/>
 <rect x="128" y="44" width="3.5" height="48" rx="1.7" fill="#efeaff"/>
 <path d="M131.5,46q11,-5 22,0t22,0v20q-11,5 -22,0t-22,0z" transform="rotate(10 131 46)" fill="#ff7ce8"/>
 <circle cx="152" cy="58" r="5" fill="#fff" transform="rotate(10 131 46)"/>`,
games:(c,i)=>`
 <path d="M44,104c0-20 15-32 33-32h46c18,0 33,12 33,32l8,32c4,16 -12,25 -23,16l-15-14h-52l-15,14c-11,9 -27,0 -23-16z" fill="url(#w${i})"/>
 <path d="M70,94h10v-10h10v10h10v10h-10v10h-10v-10h-10z" fill="${c.dk}"/>
 <circle cx="132" cy="88" r="7" fill="#6fe3a5"/><circle cx="146" cy="102" r="7" fill="#ff7ce8"/>
 <circle cx="118" cy="102" r="7" fill="#5ccfff"/><circle cx="132" cy="116" r="7" fill="#ffc83d"/>
 <circle cx="88" cy="128" r="9" fill="#d9d0f0"/><circle cx="114" cy="128" r="9" fill="#d9d0f0"/>
 <circle cx="88" cy="128" r="5" fill="${c.dk}"/><circle cx="114" cy="128" r="5" fill="${c.dk}"/>
 <rect x="58" y="42" width="8" height="8" rx="1.5" fill="#fff" opacity=".85"/><rect x="66" y="34" width="6" height="6" rx="1" fill="#fff" opacity=".5"/>
 <rect x="138" y="40" width="8" height="8" rx="1.5" fill="url(#gd${i})"/><rect x="148" y="48" width="5" height="5" rx="1" fill="#fff" opacity=".6"/>`,
prophets:(c,i)=>`
 <path d="M58,172V96a42,42 0 0 1 84,0V172" fill="${c.dk}" opacity=".6" stroke="url(#gd${i})" stroke-width="2.5"/>
 <path d="M70,172V100a30,30 0 0 1 60,0V172" fill="none" stroke="#ffe9b0" stroke-opacity=".3" stroke-width="1.3"/>
 <path d="M100,104C86,94 66,94 52,100v40c14-6 34-6 48,4z" fill="url(#w${i})"/>
 <path d="M100,104C114,94 134,94 148,100v40c-14-6 -34-6 -48,4z" fill="#f1ecfb"/>
 <path d="M60,108q16-5 32,0M60,116q16-5 32,0M60,124q16-5 32,0M108,108q16-5 32,0M108,116q16-5 32,0M108,124q16-5 32,0" stroke="${c.dk}" stroke-opacity=".3" stroke-width="1.5" fill="none"/>
 <path d="M54,142L100,170L146,142L140,138L100,162L60,138z" fill="url(#gd${i})"/>
 <path d="M70,160L100,142L130,160" stroke="url(#gd${i})" stroke-width="5" fill="none" stroke-linecap="round"/>
 <path d="M150,40a14,14 0 1 0 10,24a11,11 0 1 1 -10,-24z" fill="url(#gd${i})"/>
 <line x1="46" y1="20" x2="46" y2="40" stroke="#ffe9b0" stroke-width="1.3"/>
 <path d="M40,40h12l3,6v14l-3,6h-12l-3,-6v-14z" fill="url(#gd${i})"/><rect x="41" y="47" width="10" height="12" rx="2" fill="#fff8de"/>`,
spl:(c,i)=>`
 <path d="M28,128L50,92h100l22,36z" fill="${c.dk}"/>
 <path d="M36,128L54,98h92l18,30z" fill="${c.c1}"/>
 <path d="M100,98v30M60,113h80" stroke="#fff" stroke-opacity=".55" stroke-width="1.3"/><ellipse cx="100" cy="113" rx="12" ry="5" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.3"/>
 <rect x="40" y="38" width="3" height="56" fill="#efeaff"/><rect x="157" y="38" width="3" height="56" fill="#efeaff"/>
 <rect x="32" y="30" width="20" height="10" rx="3" fill="url(#w${i})"/><rect x="149" y="30" width="20" height="10" rx="3" fill="url(#w${i})"/>
 <path d="M42,40L80,100H56z M158,40L120,100H144z" fill="#fff" opacity=".14"/>
 <circle cx="100" cy="138" r="28" fill="url(#w${i})"/>
 <path d="M100,124l11,8-4,13h-14l-4-13z" fill="${c.dk}"/>
 <path d="M100,110v14M111,132l15-4M107,145l9,12M93,145l-9,12M89,132l-15-4" stroke="${c.dk}" stroke-width="2"/>
 <path d="M72,132l6-8M128,132l-6-8M86,163l4-6M114,163l-4-6" stroke="${c.dk}" stroke-width="5" stroke-linecap="round"/>`,
wc:(c,i)=>`
 <path d="M64,44h72v22c0,26 -16,42 -36,44c-20,-2 -36,-18 -36,-44z" fill="url(#gd${i})"/>
 <path d="M64,52c-18,0 -24,8 -22,18c3,14 16,20 26,22" stroke="url(#gd${i})" stroke-width="7" fill="none" stroke-linecap="round"/>
 <path d="M136,52c18,0 24,8 22,18c-3,14 -16,20 -26,22" stroke="url(#gd${i})" stroke-width="7" fill="none" stroke-linecap="round"/>
 <path d="M76,50h10v26c0,10 4,18 10,22c-14,-2 -20,-14 -20,-26z" fill="#fff" opacity=".35"/>
 <rect x="94" y="108" width="12" height="20" fill="url(#gd${i})"/>
 <path d="M80,128h40l6,16h-52z" fill="url(#gd${i})"/>
 <rect x="68" y="144" width="64" height="18" rx="4" fill="${c.dk}"/>
 <rect x="80" y="150" width="40" height="6" rx="3" fill="#ffe9b0" opacity=".8"/>
 <path d="M100,62l3.5,7 7.5,1-5.5,5 1.5,7.5-7-3.8-7,3.8 1.5-7.5-5.5-5 7.5-1z" fill="#fff"/>`,
songs:(c,i)=>`
 <rect x="50" y="118" width="12" height="34" rx="6" fill="url(#w${i})"/><rect x="68" y="98" width="12" height="54" rx="6" fill="url(#w${i})"/><rect x="120" y="104" width="12" height="48" rx="6" fill="url(#w${i})"/><rect x="138" y="124" width="12" height="28" rx="6" fill="url(#w${i})"/>
 <path d="M92,58L126,48V112" stroke="url(#gd${i})" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
 <path d="M92,58V122" stroke="url(#gd${i})" stroke-width="7" stroke-linecap="round"/>
 <ellipse cx="84" cy="124" rx="13" ry="10" fill="url(#gd${i})" transform="rotate(-18 84 124)"/>
 <ellipse cx="118" cy="114" rx="13" ry="10" fill="url(#gd${i})" transform="rotate(-18 118 114)"/>
 <path d="M92,72L126,62" stroke="url(#gd${i})" stroke-width="7" stroke-linecap="round"/>`,
blur:(c,i)=>`
 <defs><filter id="bf${i}"><feGaussianBlur stdDeviation="5"/></filter><clipPath id="bc${i}"><rect x="50" y="56" width="100" height="80" rx="10"/></clipPath><clipPath id="lc${i}"><circle cx="128" cy="118" r="20"/></clipPath></defs>
 <rect x="42" y="48" width="116" height="96" rx="16" fill="url(#w${i})"/>
 <g clip-path="url(#bc${i})"><rect x="50" y="56" width="100" height="80" fill="${c.dk}"/><g filter="url(#bf${i})"><circle cx="82" cy="92" r="20" fill="${c.c1}"/><circle cx="118" cy="102" r="16" fill="#ff7ce8"/><rect x="50" y="118" width="100" height="20" fill="#6fe3a5"/></g></g>
 <circle cx="128" cy="118" r="20" fill="${c.dk}"/><g clip-path="url(#lc${i})"><circle cx="118" cy="102" r="16" fill="#ff7ce8"/><rect x="100" y="118" width="60" height="22" fill="#6fe3a5"/></g>
 <circle cx="128" cy="118" r="20" fill="none" stroke="url(#gd${i})" stroke-width="5"/>
 <path d="M142,133L156,148" stroke="url(#gd${i})" stroke-width="8" stroke-linecap="round"/>`,
apps:(c,i)=>`
 <rect x="62" y="34" width="76" height="132" rx="16" fill="url(#w${i})"/>
 <rect x="68" y="46" width="64" height="108" rx="8" fill="${c.dk}"/>
 <rect x="74" y="54" width="22" height="22" rx="6" fill="${c.c1}"/><rect x="104" y="54" width="22" height="22" rx="6" fill="#ff7ce8"/>
 <rect x="74" y="84" width="22" height="22" rx="6" fill="url(#gd${i})"/><rect x="104" y="84" width="22" height="22" rx="6" fill="#a77bff"/>
 <rect x="74" y="114" width="22" height="22" rx="6" fill="#5ccfff"/><rect x="104" y="114" width="22" height="22" rx="6" fill="#fff" opacity=".85"/>
 <rect x="90" y="40" width="20" height="3" rx="1.5" fill="${c.dk}"/>`,
brands:(c,i)=>`
 <path d="M58,80h84l-6,82h-72z" fill="url(#w${i})"/>
 <path d="M80,80v-12a20,20 0 0 1 40,0v12" stroke="url(#gd${i})" stroke-width="6" fill="none" stroke-linecap="round"/>
 <circle cx="80" cy="92" r="4" fill="${c.dk}"/><circle cx="120" cy="92" r="4" fill="${c.dk}"/>
 <path d="M100,112l6,12 13,2-9.5,9 2.3,13-11.8-6.2-11.8,6.2 2.3-13-9.5-9 13-2z" fill="url(#gd${i})"/>
 <g transform="rotate(18 146 70)"><path d="M132,56h22l8,14-8,14h-22z" fill="${c.c1}"/><circle cx="138" cy="70" r="3.5" fill="#fff"/></g>`,
islamic:(c,i)=>`
 <path d="M60,166V112h80v54z" fill="url(#w${i})"/>
 <path d="M64,112c0-26 16-44 36-48c20,4 36,22 36,48z" fill="url(#gd${i})"/>
 <path d="M100,64v-14" stroke="url(#gd${i})" stroke-width="3"/><path d="M100,34a8,8 0 1 0 6,12a6,6 0 1 1-6,-12z" fill="url(#gd${i})"/>
 <path d="M86,166v-26a14,14 0 0 1 28,0v26z" fill="${c.dk}"/>
 <rect x="38" y="84" width="12" height="82" rx="3" fill="url(#w${i})"/><path d="M36,84l8,-16 8,16z" fill="url(#gd${i})"/>
 <rect x="150" y="84" width="12" height="82" rx="3" fill="url(#w${i})"/><path d="M148,84l8,-16 8,16z" fill="url(#gd${i})"/>
 <rect x="68" y="124" width="10" height="16" rx="5" fill="${c.dk}" opacity=".6"/><rect x="122" y="124" width="10" height="16" rx="5" fill="${c.dk}" opacity=".6"/>`,
general:(c,i)=>`
 <circle cx="100" cy="88" r="40" fill="url(#gd${i})"/>
 <path d="M80,116c0,10 6,14 6,22h28c0-8 6-12 6-22z" fill="url(#gd${i})"/>
 <ellipse cx="88" cy="74" rx="9" ry="14" fill="#fff" opacity=".45" transform="rotate(-25 88 74)"/>
 <path d="M90,108l10-22 10,22" stroke="#7a4a1a" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>
 <rect x="84" y="140" width="32" height="8" rx="3" fill="url(#w${i})"/><rect x="86" y="150" width="28" height="8" rx="3" fill="url(#w${i})"/><rect x="92" y="160" width="16" height="6" rx="3" fill="${c.dk}"/>
 <path d="M100,34v-12M60,48l-8-8M140,48l8-8M46,88h-12M154,88h12" stroke="url(#gd${i})" stroke-width="4" stroke-linecap="round"/>`,
saudi:(c,i)=>`
 <path d="M100,150V78" stroke="url(#gd${i})" stroke-width="9" stroke-linecap="round"/>
 <path d="M96,138h8M96,124h8M96,110h8M96,96h8" stroke="#a16207" stroke-opacity=".45" stroke-width="2"/>
 <path d="M100,76C88,58 66,54 48,64C66,62 82,68 100,80z" fill="url(#w${i})"/>
 <path d="M100,76C112,58 134,54 152,64C134,62 118,68 100,80z" fill="url(#w${i})"/>
 <path d="M100,78C84,72 62,80 54,98C70,86 86,82 100,82z" fill="${c.c1}"/>
 <path d="M100,78C116,72 138,80 146,98C130,86 114,82 100,82z" fill="${c.c1}"/>
 <path d="M100,76C94,58 98,44 108,36C104,50 104,62 102,78z" fill="${c.c1}"/>
 <path d="M100,76C106,60 118,52 132,52C120,58 110,66 102,78z" fill="#a7f3d0"/>
 <path d="M100,76C94,60 82,52 68,52C80,58 90,66 98,78z" fill="#a7f3d0"/>
 <circle cx="100" cy="80" r="5" fill="url(#gd${i})"/>
 <path d="M52,166C78,160 112,146 146,118" stroke="url(#w${i})" stroke-width="6" fill="none" stroke-linecap="round"/>
 <path d="M148,166C122,160 88,146 54,118" stroke="url(#w${i})" stroke-width="6" fill="none" stroke-linecap="round"/>
 <path d="M60,170l-12,-12M140,170l12,-12" stroke="url(#gd${i})" stroke-width="7" stroke-linecap="round"/>`,
proverbs:(c,i)=>`
 <path d="M44,58h112a14,14 0 0 1 14,14v52a14,14 0 0 1 -14,14h-62l-26,24v-24h-24a14,14 0 0 1 -14,-14v-52a14,14 0 0 1 14,-14z" fill="url(#w${i})"/>
 <text x="66" y="124" text-anchor="middle" font-family="Georgia,serif" font-weight="900" font-size="64" fill="${c.c1}">“</text>
 <text x="134" y="124" text-anchor="middle" font-family="Georgia,serif" font-weight="900" font-size="64" fill="${c.c1}">”</text>
 <rect x="84" y="86" width="32" height="7" rx="3.5" fill="${c.dk}" opacity=".55"/>
 <rect x="80" y="100" width="40" height="7" rx="3.5" fill="${c.dk}" opacity=".4"/>
 <rect x="88" y="114" width="24" height="7" rx="3.5" fill="${c.dk}" opacity=".3"/>
 <path d="M150,40l3.5,7 7.5,1-5.5,5 1.5,7.5-7-3.8-7,3.8 1.5-7.5-5.5-5 7.5-1z" fill="url(#gd${i})"/>`,
riddles:(c,i)=>`
 <path d="M58,62h26a14,14 0 1 1 28,0h26v28a14,14 0 1 1 0,28v28h-26a14,14 0 1 0 -28,0h-26v-28a14,14 0 1 0 0,-28z" fill="url(#w${i})" transform="rotate(-8 100 104)"/>
 <text x="100" y="128" text-anchor="middle" font-family="IBM Plex Sans Arabic,Arial" font-weight="900" font-size="58" fill="${c.dk}" transform="rotate(-8 100 104)">?</text>
 <path d="M150,150a10,10 0 1 1 0,0.1" fill="none"/>
 <circle cx="158" cy="146" r="10" fill="${c.c1}"/><text x="158" y="151" text-anchor="middle" font-family="Arial" font-weight="900" font-size="14" fill="#fff">!</text>
 <circle cx="44" cy="58" r="7" fill="url(#gd${i})"/><text x="44" y="62" text-anchor="middle" font-family="Arial" font-weight="900" font-size="10" fill="${c.dk}">?</text>`,
emoji:(c,i)=>`
 <circle cx="100" cy="104" r="52" fill="url(#gd${i})"/>
 <ellipse cx="82" cy="78" rx="14" ry="9" fill="#fff" opacity=".35" transform="rotate(-25 82 78)"/>
 <path d="M58,92h84" stroke="#1f1530" stroke-width="5" stroke-linecap="round"/>
 <path d="M60,90h34v8a14,14 0 0 1 -14,14h-6a14,14 0 0 1 -14,-14z" fill="#1f1530"/>
 <path d="M106,90h34v8a14,14 0 0 1 -14,14h-6a14,14 0 0 1 -14,-14z" fill="#1f1530"/>
 <path d="M66,96l10,-4M112,96l10,-4" stroke="#fff" stroke-opacity=".5" stroke-width="3" stroke-linecap="round"/>
 <path d="M78,126q22,20 44,0" stroke="#7a3d0f" stroke-width="5" fill="none" stroke-linecap="round"/>
 <path d="M148,50c4,-8 14,-8 14,2c0,8 -14,16 -14,16s-14,-8 -14,-16c0,-10 10,-10 14,-2z" fill="#ff7ce8"/>
 <path d="M44,150c3,-6 10,-6 10,1c0,6 -10,11 -10,11s-10,-5 -10,-11c0,-7 7,-7 10,-1z" fill="#ff7ce8" opacity=".7"/>`,
crests:(c,i)=>`
 <g transform="rotate(-16 64 100)"><path d="M64,62L90,70V96C90,114 78,126 64,132C50,126 38,114 38,96V70z" fill="${c.dk}" stroke="#fff" stroke-opacity=".4" stroke-width="1.5"/><path d="M50,74v40M64,72v54M78,74v40" stroke="#fff" stroke-opacity=".2" stroke-width="5"/></g>
 <g transform="rotate(16 136 100)"><path d="M136,62L162,70V96C162,114 150,126 136,132C122,126 110,114 110,96V70z" fill="${c.dk}" stroke="#fff" stroke-opacity=".4" stroke-width="1.5"/><circle cx="136" cy="96" r="12" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="4"/></g>
 <path d="M100,46L138,58V96C138,124 120,142 100,152C80,142 62,124 62,96V58z" fill="url(#w${i})"/>
 <path d="M100,54L130,63V96C130,118 116,133 100,142C84,133 70,118 70,96V63z" fill="none" stroke="url(#gd${i})" stroke-width="2.5"/>
 <text x="100" y="120" text-anchor="middle" font-family="IBM Plex Sans Arabic" font-weight="900" font-size="50" fill="${c.dk}">?</text>
 <path d="M100,30l3.5,7 7.5,1-5.5,5 1.5,7.5-7-3.8-7,3.8 1.5-7.5-5.5-5 7.5-1z" fill="url(#gd${i})"/>`
};
const svgFor=(c,i)=>frame(c,i,ART[c.k](c,i));

AGP.hasilaArt = { CATS: CATS, svgFor: svgFor };
})(window.AymanGamesPlatform);
