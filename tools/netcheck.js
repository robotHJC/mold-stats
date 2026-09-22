/*
 * 用 check-host.net 的【国内节点】测一批静态托管站点在中国大陆能不能直接访问。
 * 注意：本机可能在 VPN 上，但测试节点在国内，所以结果反映的是「没 VPN 的人能不能打开」。
 *
 *   node tools/netcheck.js
 */
'use strict';

const TARGETS = [
  ['github.io（现有）', 'https://robothjc.github.io/naming-system/'],
  ['gitee.com',         'https://gitee.com'],
  ['cloudflare pages',  'https://pages.dev'],
  ['vercel',            'https://vercel.com'],
  ['netlify',           'https://www.netlify.com'],
  ['firebase hosting',  'https://web.app'],
  ['阿里云 OSS',        'https://oss.aliyuncs.com'],
  ['腾讯云 COS',        'https://cos.ap-guangzhou.myqcloud.com'],
];

const NODES = ['cn1.node.check-host.net', 'cn2.node.check-host.net', 'cn3.node.check-host.net'];
const API = 'https://check-host.net';

async function submit(url) {
  const q = NODES.map((n) => 'node=' + n).join('&');
  const r = await fetch(`${API}/check-http?host=${encodeURIComponent(url)}&${q}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json();
  if (!j.request_id) throw new Error(JSON.stringify(j));
  return j.request_id;
}

async function result(id) {
  const r = await fetch(`${API}/check-result/${id}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  return r.json();
}

function describe(v) {
  if (v === null || v === undefined) return '超时/无响应';
  const item = Array.isArray(v) ? v[0] : v;
  if (item && item.error) return '错误:' + String(item.error).slice(0, 30);
  if (item && typeof item === 'object') {
    const ms = item.time != null ? Math.round(item.time * 1000) + 'ms' : '';
    return `${item.status || item.status_code || '?'} ${ms}`.trim();
  }
  return String(item).slice(0, 30);
}

(async () => {
  const ids = [];
  for (const [name, url] of TARGETS) {
    try {
      ids.push({ name, url, id: await submit(url) });
      console.log('已提交: ' + name);
    } catch (e) {
      ids.push({ name, url, err: String(e.message).slice(0, 60) });
      console.log('提交失败: ' + name + ' — ' + e.message);
    }
  }
  console.log('\n等国内节点出结果…\n');
  const lines = [];
  const pending = new Map(ids.filter((t) => !t.err).map((t) => [t.name, null]));
  let gathered = {};
  for (let round = 0; round < 4 && pending.size; round++) {
    await new Promise((r) => setTimeout(r, 8000));
    for (const t of ids) {
      if (t.err || gathered[t.name]) continue;
      try {
        const res = await result(t.id);
        const parts = Object.keys(res).map((n) => {
          const v = res[n];
          if (v == null) return null;
          const item = Array.isArray(v) ? v[0] : v;
          const label = n.replace('.node.check-host.net', '');
          if (item && item.error) return `${label}: ${String(item.error).slice(0, 24)}`;
          if (item && typeof item === 'object') {
            const ms = item.time != null ? Math.round(item.time * 1000) + 'ms' : '';
            return `${label}: ${item.status || item.status_code || '?'} ${ms}`.trim();
          }
          return `${label}: ${String(item).slice(0, 24)}`;
        }).filter(Boolean);
        /* 只有拿到非空结果才算数 */
        if (parts.length) { gathered[t.name] = parts.join('   '); pending.delete(t.name); }
      } catch (e) { /* 下一轮再试 */ }
    }
  }
  for (const t of ids) {
    lines.push(`${t.name.padEnd(18)} ${t.err ? '提交失败' : (gathered[t.name] || '超时（国内节点拿不到结果）')}`);
  }
  const fs = require('fs');
  const path = require('path');
  const out = path.join(__dirname, '_probe', 'netcheck.txt');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, lines.join('\n'), 'utf8');
  lines.forEach((l) => console.log(l));
  console.log('\n（看到 200 就说明国内直连能通；全部超时就说明需要 VPN）');
  console.log('报告: ' + out);
})();
