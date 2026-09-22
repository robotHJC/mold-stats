/*
 * 一键部署到 GitHub Pages。
 *
 *   node tools/deploy-pages.js               # 仓库名默认 mold-stats
 *   node tools/deploy-pages.js my-repo-name
 *
 * 做五件事：
 *   0. 先语法自检（单文件 HTML 改出语法错 → 整页全白，宁可不上线）
 *   1. 把 web/index.html 同步到 docs/index.html（Pages 从 main 分支的 /docs 发布）
 *   2. git init / add / commit
 *   3. 用 gh 建仓库（已存在就跳过）并 push
 *   4. 打开 Pages
 *
 * 注意：GitHub Pages 免费版要求仓库【公开】。
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REPO = process.argv[2] || 'mold-stats';
const GH = 'C:\\Program Files\\GitHub CLI\\gh.exe';

function run(cmd, args, opts) {
  const out = execFileSync(cmd, args, {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...(opts || {}),
  });
  return (out || '').trim();
}
function tryRun(cmd, args) {
  try { return { ok: true, out: run(cmd, args) }; }
  catch (e) { return { ok: false, out: ((e.stdout || '') + (e.stderr || '') + e.message).trim() }; }
}

/* 0. 语法自检 —— 不过就不让它上线 */
const chk = tryRun('node', [path.join(__dirname, 'syntax-check.js')]);
console.log(chk.out.split('\n').filter(Boolean).map(function (l) { return '      ' + l; }).join('\n'));
if (!chk.ok) {
  console.log('\n✗ 语法没过，已中止。先修好再发。');
  process.exit(1);
}

/* 1. 同步 docs/ */
const docDir = path.join(ROOT, 'docs');
fs.mkdirSync(docDir, { recursive: true });
const src = fs.readFileSync(path.join(ROOT, 'web', 'index.html'), 'utf8');
fs.writeFileSync(path.join(docDir, 'index.html'), src, 'utf8');
console.log('[1/5] 已同步 docs/index.html（' + (src.length / 1024).toFixed(0) + ' KB）');

/* 2. git */
if (!fs.existsSync(path.join(ROOT, '.git'))) {
  run('git', ['init', '-b', 'main']);
  console.log('[2/5] git init');
} else {
  console.log('[2/5] 已经是 git 仓库');
}
run('git', ['add', '-A']);
const st = run('git', ['status', '--porcelain']);
if (st) {
  const who = tryRun('git', ['config', 'user.name']);
  if (!who.ok || !who.out) run('git', ['config', 'user.name', 'deploy']);
  const mail = tryRun('git', ['config', 'user.email']);
  if (!mail.ok || !mail.out) run('git', ['config', 'user.email', 'deploy@local']);
  run('git', ['commit', '-m', '部署：模具车间表格统计器']);
  console.log('      已提交');
} else {
  console.log('      没有改动');
}

/* 3. 仓库 + push */
const owner = run(GH, ['api', 'user', '--jq', '.login']);
const exists = tryRun(GH, ['repo', 'view', `${owner}/${REPO}`, '--json', 'name']);
if (!exists.ok) {
  console.log(`[3/5] 创建仓库 ${owner}/${REPO} …`);
  run(GH, ['repo', 'create', REPO, '--public', '--source', '.', '--push',
           '--description', '模具车间 Excel 统计器 —— 选表、按月×人统计、导出图片/PDF/Excel']);
} else {
  console.log(`[3/5] 仓库已存在，直接 push`);
  const remote = tryRun('git', ['remote', 'get-url', 'origin']);
  if (!remote.ok) run('git', ['remote', 'add', 'origin', `https://github.com/${owner}/${REPO}.git`]);
  run('git', ['push', '-u', 'origin', 'main']);
}

/* 4. 打开 Pages */
console.log('[4/5] 启用 Pages（main / docs）…');
const pages = tryRun(GH, ['api', '-X', 'POST', `repos/${owner}/${REPO}/pages`,
  '-f', 'source[branch]=main', '-f', 'source[path]=/docs']);
if (!pages.ok && /409|already/i.test(pages.out)) {
  tryRun(GH, ['api', '-X', 'PUT', `repos/${owner}/${REPO}/pages`,
    '-f', 'source[branch]=main', '-f', 'source[path]=/docs']);
  console.log('      （已开着，已更新设置）');
} else if (!pages.ok) {
  console.log('      ⚠ 需要手动开：Settings → Pages → Source: main / docs');
  console.log('      ' + pages.out.split('\n')[0]);
}

const url = `https://${owner.toLowerCase()}.github.io/${REPO}/`;
console.log('');
console.log('  地址：' + url);
console.log('  Pages 首次构建要 20–60 秒，之后：');
console.log('    gh api repos/' + owner + '/' + REPO + '/pages/builds/latest --jq .status');
console.log('');
