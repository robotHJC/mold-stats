/*
 * 部署结果自检：仓库内容 + Pages 状态 + 线上地址能不能真的打开。
 *
 *   node tools/check-deploy.js            # 默认 robotHJC/mold-stats
 *   node tools/check-deploy.js owner/repo
 */
'use strict';
const { execFileSync } = require('child_process');

const REPO = process.argv[2] || 'robotHJC/mold-stats';
const GH = 'C:\\Program Files\\GitHub CLI\\gh.exe';
const [owner, name] = REPO.split('/');
const URL_LIVE = `https://${owner.toLowerCase()}.github.io/${name}/`;

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
    ];
    checks.forEach(([label, v]) => {
      if (!v) return console.log('  ✗ ' + label);
      const val = Array.isArray(v) ? v[1] : '有';
      console.log('  ✓ ' + label + '：' + val);
    });
  } catch (e) {
    console.log('  打不开：' + e.message);
    console.log('  （Pages 首次构建可能要等 1 分钟，稍后再试）');
  }
})();
