import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
const storage = new Map();
globalThis.localStorage = { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) };
const { clientQueueEngine: queue, loadClientSentHistory } = await import('../src/utils/clientQueueEngine.ts');
const params = {
  title: 'test', subjectTemplate: 'hello {name}', bodyHtmlTemplate: '<p>hello</p>',
  compliance: { isAd: false, senderName: 'Test', senderEmail: 'sender@example.com', replyToEmail: 'sender@example.com', unsubscribeBaseUrl: 'https://example.com/unsubscribe', includeRfc8058Headers: true },
  rateLimit: { minDelaySec: 0.2, maxDelaySec: 0.2, batchSize: 10, batchRestSec: 1 },
  providerConfig: { provider: 'smtp' },
  recipients: [{ rowIndex: 1, email: 'a@example.com', name: 'A', company: '', variables: {} }],
};
assert.throws(() => queue.start(params), /시뮬레이션 전용/);
assert.equal(queue.getStatus().state, 'IDLE');
params.providerConfig = { provider: 'dryrun', simulateBounceRate: 0 };
queue.start(params); await delay(20); queue.pause(); queue.resume();
await delay(350);
assert.equal(queue.getStatus().stats.sent, 1);
assert.equal(loadClientSentHistory().length, 1);
assert.equal(loadClientSentHistory()[0].statusCode, 'SIMULATED_NOT_SENT');
queue.reset(); queue.start(params); queue.reset(); await delay(250);
assert.equal(queue.getStatus().stats.total, 0);
assert.equal(loadClientSentHistory().length, 1);
console.log('PASS: browser refuses real provider, simulation is labeled, pause/resume and reset do not leak old work');
