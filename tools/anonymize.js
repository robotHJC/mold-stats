/*
 * 把示例数据里的真实客户名 / 公司名换成同风格的虚构名。
 * 原因：GitHub Pages 免费版要求仓库公开，真实客户名单公开会被爬。
 * 只替换「名字」，不动任何逻辑。
 *
 *   node tools/anonymize.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const MAP = [
  ['中山市广瑞祥五金制品有限公司', '示例五金制品有限公司'],
  ['广瑞祥', '示例'],
  ['诚昌', '宏昌'],
  ['更合', '恒合'],
  ['TCL', '天驰'],
  ['奥普', '奥达'],
  ['德建', '德力'],
  ['爱美泰', '爱美特'],
  ['澄一', '诚毅'],
  ['汇上承', '汇成'],
  ['莱伦', '莱伦'],
  ['基龙', '基隆'],
  ['开利', '凯利'],
  ['阿博斯', '博斯'],
  ['派特', '派特'],
];

const files = [
  path.join(__dirname, '..', 'web', 'index.html'),
  path.join(__dirname, '..', 'README.md'),
];

let total = 0;
for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  const before = s;
  for (const [from, to] of MAP) {
    if (from === to) continue;
    const n = s.split(from).length - 1;
    if (n) { total += n; s = s.split(from).join(to); }
  }
  if (s !== before) {
    fs.writeFileSync(f, s, 'utf8');
    console.log('已替换: ' + path.basename(f));
  } else {
    console.log('未变化: ' + path.basename(f));
  }
}
console.log('共 ' + total + ' 处');
