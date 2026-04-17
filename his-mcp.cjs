/**
 * HIS MCP Server - 支持 MCP 协议的 HIS 服务
 * 端口: 3100 (原 MCP 端口)
 * 协议: JSON-RPC 2.0 (MCP 标准)
 */

const http = require('http');
const https = require('https');
const fs = require('fs');

// HIS Layer (完整六层架构)
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
      return { status: this.cb.tripped ? 'circuit_breaker' : 'healthy', uptime: Math.floor(uptime), cb: this.cb.tripped, errors: this.health.errorCount };
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
      const dangerous = ['rm -rf', 'DROP TABLE', 'DELETE FROM', 'format c:', 'drop database'];
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
      if (l3 && l3.violated) { r.status = 'security_violation'; r.issues.push('L3'); }
      this.audits.push(r);
      if (this.audits.length > 100) this.audits.shift();
      return r;
    },
    blindspot: function(q, reason) {
      this.blindspots.push({ q, reason, ts: Date.now() });
      return { marked: true };
    },
    getBlindspots: function() { return this.blindspots.slice(-20); }
  },

  L3: {
    rules: [
      { p: 'rm -rf', s: 'critical' },
      { p: 'DROP DATABASE', s: 'critical' },
      { p: 'DROP TABLE', s: 'critical' },
      { p: 'DELETE FROM', s: 'high' },
      { p: 'format c:', s: 'critical' }
    ],
    align: function(plan, goal) {
      const kw = goal.toLowerCase().split(' ').filter(k => k.length > 2);
      let score = 0;
      const ps = JSON.stringify(plan).toLowerCase();
      for (const k of kw) if (ps.includes(k)) score++;
      return { score: score / kw.length, aligned: score / kw.length > 0.3 };
    },
    risk: function(plan) {
      const ps = JSON.stringify(plan).toLowerCase();
      let level = 'low', risks = [];
      for (const r of this.rules) if (ps.includes(r.p)) { risks.push(r.p); if (r.s === 'critical') level = 'critical'; else if (r.s === 'high' && level !== 'critical') level = 'high'; }
      return { level, risks, approved: level !== 'critical' };
    }
  },

  L2: {
    understand: function(q) {
      const qq = q.toLowerCase();
      return {
        action: qq.includes('create') ? 'create' : qq.includes('run') || qq.includes('execute') ? 'execute' : qq.includes('get') || qq.includes('read') ? 'read' : qq.includes('delete') || qq.includes('remove') ? 'delete' : 'unknown',
        target: qq.includes('file') ? 'file' : qq.includes('code') ? 'code' : qq.includes('vm') || qq.includes('server') ? 'server' : 'unknown',
        confidence: 0.85
      };
    },
    predict: function(s) {
      return { current: s, next: s.status === 'running' ? { status: 'running' } : {}, conf: s.status === 'running' ? 0.9 : 0.5 };
    },
    genPlan: function(g) {
      const i = this.understand(g);
      return [{ type: i.action, target: i.target, method: i.action === 'create' ? 'auto_code' : 'exec', layer: 'L2' }];
    }
  },

  L1: {
    prove: function(s) {
      const ss = String(s).toLowerCase();
      return { result: /^[=+\-0-9().\s]+$/.test(ss) ? 'computable' : 'undecidable', input: s };
    },
    compute: function(e) {
      try {
        return /^[\d+\-*/().\s]+$/.test(e) ? { result: eval(e), safe: true } : { error: 'unsafe expression', safe: false };
      } catch(x) { return { error: x.message, safe: false }; }
    },
    consistency: function(stmts) {
      let cons = true, contr = [];
      for (let i = 0; i < stmts.length; i++) for (let j = i + 1; j < stmts.length; j++) {
        const s1 = String(stmts[i]).toLowerCase(), s2 = String(stmts[j]).toLowerCase();
        if ((s1.includes('true') && s2.includes('false')) || (s1.includes('success') && s2.includes('fail'))) { cons = false; contr.push([stmts[i], stmts[j]]); }
      }
      return { consistent: cons, contradictions: contr, count: contr.length };
    }
  },

  L0: {
    mem: [],
    perceive: function(i) {
      this.mem.push({ i, ts: Date.now() });
      if (this.mem.length > 50) this.mem.shift();
      return { input: i, ts: Date.now(), memory_size: this.mem.length };
    },
    readMem: function() { return this.mem; },
    writeMem: function(f) {
      this.mem.push({ f, ts: Date.now() });
      if (this.mem.length > 20) this.mem.shift();
      return { stored: true, memory_size: this.mem.length };
    }
  }
};

