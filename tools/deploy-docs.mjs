/**
 * 更新線上網站（GitHub Pages 由 main 的 /docs 提供）。
 *
 * 用法（在 main 分支執行）：
 *   node tools/deploy-docs.mjs
 *   或  pnpm deploy
 *
 * 流程：build → 把 dist 內容複製到 docs/（保留 docs/*.png 截圖）→ git add docs → commit → push main
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const DOCS = join(ROOT, 'docs');

function run(cmd, args, cwd = ROOT) {
  execFileSync(cmd, args, { cwd, stdio: 'inherit' });
}

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') {
  console.error('✗ 請先切到 main 分支：git checkout main');
  process.exit(1);
}

console.log('\n▶ Build');
run(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build']);

console.log('\n▶ 複製到 docs/（保留 *.png 截圖）');
if (!existsSync(DOCS)) console.error('✗ 找不到 docs/');
cpSync(DIST, DOCS, { recursive: true, force: true });
// GitHub Pages 用 Jekyll 會忽略部分檔案，加 .nojekyll 關掉
writeFileSync(join(DOCS, '.nojekyll'), '');

console.log('\n▶ Commit + push main');
run('git', ['add', 'docs']);
if (git('status', '--porcelain', '--', 'docs') === '') {
  console.log('docs/ 冇變動，唔需要部署。');
  process.exit(0);
}
run('git', ['commit', '-m', `deploy: 更新線上網站 ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`]);
run('git', ['push', 'origin', 'main']);

console.log('\n✅ 已推送，GitHub Pages 約一分鐘內更新。');
console.log('   https://d-hkd.github.io/hk-traffic-super-screen/');
