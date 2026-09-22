/*
 * 单文件 HTML 没有构建步骤，改完容易手滑写出语法错误 —— 而一旦整个 <script> 解析失败，
 * 页面会**全白**，很难定位。这个脚本把每个 <script> 块抽出来交给 new Function 编译，
 * 只需要几毫秒就能发现。
 *
 *   node tools/syntax-check.js [文件.html]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const file = process.argv[2] || path.join(__dirname, '..', 'web', 'index.html');
const html = fs.readFileSync(file, 'utf8');

/* 只取没有 src= 的内联块 */
const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let m, i = 0, bad = 0;

while ((m = re.exec(html))) {
  i++;
  if (/\bsrc\s*=/i.test(m[1])) continue;
  const code = m[2];
  /* 报错行号要换算回原文件 */
  const lineOf = html.slice(0, m.index + m[0].indexOf(m[2])).split('\n').length;
  try {
    new Function(code);
    console.log('  块 ' + i + '  ' + code.split('\n').length + ' 行  语法 OK');
  } catch (e) {
    bad++;
    console.log('  块 ' + i + '  第 ' + (lineOf + (e.lineNumber || 0) - 1) + ' 行附近： ' + e.message);
  }
}

/* 顺带扫几个会直接把页面搞白的坑 */
const traps = [
  [/[^A-Za-z0-9_.]∞/, '裸 ∞（JS 里不存在这个词，要写 Infinity）'],
  [/[^\w$]var\s+(TPLS|SRC|S)\s*=\s*\[[^\]]*\]\s*;[\s\S]{0,2000}?[^\w$]var\s+\1\s*=/, '同一个 var 重复声明，后面的会把前面的冲掉'],
  [/^\s*\*\/\s*\*\/\s*$/m, '多出来一个 */（注释结束符重复）'],
];
console.log('');
traps.forEach(function (t) {
  if (t[0].test(html)) { bad++; console.log('  ⚠ ' + t[1]); }
});

console.log(bad ? '\n✗ 有 ' + bad + ' 个问题' : '\n✓ ' + file + ' 没发现问题');
process.exit(bad ? 1 : 0);
