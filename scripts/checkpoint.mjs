import { spawnSync } from 'node:child_process';

const message = process.argv.slice(2).join(' ').trim();

if (!message) {
  console.error('Usage: npm run checkpoint -- "feat(scope): summary"');
  process.exit(1);
}

const add = spawnSync('git', ['add', '-A'], { stdio: 'inherit' });
if (add.status !== 0) {
  process.exit(add.status ?? 1);
}

const staged = spawnSync('git', ['diff', '--cached', '--quiet']);
if (staged.status === 0) {
  console.log('No staged changes to commit.');
  process.exit(0);
}

const commit = spawnSync('git', ['commit', '-m', message], { stdio: 'inherit' });
process.exit(commit.status ?? 1);
