import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { doctor, prepare, run, supervise, main } from './make-tools.mjs';

test('doctor checks every prerequisite, including failures without exposing output', () => {
  const versions = ['v24.1.0', '10.0.0', 'java version "21.0.1"', 'javac 21.0.1', 'Docker version 28', 'Docker Compose version v2.40', 'Server'];
  let index = 0;
  doctor(() => ({ status: 0, stdout: versions[index++] }), () => {});
  const messages = [];
  assert.throws(() => doctor(() => ({ status: 1, stderr: 'secret' }), message => messages.push(message)));
  assert.equal(messages.length, 7);
  assert.ok(messages.every(message => !message.includes('secret')));
  assert.throws(() => doctor(() => ({ error: new Error('missing') }), () => {}));
  assert.throws(() => doctor(() => ({ status: 0, stdout: 'unsupported' }), () => {}));
});
test('prepare creates only fresh state, reuses complete state and rejects partial state', () => {
  const calls = [];
  prepare(() => false, (...args) => calls.push(args));
  assert.equal(calls.length, 1);
  prepare(() => true, () => assert.fail('must preserve'), () => {});
  assert.throws(() => prepare(file => file === '.env', () => assert.fail('must not generate')));
  assert.throws(() => prepare(file => file.endsWith('public.pem')));
});
test('run propagates exit and spawn failures', () => {
  run('tool', [], () => ({ status: 0 }));
  assert.throws(() => run('tool', [], () => ({ status: 7 })));
  assert.throws(() => run('tool', [], () => ({ error: new Error('missing') })));
  assert.throws(() => main('invalid'));
});
function fixture() {
  const signals = new EventEmitter();
  const children = supervise(() => {
    const child = new EventEmitter();
    child.exitCode = null;
    child.kills = [];
    child.kill = signal => child.kills.push(signal);
    return child;
  }, signals);
  return { signals, children };
}
for (const event of ['SIGINT', 'SIGTERM', 'error', 'exit']) {
  test(`supervision cleans up on ${event}`, () => {
    const { signals, children } = fixture();
    if (event.startsWith('SIG')) signals.emit(event);
    else children[0].emit(event);
    assert.ok(signals.exitCode > 0);
    for (const child of children) {
      assert.deepEqual(child.kills, ['SIGTERM']);
      child.exitCode = 0;
      child.emit('exit');
    }
  });
}
test('doctor accepts modern Compose plugins and rejects legacy v1', () => {
  for (const version of ['2.40.0', '5.1.3', '10.0.0', '1.29.2']) {
    const outputs = ['v24.1.0', '10.0.0', 'java version "21.0.1"', 'javac 21.0.1', 'Docker version 28', `Docker Compose version v${version}`, 'Server'];
    let index = 0;
    const check = () => doctor(() => ({ status: 0, stdout: outputs[index++] }), () => {});
    if (version.startsWith('1.')) assert.throws(check);
    else check();
  }
});
