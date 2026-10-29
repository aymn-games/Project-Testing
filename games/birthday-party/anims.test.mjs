// الحركات المسجّلة (tools/extract-anims.mjs): الحجم، العظام، الطول، وسلامة الكواترنيون
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), 'anims');
const BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'];
for (const s of ['Left', 'Right']) for (const b of ['Shoulder', 'Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot', 'ToeBase']) BONES.push(s + b);
const NAMES = ['samba', 'idle', 'walk'];
const load = (n) => JSON.parse(fs.readFileSync(path.join(DIR, n + '.json'), 'utf8'));

test('anim files exist, each ≤200KB, total ≤400KB, and SOURCE.md credits them', () => {
    let total = 0;
    for (const n of NAMES) { const sz = fs.statSync(path.join(DIR, n + '.json')).size; assert.ok(sz <= 200 * 1024, n + ' ' + sz); total += sz; }
    assert.ok(total <= 400 * 1024, 'total ' + total);
    assert.match(fs.readFileSync(path.join(DIR, 'SOURCE.md'), 'utf8'), /Mixamo/);
});

test('every clip has the 22 body bones at 15fps with matching frame counts', () => {
    for (const n of NAMES) {
        const c = load(n), frames = Math.round(c.duration * c.fps) + 1;
        assert.equal(c.fps, 15);
        assert.deepEqual(Object.keys(c.tracks).sort(), BONES.slice().sort());
        for (const b of BONES) { assert.equal(c.tracks[b].q.length, frames * 4, n + ' ' + b); assert.equal(c.rest[b].length, 4); }
        assert.equal(c.tracks.Hips.p.length, frames * 3);
    }
});

test('samba lasts 17–19s', () => {
    const d = load('samba').duration;
    assert.ok(d >= 17 && d <= 19, String(d));
});

test('every quaternion is unit length (±1e-3) and hips stay near standing height', () => {
    for (const n of NAMES) {
        const c = load(n);
        for (const b of BONES) { const q = c.tracks[b].q; for (let i = 0; i < q.length; i += 4) assert.ok(Math.abs(Math.hypot(q[i], q[i + 1], q[i + 2], q[i + 3]) - 1) < 1e-3, n + ' ' + b + ' ' + i); }
        const p = c.tracks.Hips.p; for (let i = 1; i < p.length; i += 3) assert.ok(p[i] > 0.6 && p[i] < 1.3, n + ' hips y ' + p[i]);
    }
});
