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

module.exports = { hasAudioTools: hasAudioTools };
