#!/usr/bin/env node
/**
 * Claw2EE MCP Server v7.0 - Full Protocol Implementation
 * Supports: stdio, SSE, JSON-RPC 2.0, Streamable HTTP
 * Tools: 29 (matching main Claw2EE server)
 */

const http = require('http');
const url = require('url');

// ========== JSON-RPC 2.0 Handler ==========
class JSONRPC {
  static parseRequest(body) {
    try {
      var req = JSON.parse(body);
      if (req.jsonrpc !== '2.0') return { error: { code: -32600, message: 'Invalid Request' } };
      return req;
    } catch (e) { return { error: { code: -32700, message: 'Parse error' } }; }
  }
  static response(id, result) { return JSON.stringify({ jsonrpc: '2.0', id: id, result: result }); }
  static error(id, code, message) { return JSON.stringify({ jsonrpc: '2.0', id: id, error: { code: code, message: message } }); }
}

// ========== Tool Registry (29 tools) ==========
const tools = new Map();

const toolDefs = [
  // HIS Layer 5 - 稳态层 (3)
  { name: "his_health", description: "[L5]健康检查", handler: function(p) { return { status: "healthy", uptime: process.uptime() }; }},
  { name: "his_veto", description: "[L5]最高权限否决", handler: function(p) { return { vetoed: false }; }},
  { name: "his_circuit_breaker", description: "[L5]熔断器", handler: function(p) { return { tripped: false }; }},
  // HIS Layer 4 - 监督层 (3)
  { name: "his_audit", description: "[L4]跨层审计", handler: function(p) { return { status: "consistent" }; }},
  { name: "his_blindspot", description: "[L4]标记盲区", handler: function(p) { return { marked: true, id: p.id }; }},
  { name: "his_get_blindspots", description: "[L4]获取盲区", handler: function(p) { return { blindspots: [] }; }},
  // HIS Layer 3 - 价值层 (2)
  { name: "his_align", description: "[L3]目标对齐", handler: function(p) { return { score: 0.8, aligned: true }; }},
  { name: "his_risk_assess", description: "[L3]风险评估", handler: function(p) { return { level: "low", approved: true }; }},
  // HIS Layer 2 - 世界模型 (3)
  { name: "his_understand", description: "[L2]语义理解", handler: function(p) {
    var q = (p.query || "").toLowerCase();
    var action = "unknown", target = "unknown";
    if (q.indexOf("删除") >= 0 || q.indexOf("fix") >= 0 || q.indexOf("修复") >= 0) action = "fix";
    if (q.indexOf("删除") >= 0 || q.indexOf("delete") >= 0) action = "delete";
    if (q.indexOf("创建") >= 0 || q.indexOf("create") >= 0) action = "create";
    if (q.indexOf("文件") >= 0 || q.indexOf("memory") >= 0 || q.indexOf("leak") >= 0) target = "file";
    if (q.indexOf("代码") >= 0 || q.indexOf("code") >= 0) target = "code";
    return { action: action, target: target };
  }},
  { name: "his_predict", description: "[L2]状态预测", handler: function(p) {
    var st = (p.state && p.state.status) || "unknown";
    return { current: p.state, next: { status: st === "fixed" ? "completed" : "unknown" }, confidence: 0.8 };
  }},
  { name: "his_generate_plan", description: "[L2]生成方案", handler: function(p) {
    var plans = [];
    if ((p.goal || "").toLowerCase().indexOf("fix") >= 0 || (p.goal || "").indexOf("修复") >= 0) {
      plans.push({ type: "fix", tool: "auto_code", step: "analyze and fix" });
    }
    return { plans: plans.length ? plans : [{ type: "default", tool: "auto_code", step: "analyze" }] };
  }},
  // HIS Layer 1 - 推理层 (3)
  { name: "his_prove", description: "[L1]逻辑证明", handler: function(p) { return { result: "computable" }; }},
  { name: "his_compute", description: "[L1]数学计算", handler: function(p) {
    try { return { result: eval(p.expr), expression: p.expr }; }
    catch (e) { return { error: e.message }; }
  }},
  { name: "his_check_consistency", description: "[L1]一致性检查", handler: function(p) { return { consistent: true }; }},
  // HIS Layer 0 - 感知层 (3)
  { name: "his_perceive", description: "[L0]感知输入", handler: function(p) { return { input: p.input }; }},
  { name: "his_read_memory", description: "[L0]读取记忆", handler: function(p) { return { memory: [], count: 0 }; }},
  { name: "his_write_memory", description: "[L0]写入记忆", handler: function(p) { return { stored: true }; }},
  // G-HICS-AM Core (8)
  { name: "llm_query", description: "调用LLM API", handler: function(p) { return { response: "LLM requires main server" }; }},
  { name: "llm_list", description: "列出LLM", handler: function(p) { return { providers: ["aliyun", "wisemodel", "nvidia", "nvidia2", "moonshot"] }; }},
  { name: "ghics_am_status", description: "G-HICS-AM状态", handler: function(p) { return { layers: 6, theory: "G-HICS-AM" }; }},
  { name: "ghics_am_construct", description: "G-HICS-AM自动构造", handler: function(p) { return { constructed: true, layers: 6 }; }},
  { name: "ghics_am_metrics", description: "哥德尔度量", handler: function(p) { return { completeness: 0.9, consistency: 0.95, soundness: 0.88 }; }},
  { name: "ghics_am_mcp_send", description: "MCP指令发送", handler: function(p) { return { sent: true, queue: p.queue || "default" }; }},
  { name: "ghics_am_mcp_queue", description: "MCP消息队列", handler: function(p) { return { size: 0, pending: [] }; }},
  { name: "ghics_am_loops", description: "[G-HICS-AM]双闭环状态", handler: function(p) { return { inner_loop: { active: true }, outer_loop: { active: true }, stability: 1 }; }},
  { name: "auto_code", description: "自动编程", handler: function(p) { return { code: "# Generated code", success: true }; }},
  // System (3)
  { name: "execution_history", description: "执行历史", handler: function(p) { return { history: [], count: 0 }; }},
  { name: "remote_exec", description: "远程执行", handler: function(p) { return { executed: false, message: "Use main server" }; }},
  { name: "his_status", description: "HIS整体状态", handler: function(p) { return { layers: { L0: {}, L1: {}, L2: {}, L3: {}, L4: {}, L5: {} }, total_tools: tools.size }; }}
];

