const https = require('https');

function httpReq(url, method, headers, data, cb) {
  const u = new URL(url);
  const opt = {
    hostname: u.hostname,
    port: u.port || 443,
    path: u.pathname + u.search,
    method: method,
    headers: headers
  };

  const req = https.request(opt, (res) => {
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => { cb(null, res.statusCode, body); });
  });

  req.on('error', cb);

  const timeout = setTimeout(() => {
    req.destroy();
    cb(new Error('timeout'));
  }, 120000);

  req.on('close', () => clearTimeout(timeout));

  if (data) req.write(data);
  req.end();
}

module.exports = httpReq;
