/*
 * probe-sheets.js —— 体检一个 xlsx：列出每个 sheet 的规模与前若干行表头预览。
 *
 * 用法:  node tools/probe-sheets.js <file.xlsx> [预览行数,默认12]
 * 输出:  tools/_probe/<文件名>.txt   (UTF-8，避免控制台把中文压成乱码)
 *
 * 纯手写解析器，不依赖任何第三方库（本机只有 node，没有 npm install 的环境）。
 * 只做只读探查：读 sharedStrings / workbook.xml / workbook.xml.rels / worksheets。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const file = process.argv[2];
const PREVIEW_ROWS = Number(process.argv[3] || 12);
if (!file || !fs.existsSync(file)) {
  console.error('用法: node tools/probe-sheets.js <file.xlsx> [预览行数]');
  process.exit(1);
}

/* ---------- 1. 解压 ---------- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xlsxprobe-'));
const zip = path.join(tmp, 'book.zip');
fs.copyFileSync(file, zip);
execFileSync('powershell', [
  '-NoProfile', '-Command',
  `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${path.join(tmp, 'x')}' -Force`,
]);
const root = path.join(tmp, 'x');
const rd = (p) => fs.readFileSync(p, 'utf8');

/* ---------- 2. sharedStrings ---------- */
function readSharedStrings() {
  const p = path.join(root, 'xl', 'sharedStrings.xml');
  if (!fs.existsSync(p)) return [];
  const xml = rd(p);
  const out = [];
  // 每个 <si> 可能包含多个 <r><t> 富文本片段，拼接即可
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRe.exec(xml))) {
    const inner = m[1];
    let text = '';
    const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let t;
    while ((t = tRe.exec(inner))) text += t[1];
    out.push(decodeXml(text));
  }
  return out;
}

function decodeXml(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&amp;/g, '&');
}

/* ---------- 3. 列号 "BC12" -> 列索引 ---------- */
function colIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/* ---------- 4. sheet 名 -> 文件 ---------- */
const wb = rd(path.join(root, 'xl', 'workbook.xml'));
const rels = rd(path.join(root, 'xl', '_rels', 'workbook.xml.rels'));
const relMap = {};
for (const m of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
  relMap[m[1]] = m[2].replace(/^\/?xl\//, '');
}
const sheets = [];
for (const m of wb.matchAll(/<sheet\b[^>]*\/>/g)) {
  const tag = m[0];
  const name = decodeXml((tag.match(/name="([^"]*)"/) || [])[1] || '?');
  const rid = (tag.match(/r:id="([^"]*)"/) || [])[1];
  const hidden = /state="hidden"/.test(tag);
  sheets.push({ name, target: relMap[rid], hidden });
}

/* ---------- 5. 逐 sheet 解析前 N 行 ---------- */
function parseSheet(filePath) {
  const xml = rd(filePath);
  const dim = (xml.match(/<dimension ref="([^"]+)"/) || [])[1] || '?';
  // 行号 -> {col: value}
  const rows = new Map();
  const maxRow = PREVIEW_ROWS;
  const rowRe = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const r = +rm[1];
    if (r > maxRow) continue;
    const cells = {};
    const cRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm;
    while ((cm = cRe.exec(rm[2]))) {
      const attrs = cm[1];
      const body = cm[2] || '';
      const ref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1];
      if (!ref) continue;
      const type = (attrs.match(/t="([^"]+)"/) || [])[1];
      let v = '';
      if (type === 'inlineStr') {
        const t = body.match(/<t[^>]*>([\s\S]*?)<\/t>/);
        v = t ? decodeXml(t[1]) : '';
      } else {
        const vm = body.match(/<v>([\s\S]*?)<\/v>/);
        if (vm) {
          if (type === 's') v = shared[vm[1]] ?? '';
          else if (type === 'str') v = decodeXml(vm[1]);
          else v = vm[1];
        }
      }
      if (v !== '') cells[colIndex(ref)] = String(v).replace(/\s+/g, ' ').trim();
    }
    if (Object.keys(cells).length) rows.set(r, cells);
  }
  return { dim, rows };
}

const shared = readSharedStrings();
const lines = [];
lines.push(`文件: ${path.basename(file)}`);
lines.push(`大小: ${(fs.statSync(file).size / 1048576).toFixed(1)} MB`);
lines.push(`sheet 数: ${sheets.length}`);
lines.push('');

for (let i = 0; i < sheets.length; i++) {
  const s = sheets[i];
  const f = path.join(root, 'xl', s.target);
  if (!fs.existsSync(f)) { lines.push(`[${i + 1}] ${s.name}  <文件缺失: ${s.target}>`); continue; }
  const { dim, rows } = parseSheet(f);
  const sizeKB = (fs.statSync(f).size / 1024).toFixed(0);
  lines.push(`[${i + 1}] ${s.name}${s.hidden ? '  (隐藏)' : ''}`);
  lines.push(`    维度: ${dim}   XML: ${sizeKB} KB`);
  for (const r of [...rows.keys()].sort((a, b) => a - b)) {
    const cells = rows.get(r);
    const cols = Object.keys(cells).map(Number).sort((a, b) => a - b);
    const cellsText = cols.map((c) => cells[c]).join(' | ');
    if (!cellsText.trim()) continue;
    lines.push(`    r${String(r).padStart(2)}: ${cellsText.slice(0, 240)}`);
  }
  lines.push('');
}

const outDir = path.join(__dirname, '..', 'tools', '_probe');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, path.basename(file) + '.txt');
fs.writeFileSync(outFile, lines.join('\n'), 'utf8');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`已写出: ${outFile}`);
console.log(`sheet 数: ${sheets.length}, 总行数(预览): ${lines.length}`);