// HIS 工具映射 (MCP 工具名 → HIS 函数)
const hisTools = {
  // L5 稳态控制层
  his_health: { layer: 'L5', fn: () => HIS.L5.check() },
  his_veto: { layer: 'L5', fn: (args) => HIS.L5.veto(args.output || {}) },
  his_circuit_breaker: { layer: 'L5', fn: (args) => { if (args.action === 'reset') { HIS.L5.cb.tripped = false; HIS.L5.cb.failures = 0; } return { tripped: HIS.L5.cb.tripped, failures: HIS.L5.cb.failures, threshold: HIS.L5.cb.threshold }; }},

  // L4 元认知监督层
  his_audit: { layer: 'L4', fn: (args) => HIS.L4.audit(args.l1 || {}, args.l2 || {}, args.l3 || {}) },
  his_blindspot: { layer: 'L4', fn: (args) => HIS.L4.blindspot(args.query, args.reason) },
  his_get_blindspots: { layer: 'L4', fn: () => ({ blindspots: HIS.L4.getBlindspots() }) },

  // L3 价值与安全层
  his_align: { layer: 'L3', fn: (args) => HIS.L3.align(args.plan || {}, args.goal || '') },
  his_risk_assess: { layer: 'L3', fn: (args) => HIS.L3.risk(args.plan || {}) },

  // L2 世界模型层
  his_understand: { layer: 'L2', fn: (args) => HIS.L2.understand(args.query || '') },
  his_predict: { layer: 'L2', fn: (args) => HIS.L2.predict(args.state || {}) },
  his_generate_plan: { layer: 'L2', fn: (args) => ({ plans: HIS.L2.genPlan(args.goal || '') }) },

  // L1 符号推理层
  his_prove: { layer: 'L1', fn: (args) => HIS.L1.prove(args.statement || '') },
  his_compute: { layer: 'L1', fn: (args) => HIS.L1.compute(args.expr || '') },
  his_check_consistency: { layer: 'L1', fn: (args) => HIS.L1.consistency(args.statements || []) },

  // L0 感知执行层
  his_perceive: { layer: 'L0', fn: (args) => HIS.L0.perceive(args.input || '') },
  his_read_memory: { layer: 'L0', fn: () => ({ memory: HIS.L0.readMem(), count: HIS.L0.readMem().length }) },
  his_write_memory: { layer: 'L0', fn: (args) => HIS.L0.writeMem(args.fact || '') },

  // HIS 整体状态
  his_status: { layer: 'ALL', fn: () => {
    const l5health = HIS.L5.check();
    return {
      protocol: 'mcp',
      version: '1.0',
      layers: {
        L0: { name: '感知执行层', memory: HIS.L0.readMem().length },
        L1: { name: '符号推理层', status: 'active' },
        L2: { name: '世界模型层', status: 'active' },
        L3: { name: '价值与安全层', rules: HIS.L3.rules.length },
        L4: { name: '元认知监督层', audits: HIS.L4.audits.length, blindspots: HIS.L4.blindspots.length },
        L5: { name: '稳态控制层', health: l5health }
      },
      total_tools: Object.keys(hisTools).length,
      timestamp: Date.now()
    };
  }}
};

// MCP 协议实现
const mcpHandlers = {
  // Initialize (MCP 标准握手)
  initialize: function(params, id) {
    return {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: { listChanged: true },
        resources: { subscribe: true, listChanged: true },
        prompts: { listChanged: true }
      },
      serverInfo: {
        name: 'claw2ee-his-mcp',
        version: '1.0.0',
        description: 'Claw2EE HIS (Hierarchical Incomplete Supervision) MCP Server'
      }
    };
  },

  // tools/list - 列出所有 HIS 工具
  'tools/list': function(params, id) {
    const tools = Object.entries(hisTools).map(([name, tool]) => ({
      name: 'his_' + name.replace(/^his_/, ''),
      description: `[${tool.layer}] ` + getToolDescription(name),
      inputSchema: getToolInputSchema(name)
    }));
    return { tools };
  },

  // tools/call - 调用 HIS 工具
  'tools/call': function(params, id) {
    const toolName = params.name;
    const args = params.arguments || {};
    
    if (!hisTools[toolName]) {
      throw new Error('Tool not found: ' + toolName);
    }
    
    try {
      const result = hisTools[toolName].fn(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      throw new Error('Tool execution error: ' + e.message);
    }
  },

  // resources/list - 列出可用资源
  'resources/list': function(params, id) {
    return {
      resources: [
        { uri: 'his://status', name: 'HIS Status', description: 'Current HIS architecture status', mimeType: 'application/json' },
        { uri: 'his://layers', name: 'HIS Layers', description: 'Six-layer architecture info', mimeType: 'application/json' },
        { uri: 'his://memory', name: 'HIS Memory', description: 'L0 perception memory', mimeType: 'application/json' },
        { uri: 'his://audits', name: 'HIS Audits', description: 'L4 audit history', mimeType: 'application/json' }
      ]
    };
  },

  // resources/read - 读取资源
  'resources/read': function(params, id) {
    const uri = params.uri;
    let content = '';
    
    if (uri === 'his://status') content = JSON.stringify(hisTools.his_status.fn(), null, 2);
    else if (uri === 'his://layers') content = JSON.stringify({ L0: '感知执行层', L1: '符号推理层', L2: '世界模型层', L3: '价值与安全层', L4: '元认知监督层', L5: '稳态控制层' }, null, 2);
    else if (uri === 'his://memory') content = JSON.stringify(HIS.L0.readMem(), null, 2);
    else if (uri === 'his://audits') content = JSON.stringify(HIS.L4.audits.slice(-10), null, 2);
    else throw new Error('Unknown resource: ' + uri);
    
    return { contents: [{ uri, mimeType: 'application/json', text: content }] };
  }
};

