'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('fs');
var os = require('os');
var path = require('path');
var stream = require('stream');
var Database = require('better-sqlite3');
var media = require('./screen-media-service');

function svc() {
    var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agp-media-'));
    return { s: media.createService(new Database(':memory:'), dir), dir: dir };
}
var WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(60, 1)]);
var MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(40, 2)]);
function body(buf) { return stream.Readable.from([buf]); }

test('sniff detects webm/mp4/mov and rejects other files', function () {
    assert.equal(media.sniff(WEBM), 'video/webm');
    assert.equal(media.sniff(MP4), 'video/mp4');
    assert.equal(media.sniff(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypqt  '), Buffer.alloc(8)])), 'video/quicktime');
    assert.equal(media.sniff(Buffer.from('<html><body>hello</body></html>')), null);
});

test('upload stores the file, lists it for its owner only, and serves it by id', async function () {
    var t = svc();
    var r = await t.s.upload(7, { name: '  أليرت   الهدايا ', w: 1080, h: 1920, d: 4.236 }, body(WEBM));
    assert.equal(r.success, true);
    assert.match(r.media.id, /^[a-f0-9]{32}$/);
    assert.equal(r.media.name, 'أليرت الهدايا');
    assert.equal(r.media.mime, 'video/webm');
    assert.equal(r.media.size, WEBM.length);
    assert.deepEqual([r.media.w, r.media.h, r.media.d], [1080, 1920, 4.24]);
    assert.equal(t.s.list(7).length, 1);
    assert.equal(t.s.list(8).length, 0);
    var f = t.s.find(r.media.id);
    assert.deepEqual(fs.readFileSync(f.file), WEBM);
    assert.equal(t.s.find('../../etc/passwd'), null);
});

test('upload rejects non-video, empty and too-large files without leaving files behind', async function () {
    var t = svc();
    assert.equal((await t.s.upload(7, {}, body(Buffer.from('not a video at all, just text')))).error, 'unsupported_type');
    assert.equal((await t.s.upload(7, {}, stream.Readable.from([]))).error, 'empty_file');
    assert.equal((await t.s.upload(7, {}, body(WEBM), media.MAX_FILE_BYTES + 1)).error, 'file_too_large');
    var big = stream.Readable.from((function* () { for (var i = 0; i < 22; i++) yield i === 0 ? Buffer.concat([WEBM, Buffer.alloc(1024 * 1024 - WEBM.length)]) : Buffer.alloc(1024 * 1024); })());
    assert.equal((await t.s.upload(7, {}, big)).error, 'file_too_large');
    await new Promise(function (r) { setTimeout(r, 50); });
    assert.deepEqual(fs.readdirSync(t.dir), []);
    assert.equal(t.s.list(7).length, 0);
});

test('per-user file limit, and only the owner can delete', async function () {
    var t = svc();
    var first;
    for (var i = 0; i < media.MAX_FILES; i++) {
        var r = await t.s.upload(7, { name: 'v' + i }, body(MP4));
        if (!first) first = r.media.id;
    }
    assert.equal((await t.s.upload(7, {}, body(MP4))).error, 'too_many_files');
    assert.equal(t.s.remove(8, first).error, 'not_found');
    assert.equal(t.s.remove(7, first).success, true);
    assert.equal(t.s.find(first), null);
    assert.equal((await t.s.upload(7, {}, body(MP4))).success, true);
});
