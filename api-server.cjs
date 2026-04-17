/**
 * Claw2EE REST API Server with Auth
 * Provides management API for the gateway with API Key authentication & rate limiting
 */

const http = require('http');
const url = require('url');
const { createAuthMiddleware } = require('./auth-middleware.cjs');

class ApiServer {
  constructor(gateway, options) {
    this.gateway = gateway;
    this.port = options.port || 3000;
    this.server = null;
    this.routes = new Map();
    this.publicPaths = ['/api/v1/status', '/api/v1/health', '/api/v1/tools'];
    
    // Initialize auth middleware
    this.auth = createAuthMiddleware({
      rateLimit: {
        maxTokens: options.maxTokens || 100,
        refillRate: options.refillRate || 10,
        blockDuration: options.blockDuration || 60000
      }
    });
    
    this._setupRoutes();
  }
  
  _setupRoutes() {
    // Status endpoints (no auth required)
    this.routes.set('GET /api/v1/status', this.handleStatus.bind(this));
    this.routes.set('GET /api/v1/health', this.handleHealth.bind(this));
    
    // Protected endpoints
    this.routes.set('GET /api/v1/stats', this.handleStats.bind(this));
    this.routes.set('GET /api/v1/endpoints', this.handleEndpoints.bind(this));
    this.routes.set('GET /api/v1/endpoints/:id', this.handleEndpointById.bind(this));
    this.routes.set('GET /api/v1/sessions', this.handleSessions.bind(this));
    this.routes.set('GET /api/v1/sessions/:id', this.handleSessionById.bind(this));
    this.routes.set('GET /api/v1/agents', this.handleAgents.bind(this));
    this.routes.set('GET /api/v1/agents/:id', this.handleAgentById.bind(this));
    this.routes.set('GET /api/v1/subagents', this.handleSubagents.bind(this));
    this.routes.set('GET /api/v1/subagents/:id', this.handleSubagentById.bind(this));
    this.routes.set('GET /api/v1/config', this.handleConfig.bind(this));
    
    // Auth management (admin only)
    this.routes.set('GET /api/v1/auth/keys', this.handleAuthKeys.bind(this));
    this.routes.set('POST /api/v1/auth/keys', this.handleCreateKey.bind(this));
    this.routes.set('DELETE /api/v1/auth/keys/:id', this.handleDeleteKey.bind(this));
    this.routes.set('GET /api/v1/auth/ratelimit/stats', this.handleRateLimitStats.bind(this));
    this.routes.set('GET /api/v1/auth/ratelimit/check', this.handleRateLimitCheck.bind(this));
    this.routes.set('GET /api/v1/auth/logs', this.handleRequestLogs.bind(this));
    this.routes.set('GET /api/v1/auth/logs/stats', this.handleLogStats.bind(this));
    
    // 404
    this.routes.set('GET /api/v1/tools', this.handleTools.bind(this));
    this.routes.set('GET /api/v1/tools/:tool', this.handleTools.bind(this));
    this.routes.set('POST /api/v1/tools/:tool', this.handleTools.bind(this));
    this.routes.set('NOT_FOUND', this.handleNotFound.bind(this));
  }
  
  _matchRoute(method, pathname) {
    const routeKey = method + ' ' + pathname;
    if (this.routes.has(routeKey)) {
      return { handler: this.routes.get(routeKey), params: {} };
    }
    
    const routes = Array.from(this.routes.keys()).filter(k => k !== 'NOT_FOUND');
    for (const route of routes) {
      const parts = route.split(' ');
      const routeMethod = parts[0];
      const routePath = parts.slice(1).join(' ');
      
      if (routeMethod !== method) continue;
      
      const routeParts = routePath.split('/');
      const pathParts = pathname.split('/');
      
      if (routeParts.length !== pathParts.length) continue;
      
      let match = true;
      const params = {};
      
      for (let i = 0; i < routeParts.length; i++) {
        if (routeParts[i].startsWith(':')) {
          params[routeParts[i].substring(1)] = pathParts[i];
        } else if (routeParts[i] !== pathParts[i]) {
          match = false;
          break;
        }
      }
      
      if (match) {
        return { handler: this.routes.get(route), params };
      }
    }
    
    return { handler: this.routes.get('NOT_FOUND'), params: {} };
  }
  