// 工具描述映射
function getToolDescription(name) {
  const desc = {
    his_health: '健康检查 - L5 稳态控制层',
    his_veto: '最高权限否决 - 检查输出是否包含危险操作',
    his_circuit_breaker: '熔断器控制 - 获取/重置熔断器状态',
    his_audit: '跨层一致性审计 - 检测 L1-L2 矛盾',
    his_blindspot: '标记盲区 - 记录未知领域',
    his_get_blindspots: '获取盲区列表',
    his_align: '目标对齐检查 - 评估计划与目标一致性',
    his_risk_assess: '风险评估 - L3 安全层风险检测',
    his_understand: '语义理解 - 提取意图和目标',
    his_predict: '状态预测 - 基于当前状态预测下一步',
    his_generate_plan: '生成候选方案 - 从目标生成执行计划',
    his_prove: '逻辑证明 - 判断命题可证明性',
    his_compute: '数学计算 - 安全表达式计算',
    his_check_consistency: '一致性检查 - 检测语句矛盾',
    his_perceive: '感知输入 - L0 感知层',
    his_read_memory: '读取短期记忆',
    his_write_memory: '写入短期记忆',
    his_status: 'HIS 整体状态 - 六层架构概览'
  };
  return desc[name] || 'HIS Tool';
}

function getToolInputSchema(name) {
  const schemas = {
    his_veto: { type: 'object', properties: { output: { type: 'string' } } },
    his_circuit_breaker: { type: 'object', properties: { action: { type: 'string', enum: ['status', 'reset'] } } },
    his_audit: { type: 'object', properties: { l1: { type: 'object' }, l2: { type: 'object' }, l3: { type: 'object' } } },
    his_blindspot: { type: 'object', properties: { query: { type: 'string' }, reason: { type: 'string' } }, required: ['query'] },
    his_align: { type: 'object', properties: { plan: { type: 'object' }, goal: { type: 'string' } }, required: ['goal'] },
    his_risk_assess: { type: 'object', properties: { plan: { type: 'object' } }, required: ['plan'] },
    his_understand: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    his_predict: { type: 'object', properties: { state: { type: 'object' } }, required: ['state'] },
    his_generate_plan: { type: 'object', properties: { goal: { type: 'string' } }, required: ['goal'] },
    his_prove: { type: 'object', properties: { statement: { type: 'string' } }, required: ['statement'] },
    his_compute: { type: 'object', properties: { expr: { type: 'string' } }, required: ['expr'] },
    his_check_consistency: { type: 'object', properties: { statements: { type: 'array', items: { type: 'string' } } }, required: ['statements'] },
    his_perceive: { type: 'object', properties: { input: { type: 'string' } }, required: ['input'] },
    his_write_memory: { type: 'object', properties: { fact: { type: 'string' } }, required: ['fact'] }
  };
  return schemas[name] || { type: 'object' };
}

// MCP JSON-RPC 请求处理
function handleMCPRequest(body, res) {
  const response = { jsonrpc: '2.0', id: body.id };
  
  try {
    const method = body.method;
    const params = body.params || {};
    
    if (mcpHandlers[method]) {
      response.result = mcpHandlers[method](params, body.id);
    } else {
      response.error = { code: -32601, message: 'Method not found: ' + method };
    }
  } catch (e) {
    response.error = { code: -32603, message: e.message };
  }
  
  res.setHeader('Content-Type', 'application/json');
  res.writeHead(200);
  res.end(JSON.stringify(response));
}

// HTTP Server
const PORT = 3100;

const server = http.createServer(function(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  // Health check
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'healthy', service: 'his-mcp', version: '1.0.0', port: PORT }));
    return;
  }
  
  // MCP JSON-RPC
  if (req.method === 'POST' && req.url === '/mcp') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const json = JSON.parse(body);
        if (json.method === 'initialize') {
          // 特殊处理 initialize - 返回 JSON-RPC response
          handleMCPRequest(json, res);
        } else if (json.method === 'tools/call') {
          handleMCPRequest(json, res);
        } else {
          handleMCPRequest(json, res);
        }
      } catch (e) {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(400);
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' } }));
      }
    });
    return;
  }
  
  // MCP SSE (可选)
  if (req.method === 'GET' && req.url === '/events') {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write('event: his/status\ndata: ' + JSON.stringify({ timestamp: Date.now() }) + '\n\n');
    return;
  }
  
  // Not found
  res.setHeader('Content-Type', 'application/json');
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found', url: req.url }));
});

server.listen(PORT, function() {
  console.log('==================================================');
  console.log('HIS MCP Server - Claw2EE');
  console.log('  Port: ' + PORT);
  console.log('  Protocol: JSON-RPC 2.0 (MCP)');
  console.log('  Endpoint: http://localhost:' + PORT + '/mcp');
  console.log('==================================================');
  console.log('Tools: ' + Object.keys(hisTools).length);
  console.log('Layers: L0 L1 L2 L3 L4 L5');
  console.log('==================================================');
});
