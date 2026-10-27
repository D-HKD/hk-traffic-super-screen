/**
 * 一鍵部署到 GitHub Pages（gh-pages 分支）。
 *
 * 用法：
 *   node tools/deploy-gh-pages.mjs
 *   或  pnpm deploy
 *
 * 流程：build → 把 dist 複製到臨時目錄 → git init → 推到 origin 的 gh-pages 分支。
 * 呢個做法唔需要喺 GitHub 設定「GitHub Actions」來源，Pages 只需揀 Branch: gh-pages。
 *
 * 前置：
 *   1. Settings → Pages → Branch 揀 `gh-pages`、資料夾 `/ (root)`
 *   2. 本機要有 GitHub 寫入權限（Git Credential Manager 已經登入就 OK）
 */

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const WORK = join(tmpdir(), 'hk-traffic-gh-pages');

const REMOTE = process.env.GH_PAGES_REMOTE ?? 'https://github.com/D-HKD/hk-traffic-super-screen.git';
const BRANCH = 'gh-pages';

const step = (label) => console.log(`\n▶ ${label}`);

function run(cmd, args, cwd) {
  execFileSync(cmd, args, { cwd, stdio: 'inherit' });
}

step('Build');
// 直接用 node 跑 vite，唔依賴 npm/npx 在 PATH
run(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], ROOT);

step('準備乾淨的工作目錄');
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
cpSync(DIST, WORK, { recursive: true });
// .nojekyll：避免 GitHub Pages 用 Jekyll 處理，導致某些檔案被忽略
writeFileSync(join(WORK, '.nojekyll'), '');

step('提交並推送');
run('git', ['init', '-b', BRANCH, '--quiet'], WORK);
run('git', ['config', 'user.name', 'D-HKD'], WORK);
run('git', ['config', 'user.email', 'idyl.2014061@gmail.com'], WORK);
run('git', ['add', '-A'], WORK);
run('git', ['commit', '-m', `deploy: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`], WORK);
run('git', ['remote', 'add', 'origin', REMOTE], WORK);
run('git', ['push', '--force', 'origin', BRANCH], WORK);

console.log(`\n✅ 已推送到 ${BRANCH}。GitHub Pages 大約一分鐘內更新。`);
console.log('   網址：https://d-hkd.github.io/hk-traffic-super-screen/');
