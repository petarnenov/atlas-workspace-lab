import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { Script } from 'node:vm';
import test from 'node:test';

test('every hosted workflow gates every build job on a same-repository dev promotion', () => {
  const directory = '.github/workflows';
  const files = readdirSync(directory).filter(name => /\.ya?ml$/.test(name));
  assert.equal(files.length, 5);
  for (const file of files) {
    const source = readFileSync(`${directory}/${file}`, 'utf8');
    assert.match(source, /on:\n  pull_request:\n    branches: \[main\]\n/);
    assert.doesNotMatch(source, /^  (push|schedule|workflow_dispatch|pull_request_target):/m);
    const gate = source.match(/          node --input-type=module <<'JS'\n([\s\S]*?)          JS/)[1]
      .replace(/^          /gm, '');
    // Execute the actual workflow source gate, not a second copy of its policy.
    const script = new Script(gate);
    const base = {GITHUB_EVENT_NAME:'pull_request', PROMOTION_HEAD:'dev',
      PROMOTION_BASE:'main', PROMOTION_REPOSITORY:'public/demo', GITHUB_REPOSITORY:'public/demo'};
    assert.doesNotThrow(() => script.runInNewContext({process:{env:base}}));
    for (const patch of [
      {GITHUB_EVENT_NAME:'push'}, {GITHUB_EVENT_NAME:'workflow_dispatch'},
      {GITHUB_EVENT_NAME:'schedule'}, {GITHUB_EVENT_NAME:'pull_request_target'},
      {PROMOTION_HEAD:'feature/task'}, {PROMOTION_HEAD:'dev; echo injected'},
      {PROMOTION_BASE:'dev'}, {PROMOTION_REPOSITORY:'fork/demo'},
    ]) assert.throws(() => script.runInNewContext({process:{env:{...base,...patch}}}));
    const jobs = [...source.matchAll(/^  ([a-z][\w-]*):\n([\s\S]*?)(?=^  [a-z][\w-]*:\n|$(?![\s\S]))/gm)];
    assert.ok(jobs.length > 1, file);
    for (const [,name,body] of jobs) {
      if(name === 'pull_request' || name === 'promotion-source') continue;
      assert.match(body, /^    needs: promotion-source$/m, `${file}: ${name}`);
      assert.doesNotMatch(body, /^    if:.*always\(/m, 'cannot bypass failed source gate');
    }
    const sourceJob = source.split('  promotion-source:\n')[1].split(/^  \S/m)[0];
    assert.doesNotMatch(sourceJob, /actions\/checkout|secrets\./, 'gate must not execute fork code or access secrets');
  }
});
