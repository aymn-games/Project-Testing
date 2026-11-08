'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var hasAudioTools = require('./screen-audio-design').hasAudioTools;

test('audio tools: detected only when present, visible and enabled', function () {
    assert.deepEqual(hasAudioTools(null), { tts: false, music: false });
    assert.deepEqual(hasAudioTools({ items: [{ type: 'text' }] }), { tts: false, music: false });
    assert.deepEqual(hasAudioTools({ items: [{ type: 'music', hidden: true }] }), { tts: false, music: false });
    assert.deepEqual(hasAudioTools({ items: [{ type: 'tts', enabled: false }] }), { tts: false, music: false });
    assert.deepEqual(hasAudioTools({ items: [{ type: 'tts' }, { type: 'music', enabled: true }] }), { tts: true, music: true });
});