  _sendJson(res, statusCode, data, extraHeaders = {}) {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
      ...extraHeaders
    });
    res.end(JSON.stringify(data, null, 2));
  }
  
  async handleRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method;
    
    // Handle CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key'
      });
      res.end();
      return;
    }
    
    // Check if auth is required
    const needsAuth = !this.publicPaths.some(function(p) { return p === pathname || (pathname.startsWith("/api/v1/tools/") && p === "/api/v1/tools"); });
    
    if (needsAuth) {
      // Validate API key
      const apiKey = req.headers['x-api-key'];
      const authResult = this.auth.apiKeyManager.validate(apiKey);
      
      if (!authResult) {
        this._sendJson(res, 401, { 
          error: 'Unauthorized', 
          message: 'Invalid or missing API key. Use X-API-Key header.' 
        });
        return;
      }
      
      req.auth = authResult;
      
      // Rate limit check
      const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
      const rateResult = this.auth.rateLimiter.check(clientIp);
      
      if (!rateResult.allowed) {
        this._sendJson(res, 429, {
          error: 'Rate limit exceeded',
          reason: rateResult.reason,
          resetIn: rateResult.resetIn
        });
        return;
      }
      
      req.rateLimit = rateResult;
    }
    
    const { handler, params } = this._matchRoute(method, pathname);
    
    // Wrap res.end to add rate limit headers (only if headers not already sent)
    const originalEnd = res.end;
    const self = this;
    res.end = function() {
      if (req.rateLimit && !res.headersSent) {
        res.setHeader('X-RateLimit-Remaining', req.rateLimit.remaining);
        res.setHeader('X-RateLimit-Reset', req.rateLimit.resetIn);
      }
      originalEnd.apply(res, arguments);
    };
    
    try {
      await handler.call(this, req, res, params, parsedUrl.query);
    } catch (error) {
      if (!res.headersSent) {
        self._sendJson(res, 500, {
          error: 'Internal Server Error',
          message: error.message
        });
      }
    }
  }
  
  // Public endpoints (no auth)
  async handleStatus(req, res, params, query) {
    this._sendJson(res, 200, {
      status: 'running',
      uptime: process.uptime(),
      version: '2.0.0-enterprise',
      timestamp: new Date().toISOString()
    });
  }
  
  async handleHealth(req, res, params, query) {
    const layers = {
      layer1: this.gateway.layer1 ? 'healthy' : 'not_initialized',
      layer2: this.gateway.layer2 ? 'healthy' : 'not_initialized',
      layer3: this.gateway.layer3 ? 'healthy' : 'not_initialized',
      layer4: this.gateway.layer4 ? 'healthy' : 'not_initialized'
    };
    
    const allHealthy = Object.values(layers).every(h => h === 'healthy');
    
    this._sendJson(res, allHealthy ? 200 : 503, {
      status: allHealthy ? 'healthy' : 'degraded',
      layers,
      timestamp: new Date().toISOString()
    });
  }
  
  // Protected endpoints
  async handleStats(req, res, params, query) {
    const stats = {
      gateway: {
        uptime: process.uptime(),
        memory: process.memoryUsage()
      },
      endpoints: this.gateway.layer1 ? this.gateway.layer1.getStats() : { count: 0 },
      sessions: this.gateway.layer2 ? this.gateway.layer2.getStats() : { count: 0 },
      agents: this.gateway.layer3 ? this.gateway.layer3.getStats() : { count: 0 },
      subagents: this.gateway.layer4 ? this.gateway.layer4.getStats() : { count: 0 },
      auth: {
        keysCount: this.auth.apiKeyManager.keys.size
      },
      timestamp: new Date().toISOString()
    };
    
    this._sendJson(res, 200, stats);
  }
  
  async handleEndpoints(req, res, params, query) {
    const endpoints = this.gateway.layer1 ? this.gateway.layer1.getEndpoints() : [];
    this._sendJson(res, 200, { endpoints, count: endpoints.length });
  }
  
  async handleEndpointById(req, res, params, query) {
    const endpoint = this.gateway.layer1 ? this.gateway.layer1.getEndpoint(params.id) : null;
    if (!endpoint) {
      this._sendJson(res, 404, { error: 'Endpoint not found' });
      return;
    }
    this._sendJson(res, 200, endpoint);
  }
  
  async handleSessions(req, res, params, query) {
    const sessions = this.gateway.layer2 ? this.gateway.layer2.getSessions() : [];
    this._sendJson(res, 200, { sessions, count: sessions.length });
  }
  
  async handleSessionById(req, res, params, query) {
    const session = this.gateway.layer2 ? this.gateway.layer2.getSession(params.id) : null;
    if (!session) {
      this._sendJson(res, 404, { error: 'Session not found' });
      return;
    }
    this._sendJson(res, 200, session);
  }
  
  async handleAgents(req, res, params, query) {
    const agents = this.gateway.layer3 ? this.gateway.layer3.getAgents() : [];
    this._sendJson(res, 200, { agents, count: agents.length });
  }
  
  async handleAgentById(req, res, params, query) {
    const agent = this.gateway.layer3 ? this.gateway.layer3.getAgent(params.id) : null;
    if (!agent) {
      this._sendJson(res, 404, { error: 'Agent not found' });
      return;
    }
    this._sendJson(res, 200, agent);
  }
  
  async handleSubagents(req, res, params, query) {
    const subagents = this.gateway.layer4 ? this.gateway.layer4.getSubagents() : [];
    this._sendJson(res, 200, { subagents, count: subagents.length });
  }
  
  async handleSubagentById(req, res, params, query) {
    const subagent = this.gateway.layer4 ? this.gateway.layer4.getSubagent(params.id) : null;
    if (!subagent) {
      this._sendJson(res, 404, { error: 'Subagent not found' });
      return;
    }
    this._sendJson(res, 200, subagent);
  }
  
  async handleConfig(req, res, params, query) {
    this._sendJson(res, 200, this.gateway.config);
  }
  
  // Auth management (admin only)
  _checkAdmin(req, res) {
    if (req.auth.role !== 'admin') {
      this._sendJson(res, 403, { error: 'Forbidden', message: 'Admin access required' });
      return false;
    }
    return true;
  }
  
  async handleAuthKeys(req, res, params, query) {
    if (!this._checkAdmin(req, res)) return;
    this._sendJson(res, 200, { keys: this.auth.apiKeyManager.listKeys() });
  }
  
  async handleCreateKey(req, res, params, query) {
    if (!this._checkAdmin(req, res)) return;
    
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { name, role } = JSON.parse(body);
        const newKey = this.auth.apiKeyManager.addKey(name, role || 'user');
        this._sendJson(res, 201, newKey);
      } catch (e) {
        this._sendJson(res, 400, { error: 'Invalid request', message: e.message });
      }
    });
  }
  
  async handleDeleteKey(req, res, params, query) {
    if (!this._checkAdmin(req, res)) return;
    
    const revoked = this.auth.apiKeyManager.revokeKey(params.id);
    this._sendJson(res, revoked ? 200 : 404, { success: revoked });
  }
  
  async handleRateLimitStats(req, res, params, query) {
    this._sendJson(res, 200, this.auth.rateLimiter.getAllStats());
  }
  
  async handleRateLimitCheck(req, res, params, query) {
    const ip = req.ip || req.connection.remoteAddress;
    this._sendJson(res, 200, this.auth.rateLimiter.getStats(ip));
  }
  
  async handleRequestLogs(req, res, params, query) {
    if (!this._checkAdmin(req, res)) return;
    this._sendJson(res, 200, this.auth.requestLogger.query(query));
  }
  
  async handleLogStats(req, res, params, query) {
    if (!this._checkAdmin(req, res)) return;
    this._sendJson(res, 200, this.auth.requestLogger.getStats());
  }
  
  async handleNotFound(req, res, params, query) {
    this._sendJson(res, 404, { error: 'Not Found', path: req.url, method: req.method });
  }
  
  async start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(this.handleRequest.bind(this));
      
      this.server.on('error', (err) => {
        this.gateway.logger.error('API Server error', { error: err.message });
        reject(err);
      });
      
      this.server.listen(this.port, () => {
        this.gateway.logger.info('API Server started with auth', { port: this.port });
        console.log('[API] Auth enabled - Use X-API-Key header');
        console.log('[API] Default key: claw2ee_xxxxxxxxxxxxxx');
        resolve();
      });
    });
  }
  
  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          this.gateway.logger.info('API Server stopped');
          resolve();
        });
      });
    }
  }
}

