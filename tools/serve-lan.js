/*
 * 局域网小服务：在电脑上跑起来，手机连同一个 WiFi 就能打开。
 * 不需要装任何东西，Node 自带的 http 就够了。
 *
 *   node tools/serve-lan.js          # 默认 8080
 *   node tools/serve-lan.js 9000
 *
 * 手机浏览器访问下面打印出来的地址即可（要同一个 WiFi）。
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const port = Number(process.argv[2] || 8080);
const root = path.join(__dirname, '..', 'web');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('没有这个文件: ' + p); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  });
});

function lanAddresses() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const a of ifaces[name] || []) {
      if (a.family === 'IPv4' && !a.internal) out.push({ name, addr: a.address });
    }
  }
  return out;
}

server.listen(port, '0.0.0.0', () => {
  console.log('');
  console.log('  模具车间表格统计器 已启动');
  console.log('  ------------------------------------------');
  console.log('  电脑上打开:  http://localhost:' + port + '/');
  const lan = lanAddresses();
  if (lan.length) {
    console.log('');
    console.log('  手机上打开（要连同一个 WiFi）:');
    lan.forEach((x) => console.log('    http://' + x.addr + ':' + port + '/     [' + x.name + ']'));
  } else {
    console.log('  （没检测到局域网地址，确认电脑连了 WiFi 或网线）');
  }
  console.log('');
  console.log('  手机打开后：点「把 Excel 拖进来」那块 → 从「文件」或微信里选 xlsx。');
  console.log('  Ctrl+C 停止。');
  console.log('');
});
