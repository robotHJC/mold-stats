/*
 * 部署结果自检：仓库内容 + Pages 状态 + 线上地址能不能真的打开。
 *
 *   node tools/check-deploy.js            # 默认 robotHJC/mold-stats
 *   node tools/check-deploy.js owner/repo
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = process.argv[2] || 'robotHJC/mold-stats';
const GH = 'C:\\Program Files\\GitHub CLI\\gh.exe';
const [owner, name] = REPO.split('/');
const URL_LIVE = `https://${owner.toLowerCase()}.github.io/${name}/`;

/* 控制台里中文经常被压坏、输出偶尔还会被吞，所以同时写一份 UTF-8 报告 */
const LOG = path.join(__dirname, '_check-deploy-out.txt');
const buf = [];
const _log = console.log;
console.log = function () {
  const s = [].slice.call(arguments).join(' ');
  buf.push(s);
  _log(s);
};
function flush() { try { fs.writeFileSync(LOG, buf.join('\n') + '\n', 'utf8'); } catch (e) {} }
process.on('exit', flush);

function gh(args) {
  try {
    return execFileSync(GH, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return 'ERR: ' + ((e.stdout || '') + (e.stderr || '')).trim().split('\n')[0];
  }
}

(async () => {
  console.log('仓库: ' + REPO + '\n');

  /* 1. 仓库文件 */
  console.log('=== 仓库文件 ===');
  const tree = gh(['api', `repos/${REPO}/git/trees/main?recursive=1`, '--jq', '.tree[].path']);
  if (tree.startsWith('ERR')) {
    console.log('取不到文件列表：' + tree);
  } else {
    const files = tree.split('\n').filter(Boolean);
    files.forEach((f) => console.log('  ' + f));
    const xls = files.filter((f) => /\.(xlsx|xls|xlsm|csv)$/i.test(f));
    console.log('');
    console.log(xls.length
      ? '  ⚠ 仓库里有表格文件：' + xls.join(', ')
      : '  ✓ 仓库里没有任何 Excel / CSV —— 用户的文件只在自己手机上，不上传、不经过服务器');
    const big = gh(['api', `repos/${REPO}`, '--jq', '.size']);
    if (!big.startsWith('ERR')) console.log('  仓库体积：' + (Number(big) / 1024).toFixed(2) + ' MB');
  }

  /* 2. Pages 状态 */
  console.log('\n=== Pages ===');
  const st = gh(['api', `repos/${REPO}/pages/builds/latest`, '--jq', '.status']);
  console.log('  最近一次构建: ' + st);

  /* 3. 线上地址 */
  console.log('\n=== 线上地址 ===');
  console.log('  ' + URL_LIVE);
  try {
    const r = await fetch(URL_LIVE, { signal: AbortSignal.timeout(25000) });
    const html = await r.text();
    console.log('  HTTP ' + r.status + '   ' + (html.length / 1024).toFixed(0) + ' KB');
    const checks = [
      ['页面标题', /<title>([^<]*)<\/title>/.exec(html)],
      ['读 Excel 的代码在', html.includes('deflate-raw')],
      ['sheet 选择器在', html.includes('选择数据表')],
      ['导出图片在', html.includes('exportPng')],
      ['内置浏览器选文件的提示在', html.includes('wxwarn')],
      ['主索引下拉在', html.includes('primarySel')],
      ['统计项构造器在', html.includes('addAgg')],
      /* 原表核对：线上跑的是哪一版，就看这几项在不在 */
      ['原表核对弹层在', html.includes('id="verifyModal"')],
      ['原表核对按钮在', html.includes('data-verify')],
      ['核对是独立重扫的（不是复用统计）', html.includes('vfScan') && html.includes('bList')],
      ['版本号', /APP_VER\s*=\s*'([^']+)'/.exec(html)],
      ['缓存自检在（会自己抓一遍线上比对版本）', html.includes("cache: 'no-store'") && html.includes('updBar')],
      ['默认不预填的提醒在', html.includes('needTip') && html.includes('renderNeeds')],
      ['导出范围（每组可勾）在', html.includes('data-exp') && html.includes('renderExpBar')],
      ['不导出的组打印时隐藏', html.includes('.gr.noexp{display:none')],
      ['no-cache meta 在', html.includes('must-revalidate')],
    ];
    checks.forEach(([label, v]) => {
      if (!v) return console.log('  ✗ ' + label + ' —— 线上还是旧版本！先 Ctrl+F5 再查一次');
      const val = Array.isArray(v) ? v[1] : '有';
      console.log('  ✓ ' + label + '：' + val);
    });
    console.log('\n  ⚠ 浏览器缓存自查：如果上面有 ✗，先确认不是本地缓存 —— 换个浏览器或加 ?v=' + Date.now() + ' 再看。');
  } catch (e) {
    console.log('  打不开：' + e.message);
    console.log('  （Pages 首次构建可能要等 1 分钟，稍后再试）');
  }
})();
