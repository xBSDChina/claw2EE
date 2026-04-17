/**
 * HIS API Sidecar - 独立的 HIS 功能服务
 * 运行在端口 3001，提供 HIS 层功能
 */

const http = require('http');
const https = require('https');

// HIS Layer
const HIS = {
  L5: {
    health: { status: 'healthy', startTime: Date.now(), errorCount: 0 },
    cb: { threshold: 5, timeout: 60000, failures: 0, lastFailure: 0, tripped: false },
    check: function() {
      const uptime = (Date.now() - this.health.startTime) / 1000;
      if (this.cb.tripped && Date.now() - this.cb.lastFailure > this.cb.timeout) {
        this.cb.tripped = false;
        this.cb.failures = 0;
      }
      return { status: this.cb.tripped ? 'circuit_breaker' : 'healthy', uptime: uptime, cb: this.cb.tripped, errors: this.health.errorCount };
    },
    error: function(msg) {
      this.health.errorCount++;
      this.cb.failures++;
      this.cb.lastFailure = Date.now();
      if (this.cb.failures >= this.cb.threshold) this.cb.tripped = true;
    },
    success: function() {
      this.cb.failures = Math.max(0, this.cb.failures - 1);
    },
    veto: function(out) {
      const dangerous = ['rm -rf', 'DROP TABLE', 'DELETE FROM', 'format c:'];
      const s = JSON.stringify(out).toLowerCase();
      for (const p of dangerous) if (s.includes(p)) return { vetoed: true, reason: p };
      return this.cb.tripped ? { vetoed: true, reason: 'cb_tripped' } : { vetoed: false };
    }
  },

  L4: {
    audits: [], blindspots: [],
    audit: function(l1, l2, l3) {
      const r = { ts: Date.now(), status: 'consistent', issues: [] };
      if (l1.claim && l2.claim && String(l1.claim).includes('true') && String(l2.claim).includes('false')) {
        r.status = 'contradiction';
        r.issues.push('L1-L2');
      }
      if (l3.violated) { r.status = 'security_violation'; r.issues.push('L3'); }
      this.audits.push(r);
      if (this.audits.length > 100) this.audits.shift();
      return r;
    },
    blindspot: function(q, reason) {
      this.blindspots.push({ q, reason, ts: Date.now() });
      return { marked: true };
    },
    getBlindspots: function() { return this.blindspots; }
  },

  L3: {
    rules: [{ p: 'rm -rf', s: 'critical' }, { p: 'DROP DATABASE', s: 'critical' }],
    align: function(plan, goal) {
      const kw = goal.toLowerCase().split(' ');
      let score = 0;
      const ps = JSON.stringify(plan).toLowerCase();
      for (const k of kw) if (ps.includes(k) && k.length > 2) score++;
      return { score: score / kw.length, aligned: score / kw.length > 0.3 };
    },
    risk: function(plan) {
      const ps = JSON.stringify(plan).toLowerCase();
      let level = 'low', risks = [];
      for (const r of this.rules) if (ps.includes(r.p)) { risks.push(r.p); if (r.s === 'critical') level = 'critical'; }
      return { level: level, risks: risks, approved: level !== 'critical' };
    }
  },

  L2: {
    understand: function(q) {
      const qq = q.toLowerCase();
      return {
        action: qq.includes('create') ? 'create' : qq.includes('run') ? 'execute' : qq.includes('get') ? 'read' : 'unknown',
        target: qq.includes('file') ? 'file' : qq.includes('code') ? 'code' : 'unknown'
      };
    },
    predict: function(s) {
      return { current: s, next: s.status === 'running' ? { status: 'running' } : {}, conf: s.status === 'running' ? 0.9 : 0.5 };
    },
    genPlan: function(g) {
      const i = this.understand(g);
      return [{ type: i.action, target: i.target, method: i.action === 'create' ? 'auto_code' : 'exec' }];
    }
  },

  L1: {
    prove: function(s) {
      const ss = String(s).toLowerCase();
      return { result: ss.match(/[=+\-]/) ? 'computable' : 'undecidable' };
    },
    compute: function(e) {
      try {
        return /^[\d+\-*/().]+$/.test(e) ? { result: eval(e) } : { error: 'unsafe' };
      } catch(x) {
        return { error: x.message };
      }
    },
    consistency: function(stmts) {
      let cons = true, contr = [];
      for (let i = 0; i < stmts.length; i++) for (let j = i + 1; j < stmts.length; j++) {
        const s1 = String(stmts[i]).toLowerCase(), s2 = String(stmts[j]).toLowerCase();
        if ((s1.includes('true') && s2.includes('false')) || (s1.includes('success') && s2.includes('fail'))) {
          cons = false;
          contr.push([stmts[i], stmts[j]]);
        }
      }
      return { consistent: cons, contradictions: contr };
    }
  },

  L0: {
    mem: [],
    perceive: function(i) {
      this.mem.push({ i, ts: Date.now() });
      if (this.mem.length > 50) this.mem.shift();
      return { input: i, ts: Date.now() };
    },
    readMem: function() { return this.mem; },
    writeMem: function(f) {
      this.mem.push({ f, ts: Date.now() });
      if (this.mem.length > 20) this.mem.shift();
    }
  }
};

