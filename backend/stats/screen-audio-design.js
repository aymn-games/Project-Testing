/**
 * أدوات الصوت بتصميم شاشة البث (Veyro): القارئ الصوتي (type 'tts') ومشغّل الأغاني
 * (type 'music'). تُستخدم لتحديد هل رابط الشاشة يحتاج الشات، وهل السيرفر يتصل
 * بالبث عشانها (stats/screen-audio-watcher.js).
 */

'use strict';

/** @returns {{ tts: boolean, music: boolean }} */
function hasAudioTools(design) {
    var out = { tts: false, music: false };
    var items = design && Array.isArray(design.items) ? design.items : [];
    items.forEach(function (it) {
        if (!it || it.hidden || it.enabled === false) return;
        if (it.type === 'tts') out.tts = true;
        else if (it.type === 'music') out.music = true;
    });
    return out;
}

/** الشاشة فيها أداة تستخدم الدونيشن (Streamlabs): أليرت دونيشن، توب «الدونيشن»، هدف دونيشن، أو «آخر دعم». */
function usesDonations(design) {
    var items = design && Array.isArray(design.items) ? design.items : [];
    return items.some(function (it) {
        if (!it || it.hidden) return false;
        if (it.type === 'alert') return (it.events || []).indexOf('donation') !== -1;
        if (it.type === 'top') return (Array.isArray(it.sections) ? it.sections : [it.section]).indexOf('donors') !== -1;
        if (it.type === 'goal') return it.metric === 'donations';
        return it.type === 'lastdonation';
    });
}

module.exports = { hasAudioTools: hasAudioTools, usesDonations: usesDonations };