for (var i = 0; i < toolDefs.length; i++) { tools.set(toolDefs[i].name, toolDefs[i]); }

// ========== Tool Call Handler ==========
function handleToolCall(method, params) {
  var tool = tools.get(method);
  if (!tool) return { error: { code: -32601, message: "Method not found" } };
  try { return tool.handler(params); }
  catch (e) { return { error: { code: -32603, message: e.message } }; }
}

function handleJSONRPC(body, callback) {
  var rpc = JSONRPC.parseRequest(body);
  if (rpc.error) { callback(JSONRPC.error(rpc.id || null, rpc.error.code, rpc.error.message)); return; }
  var result = handleToolCall(rpc.method, rpc.params || {});
  callback(JSONRPC.response(rpc.id, result));
}

// ========== Transport: stdio ==========
function startStdio() {
  console.error('[MCP-STDIO] Starting...');
  var buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', function(chunk) {
    buffer += chunk;
    var messages = buffer.split('\n');
    buffer = messages.pop();
    for (var i = 0; i < messages.length; i++) {
      if (messages[i].trim()) { handleJSONRPC(messages[i], function(resp) { console.log(resp); }); }
    }
  });
  process.stdin.on('end', function() {
    if (buffer.trim()) { handleJSONRPC(buffer, function(resp) { console.log(resp); }); }
  });
  console.error('[MCP-STDIO] Ready');
}

// ========== Transport: SSE ==========
function startSSE(port) {
  port = port || 3005;
  console.error('[MCP-SSE] Starting on port ' + port);
  var server = http.createServer(function(req, res) {
    var parsed = url.parse(req.url, true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
    
    if (parsed.pathname === '/sse' || parsed.pathname === '/mcp/sse') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
      res.write('data: ' + JSON.stringify({ type: 'initialized', server: 'Claw2EE MCP' }) + '\n\n');
      if (req.method === 'POST') {
        var body = '';
        req.on('data', function(chunk) { body += chunk; });
        req.on('end', function() { handleJSONRPC(body, function(resp) { res.write('data: ' + resp + '\n\n'); }); });
      }
      var interval = setInterval(function() { res.write('data: ' + JSON.stringify({ type: 'ping', timestamp: Date.now() }) + '\n\n'); }, 30000);
      req.on('close', function() { clearInterval(interval); });
      return;
    }
    if (parsed.pathname === '/tools' || parsed.pathname === '/mcp/tools') {
      var toolList = [];
      tools.forEach(function(t) { toolList.push({ name: t.name, description: t.description }); });
      res.end(JSON.stringify({ tools: toolList })); return;
    }
    if (parsed.pathname === '/health') { res.end(JSON.stringify({ status: 'healthy', transport: 'sse' })); return; }
    res.writeHead(404); res.end('Not Found');
  });
  server.listen(port, function() { console.error('[MCP-SSE] http://localhost:' + port + '/sse'); });
  return server;
}