module.exports = { ApiServer };

// MCP Tools Handler
ApiServer.prototype.handleTools = function(req, res, params, query) {
  if (res.headersSent) return;
  
  var tools = global.claw2eeTools || {};
  var toolName = params.tool;
  
  if (!toolName) {
    var toolList = Object.keys(tools).map(function(name) {
      return { name: name, description: tools[name].description || '' };
    });
    this._sendJson(res, 200, { tools: toolList, count: toolList.length });
    return;
  }
  
  if (!tools[toolName]) {
    this._sendJson(res, 404, { error: 'Tool not found: ' + toolName });
    return;
  }
  
  var self = this;
  
  // For POST, read body first
  if (req.method === 'POST') {
    var body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() {
      var args = {};
      try { args = JSON.parse(body); } catch (e) {}
      console.log("[DEBUG] POST body:", JSON.stringify(args));
      
      var timeout = setTimeout(function() {
        self._sendJson(res, 500, { error: 'Tool execution timeout' });
      }, 30000);
      
      try {
        tools[toolName].handler(args, function(err, result) {
          clearTimeout(timeout);
          if (err) self._sendJson(res, 500, { error: err.message || String(err) });
          else self._sendJson(res, 200, result);
        });
      } catch (e) {
        clearTimeout(timeout);
        self._sendJson(res, 500, { error: e.message });
      }
    });
  } else {
    var timeout = setTimeout(function() {
      self._sendJson(res, 500, { error: 'Tool execution timeout' });
    }, 30000);
    
    try {
      tools[toolName].handler(query || {}, function(err, result) {
        clearTimeout(timeout);
        if (err) self._sendJson(res, 500, { error: err.message || String(err) });
        else self._sendJson(res, 200, result);
      });
    } catch (e) {
      clearTimeout(timeout);
      this._sendJson(res, 500, { error: e.message });
    }
  }
};
