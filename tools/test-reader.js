/*
 * 从 web/index.html 里抽出「xlsx 读取器」那一段纯函数，在 Node 里拿真实文件跑一遍。
 * 这样不必靠浏览器 debug —— 读文件这件事本身是纯计算，Node 足够。
 *
 * 用法: node tools/test-reader.js "path\to\file.xlsx"
 */
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'web', 'index.html'), 'utf8');
const m = html.match(/\/\* ==== XLSX-READER-START ==== \*\/([\s\S]*?)\/\* ==== XLSX-READER-END ==== \*\//);
if (!m) { console.error('没找到读取器代码块（XLSX-READER-START/END 标记）'); process.exit(1); }

/* pad2 在读取器外面，这里补一个 */
const pad2 = (n) => (n < 10 ? '0' : '') + n;
const factory = new Function('pad2', m[1] + `
  return { unzip, sharedStrings, colIdx, serialToDate, dateStyles, parseSheet,
           fillMerges, detectHeader, isMarkerRow, classify, baseOf,
           buildDerived, buildTable, isDateish, isNumish, unesc, avgNum };`);
const R = factory(pad2);

const file = process.argv[2];
if (!file || !fs.existsSync(file)) { console.error('用法: node tools/test-reader.js <file.xlsx>'); process.exit(1); }

(async () => {
  const t0 = Date.now();
  const buf = fs.readFileSync(file);
  const zip = await R.unzip(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  console.log(`ZIP 条目 ${zip.names.length} 个   ${Date.now() - t0}ms`);

  const sharedXml = await zip.text('xl/sharedStrings.xml');
  const t1 = Date.now();
  const shared = R.sharedStrings(sharedXml);
  console.log(`共享字符串 ${shared.length} 条   ${Date.now() - t1}ms`);

  const stylesXml = await zip.text('xl/styles.xml');
  const dstyles = R.dateStyles(stylesXml);
  console.log(`日期样式 ${Object.keys(dstyles).length} 种`);

  const wb = await zip.text('xl/workbook.xml');
  const rels = await zip.text('xl/_rels/workbook.xml.rels');
  const relMap = {};
  for (const x of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g))
    relMap[x[1]] = x[2].replace(/^\/?xl\//, '');
  const sheets = [];
  for (const x of wb.matchAll(/<sheet\b[^>]*\/>/g)) {
    sheets.push({
      name: R.unesc((x[0].match(/name="([^"]*)"/) || [])[1] || '?'),
      target: relMap[(x[0].match(/r:id="([^"]*)"/) || [])[1]],
    });
  }
  console.log(`sheet 共 ${sheets.length} 个\n`);

  const outLines = [];
  for (const s of sheets) {
    if (!s.target) { outLines.push(`[${s.name}] 无 target`); continue; }
    const t = Date.now();
    const xml = await zip.text('xl/' + s.target);
    if (!xml) { outLines.push(`[${s.name}] 读取失败`); continue; }
    const parsed = R.parseSheet(xml, shared, dstyles);
    const tbl = R.buildTable(parsed, s.name);
    const ms = Date.now() - t;
    if (!tbl) { outLines.push(`[${s.name}] 跳过（行数不足）`); continue; }
    outLines.push(
      `[${s.name}]  ${tbl.rows.length} 行 × ${tbl.cols.length} 列  header=r${tbl.headerRow}` +
      (tbl.markerRow ? ` marker=r${tbl.markerRow}` : '') +
      `  合并=${parsed.merges.length}  ${ms}ms`);
    outLines.push(`    dims:      ${tbl.dims.map(d => d.k + '(' + d.card + ')').join(', ') || '—'}`);
    outLines.push(`    timeCols:  ${tbl.timeCols.map(d => d.k + '[' + d.t + ']').join(', ') || '—'}`);
    outLines.push(`    metrics:   ${tbl.metricNames.join(', ') || '—'}`);
    outLines.push(`    sample:    ${tbl.cols.slice(0, 8).map(c => c.name + '=' + (tbl.rows[0][c.name] ?? '')).join(' | ')}`);
    outLines.push('');
  }
  fs.writeFileSync(path.join(__dirname, '_probe', 'reader-report.txt'), outLines.join('\n'), 'utf8');
  console.log('报告已写入 tools/_probe/reader-report.txt');
  console.log(`总耗时 ${Date.now() - t0}ms`);
})().catch(e => { console.error('失败:', e && e.stack || e); process.exit(1); });