// HIS API Handlers
const handlers = {
  // L5
  '/api/his/health': function(args) { return HIS.L5.check(); },
  '/api/his/veto': function(args) { return HIS.L5.veto(args.output || {}); },
  '/api/his/circuit_breaker': function(args) {
    if (args.action === 'reset') { HIS.L5.cb.tripped = false; HIS.L5.cb.failures = 0; }
    return { tripped: HIS.L5.cb.tripped, failures: HIS.L5.cb.failures };
  },

  // L4
  '/api/his/audit': function(args) { return HIS.L4.audit(args.l1 || {}, args.l2 || {}, args.l3 || {}); },
  '/api/his/blindspot': function(args) { HIS.L4.blindspot(args.query, args.reason); return { marked: true }; },
  '/api/his/blindspots': function(args) { return { blindspots: HIS.L4.getBlindspots() }; },

  // L3
  '/api/his/align': function(args) { return HIS.L3.align(args.plan || {}, args.goal || ''); },
  '/api/his/risk_assess': function(args) { return HIS.L3.risk(args.plan || {}); },

  // L2
  '/api/his/understand': function(args) { return HIS.L2.understand(args.query || ''); },
  '/api/his/predict': function(args) { return HIS.L2.predict(args.state || {}); },
  '/api/his/generate_plan': function(args) { return { plans: HIS.L2.genPlan(args.goal || '') }; },

  // L1
  '/api/his/prove': function(args) { return HIS.L1.prove(args.statement || ''); },
  '/api/his/compute': function(args) { return HIS.L1.compute(args.expr || ''); },
  '/api/his/check_consistency': function(args) { return HIS.L1.consistency(args.statements || []); },

  // L0
  '/api/his/perceive': function(args) { return HIS.L0.perceive(args.input || ''); },
  '/api/his/read_memory': function(args) { return { memory: HIS.L0.readMem(), count: HIS.L0.readMem().length }; },
  '/api/his/write_memory': function(args) { HIS.L0.writeMem(args.fact || ''); return { stored: true }; },

  // HIS Status
  '/api/his/status': function(args) {
    const l5health = HIS.L5.check();
    return {
      layers: {
        L0: { name: '感知执行层', memory: HIS.L0.readMem().length },
        L1: { name: '符号推理层', status: 'active' },
        L2: { name: '世界模型层', status: 'active' },
        L3: { name: '价值与安全层', rules: HIS.L3.rules.length },
        L4: { name: '元认知监督层', audits: HIS.L4.audits.length, blindspots: HIS.L4.blindspots.length },
        L5: { name: '稳态控制层', health: l5health }
      },
      total_tools: 17,
      timestamp: Date.now()
    };
  }
};

// HTTP Server
const PORT = 3001;

const server = http.createServer(function(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url.split('?')[0];

  if (req.method === 'GET' && url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'healthy', service: 'his-sidecar', port: PORT }));
    return;
  }

  if (req.method === 'POST' && handlers[url]) {
    let body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() {
      try {
        const args = JSON.parse(body || '{}');
        const result = handlers[url](args);
        res.writeHead(200);
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // List available HIS endpoints
  if (req.method === 'GET' && url === '/api/his') {
    res.writeHead(200);
    res.end(JSON.stringify({
      service: 'HIS Sidecar',
      version: '1.0',
      endpoints: Object.keys(handlers).map(function(k) {
        return { path: k, method: 'POST' };
      }),
      layers: ['L0', 'L1', 'L2', 'L3', 'L4', 'L5']
    }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, function() {
  console.log('==================================================');
  console.log('HIS API Sidecar');
  console.log('  HTTP: http://localhost:' + PORT);
  console.log('  Endpoints: ' + Object.keys(handlers).length);
  console.log('  L0: 感知执行层');
  console.log('  L1: 符号推理层');
  console.log('  L2: 世界模型层');
  console.log('  L3: 价值与安全层');
  console.log('  L4: 元认知监督层');
  console.log('  L5: 稳态控制层');
  console.log('==================================================');
});
