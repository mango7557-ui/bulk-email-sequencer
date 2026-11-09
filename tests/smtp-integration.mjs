import assert from 'node:assert/strict';
import { SMTPServer } from 'smtp-server';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// No external recipients, accounts or API calls are used by this test.
const received = [];
const attempts = new Map();
let active = 0;
let maxActive = 0;
let holdMs = 0;
const smtp = new SMTPServer({
  disabledCommands: ['STARTTLS'], allowInsecureAuth: true,
  onAuth(auth, session, done) {
    if (auth.username !== 'test' || auth.password !== 'secret') return done(new Error('Invalid login'));
    done(null, { user: 'test' });
  },
  onRcptTo(address, session, done) {
    const n = (attempts.get(address.address) || 0) + 1;
    attempts.set(address.address, n);
    if (address.address.startsWith('retry') && n === 1) return done(Object.assign(new Error('Temporary rejection'), { responseCode: 451 }));
    if (address.address.startsWith('bounce')) return done(Object.assign(new Error('Unknown mailbox'), { responseCode: 550 }));
    done();
  },
  onData(stream, session, done) {
    active++; maxActive = Math.max(maxActive, active);
    let message = '';
    stream.on('data', chunk => { message += chunk; });
    stream.on('end', () => setTimeout(() => {
      received.push({ to: session.envelope.rcptTo[0].address, at: Date.now(), message });
      active--; done();
    }, holdMs));
  },
});
smtp.on('error', error => {
  // Deliberately killing the sender during DATA resets the mock connection.
  if (error.code !== 'ECONNRESET') throw error;
});
await new Promise(resolve => smtp.listen(0, '127.0.0.1', resolve));
const smtpPort = smtp.server.address().port;
const dataDir = await mkdtemp(path.join(tmpdir(), 'mailflow-test-'));
const port = 14591;
let child;
let logs = '';
function boot() {
  child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: { ...process.env, NODE_ENV: 'test', PORT: String(port), DATA_DIR: dataDir, SMTP_PASS: 'secret' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', b => { logs += b; });
  child.stderr.on('data', b => { logs += b; });
}
async function api(route, body) {
  const response = await fetch(`http://127.0.0.1:${port}/api/${route}`, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { code: response.status, data: await response.json() };
}
async function until(predicate, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await predicate()) return; await delay(30); }
  throw new Error(`Timeout\n${logs}`);
}
async function ready() { await until(async () => { try { return (await api('campaign/status')).code === 200; } catch { return false; } }); }
async function stop() {
  const stopped = new Promise(resolve => child.once('exit', resolve));
  child.kill(); await stopped;
}
const payload = emails => ({
  title: 'SMTP integration', subjectTemplate: '안녕하세요 {name}', bodyHtmlTemplate: '<p>{name}님 테스트</p>', bodyTextTemplate: '{name}님 테스트',
  compliance: { isAd: false, senderName: '테스트', senderEmail: 'sender@example.com', replyToEmail: 'sender@example.com', senderPhone: '010-0000-0000', senderAddress: 'Test', unsubscribeBaseUrl: 'https://example.com/api/unsubscribe', includeRfc8058Headers: true },
  rateLimit: { minDelaySec: 0.2, maxDelaySec: 0.2, batchSize: 50, batchRestSec: 1 },
  providerConfig: { provider: 'smtp', smtpHost: '127.0.0.1', smtpPort, smtpUser: 'test', smtpPass: 'secret', smtpSecure: false },
  recipients: emails.map((email, i) => ({ email, rowIndex: i + 1, name: `고객${i}`, company: '테스트', variables: {} })),
});
try {
  boot(); await ready();
  const invalid = payload(['a@example.com']); invalid.rateLimit.minDelaySec = -1;
  assert.equal((await api('campaign/start', invalid)).code, 400);
  const badAuth = payload(['a@example.com']); badAuth.providerConfig.smtpPass = 'wrong';
  assert.equal((await api('campaign/start', badAuth)).code, 400);
  assert.equal(received.length, 0);

  const emails = Array.from({ length: 100 }, (_, i) => `bulk${i}@example.com`);
  const bulk = payload([...emails, emails[0], 'broken', 'optout-user@example.com']);
  const start = await api('campaign/start', bulk);
  assert.equal(start.code, 200); assert.equal(start.data.queued, 100); assert.equal(start.data.excluded, 3);
  assert.equal((await api('campaign/start', bulk)).code, 409);
  await until(async () => (await api('campaign/status')).data.state === 'COMPLETED', 60000);
  assert.deepEqual(received.map(r => r.to), emails);
  assert.equal(maxActive, 1);
  for (let i = 1; i < received.length; i++) assert.ok(received[i].at - received[i - 1].at >= 180);
  assert.match(received[0].message, /List-Unsubscribe-Post: List-Unsubscribe=One-Click/i);
  assert.match(received[0].message, /multipart\/alternative/i);
  console.log('PASS: 100 SMTP messages in order, no duplicates, concurrency=1, interval >= 200ms, headers/text/HTML, server filtering');

  holdMs = 400;
  await api('campaign/start', payload(['pause@example.com', 'afterpause@example.com']));
  await until(() => active === 1);
  await api('campaign/pause', {});
  assert.equal((await api('campaign/start', payload(['blocked@example.com']))).code, 409);
  assert.equal((await api('campaign/reset', {})).code, 409);
  await api('campaign/resume', {});
  await until(async () => (await api('campaign/status')).data.state === 'COMPLETED');
  assert.equal(received.filter(r => r.to === 'pause@example.com').length, 1);
  assert.equal(maxActive, 1);
  console.log('PASS: pause/resume during SMTP DATA does not duplicate; reset/start conflicts rejected');

  await api('campaign/start', payload(['cancel@example.com', 'never@example.com']));
  await until(() => active === 1);
  await api('campaign/cancel', {});
  await until(async () => (await api('campaign/status')).data.stats.queued === 0);
  let status = (await api('campaign/status')).data;
  assert.equal(status.tasks[0].status, 'SENT'); assert.equal(status.tasks[1].status, 'CANCELLED');
  assert.equal(received.filter(r => r.to === 'never@example.com').length, 0);
  console.log('PASS: cancel preserves in-flight SMTP acceptance and cancels only pending recipients');

  holdMs = 0;
  await api('campaign/start', payload(['retry@example.com', 'bounce@example.com', 'next@example.com']));
  await until(async () => (await api('campaign/status')).data.state === 'COMPLETED');
  status = (await api('campaign/status')).data;
  assert.equal(status.tasks[0].attempts, 2); assert.equal(status.tasks[1].status, 'BOUNCED'); assert.equal(status.tasks[2].status, 'SENT');
  console.log('PASS: temporary 451 retry, permanent 550 bounce, queue continues');

  const batch = payload(['batch1@example.com', 'batch2@example.com']);
  batch.rateLimit.batchSize = 1; batch.rateLimit.batchRestSec = 2;
  await api('campaign/start', batch);
  await until(async () => (await api('campaign/status')).data.state === 'BATCH_RESTING');
  await api('campaign/pause', {}); await api('campaign/resume', {});
  await until(async () => (await api('campaign/status')).data.state === 'COMPLETED');
  const batched = received.filter(r => r.to.startsWith('batch'));
  assert.ok(batched[1].at - batched[0].at >= 2000);
  console.log('PASS: pause/resume retains batch cooldown');

  holdMs = 1500;
  await api('campaign/start', payload(['uncertain@example.com', 'recover@example.com']));
  await until(() => active === 1); await stop(); await delay(1600);
  boot(); await ready();
  status = (await api('campaign/status')).data;
  assert.equal(status.state, 'PAUSED'); assert.equal(status.tasks[0].statusCode, 'DELIVERY_UNKNOWN_AFTER_RESTART');
  const disk = await readFile(path.join(dataDir, 'campaign.json'), 'utf8'); assert.ok(!disk.includes('secret'));
  holdMs = 0;
  assert.equal((await api('campaign/resume', {})).code, 200);
  await until(async () => (await api('campaign/status')).data.state === 'COMPLETED');
  assert.equal(received.filter(r => r.to === 'uncertain@example.com').length, 1);
  assert.equal(received.filter(r => r.to === 'recover@example.com').length, 1);
  console.log('PASS: restart restores paused queue; uncertain delivery not retried; credentials absent from snapshot');
  console.log('ALL SMTP INTEGRATION CHECKS PASSED (local mock SMTP only; no Gmail delivery claimed)');
} finally {
  if (child?.exitCode === null) await stop();
  await new Promise(resolve => smtp.close(resolve));
  await rm(dataDir, { recursive: true, force: true });
}
