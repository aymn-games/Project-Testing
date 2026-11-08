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

var usesDonations = require('./screen-audio-design').usesDonations;
test('donation tools: alert/top/goal/last donation, hidden ignored', function () {
    assert.equal(usesDonations(null), false);
    assert.equal(usesDonations({ items: [{ type: 'alert', events: ['gift'] }, { type: 'top', sections: ['likers'] }, { type: 'goal', metric: 'likes' }] }), false);
    assert.equal(usesDonations({ items: [{ type: 'alert', events: ['gift', 'donation'] }] }), true);
    assert.equal(usesDonations({ items: [{ type: 'top', sections: ['gifters', 'donors'] }] }), true);
    assert.equal(usesDonations({ items: [{ type: 'goal', metric: 'donations' }] }), true);
    assert.equal(usesDonations({ items: [{ type: 'lastdonation' }] }), true);
    assert.equal(usesDonations({ items: [{ type: 'lastdonation', hidden: true }] }), false);
});