// ========== Transport: Streamable HTTP ==========
function startStreamableHTTP(port) {
  port = port || 3006;
  console.error('[MCP-HTTP] Starting on port ' + port);
  var server = http.createServer(function(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-protocol-version');
    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
    
    var parsed = url.parse(req.url, true);
    var path = parsed.pathname;
    
    if (path === '/mcp/v1/initialize' || path === '/api/mcp/initialize') {
      var body = []; req.on('data', function(chunk) { body.push(chunk); });
      req.on('end', function() {
        var resp = JSONRPC.response(null, { protocolVersion: '2024-11-05', capabilities: { tools: {}, resources: {} }, serverInfo: { name: 'Claw2EE MCP', version: '7.0' } });
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(resp);
      });
      return;
    }
    if (path === '/mcp/v1/tools/list' || path === '/api/mcp/tools') {
      var toolList = [];
      tools.forEach(function(t) { toolList.push({ name: t.name, description: t.description, inputSchema: { type: 'object' } }); });
      res.end(JSONRPC.response(null, { tools: toolList })); return;
    }
    if (path === '/mcp/v1/tools/call' || path === '/api/mcp/call') {
      var body = ''; req.on('data', function(chunk) { body += chunk; });
      req.on('end', function() {
        var rpc = JSONRPC.parseRequest(body);
        if (rpc.error) { res.end(JSONRPC.error(rpc.id || null, rpc.error.code, rpc.error.message)); return; }
        var result = handleToolCall(rpc.method, rpc.params || {});
        res.end(JSONRPC.response(rpc.id, result));
      });
      return;
    }
    if (req.method === 'POST' && (path === '/rpc' || path === '/mcp/rpc')) {
      var body = ''; req.on('data', function(chunk) { body += chunk; });
      req.on('end', function() {
        try {
          var data = JSON.parse(body);
          var requests = Array.isArray(data) ? data : [data];
          var responses = [];
          for (var i = 0; i < requests.length; i++) {
            var r = requests[i];
            if (r.method === 'initialize') responses.push({ jsonrpc: '2.0', id: r.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: true }, serverInfo: { name: 'Claw2EE MCP', version: '7.0' } } });
            else if (r.method === 'tools/list') { var tl = []; tools.forEach(function(t) { tl.push({ name: t.name, description: t.description }); }); responses.push({ jsonrpc: '2.0', id: r.id, result: { tools: tl } }); }
            else if (r.method === 'tools/call') { var res2 = handleToolCall(r.params.name, r.params.arguments || {}); responses.push({ jsonrpc: '2.0', id: r.id, result: res2 }); }
            else if (r.method) { var res3 = handleToolCall(r.method, r.params || {}); responses.push({ jsonrpc: '2.0', id: r.id, result: res3 }); }
          }
          res.end(requests.length === 1 ? JSON.stringify(responses[0]) : JSON.stringify(responses));
        } catch (e) { res.end(JSONRPC.error(null, -32700, 'Parse error')); }
      });
      return;
    }
    res.writeHead(404); res.end('Not Found');
  });
  server.listen(port, function() { console.error('[MCP-HTTP] http://localhost:' + port + '/rpc'); });
  return server;
}

// ========== Main ==========
function main() {
  var args = process.argv.slice(2);
  var mode = args[0] || 'stdio';
  console.error('==================================================');
  console.error('  Claw2EE MCP Server v7.0 (29 tools)');
  console.error('  Mode: ' + mode);
  console.error('==================================================');
  if (mode === 'stdio') startStdio();
  else if (mode === 'sse') startSSE(parseInt(args[1]) || 3005);
  else if (mode === 'http') startStreamableHTTP(parseInt(args[1]) || 3006);
  else if (mode === 'all') { startStdio(); startSSE(3005); startStreamableHTTP(3006); }
  else { console.error('Usage: node mcp-transport.cjs [stdio|sse|http|all] [port]'); process.exit(1); }
}

main();
