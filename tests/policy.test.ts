import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasAccess, validText, validMedia, priceInPesos, publicPost } from '../src/lib/policy.js';
import { formatMoney } from '../src/lib/money.js';
test('an authorization alone never unlocks an unpaid membership', () => {
  const now = new Date('2026-10-29T12:00:00Z');
  assert.equal(hasAccess({ status: 'authorized', endDate: new Date(0) }, now),false);
  assert.equal(hasAccess({ status: 'authorized', endDate: new Date('2027-01-01') },now),true);
  assert.equal(hasAccess({ status: 'cancelled', endDate: new Date('2027-01-01') },now),true);
  for (const status of ['pending','rejected','unpaid','charged_back']) assert.equal(hasAccess({ status, endDate: new Date('2027-01-01') },now),false);
  assert.equal(hasAccess({ status: 'authorized', endDate: new Date('2026-01-01') },now),false);
});
test('premium payload is redacted on the server for a non-member', () => {
  const post = { isPublic: false, text: 'secret', mediaUrl: 'https://res.cloudinary.com/private/video.mp4', comments: [{ text: 'private' }] };
  assert.equal(publicPost(post,false).mediaUrl,null); assert.deepEqual(publicPost(post,false).comments,[]); assert.notEqual(publicPost(post,false).text,post.text);
  assert.deepEqual(publicPost(post,true),post);
});
test('CLP uses whole pesos and historical USD cents are never reinterpreted', () => {
  assert.equal(priceInPesos('19990'),19990);
  for (const value of ['-1','NaN','Infinity','1e4','0','1.01','19.990','9999999999999999','']) assert.throws(() => priceInPesos(value));
  assert.match(formatMoney(19990,'CLP'),/19.990/);
  assert.match(formatMoney(2999,'USD'),/29,99/);
});
test('text and media are validated on the server', () => {
  assert.equal(validText(' hello '),'hello'); assert.throws(() => validText(' ')); assert.throws(() => validText('a'.repeat(1001),1000));
  for (const value of ['javascript:alert(1)','https://attacker.example/x.jpg','http://res.cloudinary.com/x.jpg','https://u:p@res.cloudinary.com/x.jpg']) assert.throws(() => validMedia(value));
});
