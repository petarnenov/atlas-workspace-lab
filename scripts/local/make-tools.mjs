import { spawnSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function run(command, args, execute = spawnSync) {
  const result = execute(command, args, { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`${command} failed; check the output above.`);
}

export function doctor(execute = spawnSync, log = console.log) {
  const checks = [
    ['Node.js 24', 'node', ['--version'], /^v24\./, 'Install Node.js 24.'],
    ['pnpm 10', 'pnpm', ['--version'], /^10\./, 'Enable Corepack and install pnpm 10.'],
    ['JDK 21', 'java', ['-version'], /version "21[.\"]/, 'Install JDK 21 and select JAVA_HOME.'],
    ['javac 21', 'javac', ['-version'], /^javac 21[.\s]/, 'Select a complete JDK 21.'],
    ['Docker', 'docker', ['--version'], /Docker version/, 'Install Docker.'],
    ['Compose plugin 2+', 'docker', ['compose', 'version'], /version v?(?:[2-9]|[1-9][0-9]+)\./, 'Install Docker Compose plugin 2 or newer.'],
    ['Docker daemon', 'docker', ['info'], /./, 'Start Docker and check daemon access.'],
  ];
  let failed = false;
  for (const [name, command, args, pattern, remedy] of checks) {
    const result = execute(command, args, { encoding: 'utf8', timeout: 15000 });
    const ok = !result.error && result.status === 0 && pattern.test(`${result.stdout ?? ''}${result.stderr ?? ''}`);
    log(`${ok ? 'OK' : 'FAIL'} ${name}${ok ? '' : `: ${remedy}`}`);
    failed ||= !ok;
  }
  if (failed) throw new Error('Prerequisite checks failed.');
}

export function prepare(exists = existsSync, execute = run, log = console.log) {
  const files = ['.env', ...['fixture', 'service'].flatMap(name =>
    ['private', 'public'].map(kind => `.local/${name}-${kind}.pem`))];
  const present = files.map(file => exists(file));
  if (present.every(Boolean)) { log('Existing local credentials preserved.'); return; }
  if (present.some(Boolean)) throw new Error('Partial local credentials: restore the matching .env and all four keys from your local backup. Never regenerate credentials against existing volumes.');
  execute('node', ['scripts/local/prepare.mjs']);
}

export function supervise(start = spawn, signals = process) {
  const terminate = (child, signal) => {
    if (start === spawn && child.pid) {
      try { process.kill(-child.pid, signal); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    } else child.kill(signal);
  };
  const children = [];
  let stopping = false;
  let timer;
  const stop = (code) => {
    if (stopping) return;
    stopping = true;
    signals.exitCode = code;
    for (const child of children) if (child.exitCode === null) terminate(child, 'SIGTERM');
    timer = setTimeout(() => {
      for (const child of children) if (child.exitCode === null) terminate(child, 'SIGKILL');
    }, 5000);
    timer.unref();
  };
  signals.once('SIGINT', () => stop(130));
  signals.once('SIGTERM', () => stop(143));
  for (const [command, args] of [
    ['node', ['scripts/local/apps.mjs']],
    ['pnpm', ['--filter', '@atlas/portal-ui', 'dev', '--host', '127.0.0.1']],
  ]) {
    const child = start(command, args, { stdio: 'inherit', detached: true });
    children.push(child);
    child.once('error', () => stop(1));
    child.once('exit', () => {
      stop(1);
      if (children.every(item => item.exitCode !== null)) clearTimeout(timer);
    });
  }
  return children;
}

export function main(action) {
  if (action === 'doctor') {
    doctor();
    console.log('Run make setup to prepare local credentials and dependencies.');
  } else if (action === 'prepare') prepare();
  else if (action === 'setup') {
    doctor();
    run('pnpm', ['install', '--frozen-lockfile']);
    prepare();
    run('pnpm', ['exec', 'playwright', 'install', 'chromium']);
  } else if (action === 'dev') {
    doctor();
    prepare();
    run('./gradlew', ['assemble', '--no-daemon']);
    run('node', ['scripts/local/up.mjs']);
    supervise();
  } else throw new Error('Unknown local tooling action.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv[2]); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
