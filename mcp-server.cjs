const http = require('http');
const url = require('url');
const { exec } = require('child_process');
const fs = require('fs');

var registry = { tools: new Map() };
registry.register = function(tool) { this.tools.set(tool.name, tool); };
registry.get = function(name) { return this.tools.get(name); };
registry.listTools = function() { return Array.from(this.tools.values()); };
registry.getToolCount = function() { return this.tools.size; };

var toolsExecutor = {
  read_file: function(args) {
    try { return { content: fs.readFileSync(args.path, 'utf8') }; }
    catch (e) { return { error: e.message }; }
  },
  write_file: function(args) {
    try { fs.writeFileSync(args.path, args.content); return { success: true }; }
    catch (e) { return { error: e.message }; }
  },
  exec_command: function(args) {
    return new Promise(function(resolve) {
      exec(args.command || 'echo ok', function(err, stdout, stderr) {
        resolve({ stdout: stdout, stderr: stderr, error: err ? err.message : null });
      });
    });
  },
  gateway_status: function(args) {
    return { status: 'running', uptime: process.uptime(), timestamp: new Date().toISOString() };
  },
  health_check: function(args) {
    return { status: 'healthy', timestamp: new Date().toISOString() };
  },
  ping: function(args) { return { pong: true, timestamp: Date.now() }; },
  sendAlert: function(args) { var msg = args.message || args.msg || "Alert"; var alertQueue = global.alertQueue || []; global.alertQueue = alertQueue; alertQueue.push({level: level, message: msg, ts: Date.now()}); if(alertQueue.length > 50) alertQueue.shift();; var level = args.level || "INFO"; console.log("[ALERT] " + level + ": " + msg); return { success: true, message: msg, level: level, timestamp: new Date().toISOString() }; }
};

// Register tools
var toolDefs = [
  { name: 'read_file', description: '读取文件', exec: toolsExecutor.read_file },
  { name: 'write_file', description: '写入文件', exec: toolsExecutor.write_file },
  { name: 'exec_command', description: '执行命令', exec: toolsExecutor.exec_command },
  { name: 'gateway_status', description: 'Gateway状态', exec: toolsExecutor.gateway_status },
  { name: 'health_check', description: '健康检查', exec: toolsExecutor.health_check },
  { name: 'ping', description: 'Ping', exec: toolsExecutor.ping },
  { name: 'sendAlert', description: '发送告警到OpenClaw', exec: toolsExecutor.sendAlert }
];

toolDefs.forEach(function(t) {
  registry.register({
    name: t.name,
    description: t.description,
    inputSchema: { type: 'object', properties: {} },
    exec: t.exec
  });
});

console.log('[MCP] Tools registered:', registry.getToolCount());

// Handle JSON-RPC
function handleJSONRPC(body, callback) {
  try {
    var req = JSON.parse(body);
    var id = req.id;
    var method = req.method;
    var params = req.params || {};
    
    if (req.jsonrpc !== '2.0') {
      return callback(null, JSON.stringify({ jsonrpc: '2.0', id: id, error: { code: -32600, message: 'Invalid Request' } }));
    }

    if (method === 'initialize') {
      return callback(null, JSON.stringify({ jsonrpc: '2.0', id: id, result: { protocolVersion: '2024-11-05', capabilities: { tools: true }, serverInfo: { name: 'Claw2EE MCP', version: '1.0.0' } } }));
    }

    if (method === "tools/list") {
      return callback(null, JSON.stringify({ jsonrpc: '2.0', id: id, result: { tools: registry.listTools().map(function(t) { return { name: t.name, description: t.description }; }) } }));
    }

    if (method === "tools/call") {
      var toolName = params.name;
      var toolArgs = params.arguments || {};
      var tool = registry.get(toolName);
      
      if (!tool) {
        return callback(null, JSON.stringify({ jsonrpc: '2.0', id: id, error: { code: -32601, message: 'Tool not found: ' + toolName } }));
      }

      var result = tool.exec(toolArgs);
      if (result && typeof result.then === 'function') {
        result.then(function(res) {
          callback(null, JSON.stringify({ jsonrpc: '2.0', id: id, result: { content: [{ type: 'text', text: JSON.stringify(res) }] } }));
        }).catch(function(err) {
          callback(null, JSON.stringify({ jsonrpc: '2.0', id: id, error: { code: -32603, message: err.message } }));
        });
      } else {
        callback(null, JSON.stringify({ jsonrpc: '2.0', id: id, result: { content: [{ type: 'text', text: JSON.stringify(result) }] } }));
      }
      return;
    }

    if (method === 'ping') {
      return callback(null, JSON.stringify({ jsonrpc: '2.0', id: id, result: { pong: true } }));
    }

    callback(null, JSON.stringify({ jsonrpc: '2.0', id: id, error: { code: -32601, message: 'Method not found: ' + method } }));
  } catch (e) {
    callback(null, JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
  }
}

var PORT = process.env.MCP_PORT || 3100;
var HOST = process.env.MCP_HOST || '0.0.0.0';

var server = http.createServer(function(req, res) {
  var parsedUrl = url.parse(req.url, true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  
  if (req.method === 'POST' && parsedUrl.pathname === '/mcp') {
    var body = '';
    req.on('data', function(c) { body += c; });
    req.on('end', function() {
      handleJSONRPC(body, function(err, response) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(response);
      });
    });
    return;
  }
  
  if (req.method === 'GET' && parsedUrl.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', tools: registry.getToolCount() }));
    return;
  }
  
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, HOST, function() { console.log('[MCP] http://' + HOST + ':' + PORT + '/mcp'); });
process.on('SIGINT', function() { server.close(); process.exit(0); });
