/**
 * Claw2EE Gateway Core - Enhanced Version
 * Four-layer architecture with error handling & resilience
 * 
 * Design: CISCO Gateway Standard
 * - QoS: P1-P5 traffic classification
 * - Availability: 99.99% (Five 9s)
 * - MTBF: > 30,000 hours
 * - MTTR: < 30 seconds
 * - Latency: P50<20ms, P99<100ms
 */

const EventEmitter = require('events');
const http = require('http');
const fs = require('fs');
const path = require('path');

const { ApiServer } = require('./api-server.cjs');
// Logger with rotation
class GatewayLogger {
  constructor(logDir) {
    this.logDir = logDir || process.env.LOG_DIR || '.';
    this.level = process.env.LOG_LEVEL || 'INFO';
    this.levels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
    this._ensureLogDir();
  }
  
  _ensureLogDir() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (e) {
      // Ignore
    }
  }
  
  _shouldLog(level) {
    return this.levels[level] >= this.levels[this.level];
  }
  
  _write(level, msg, meta) {
    if (!this._shouldLog(level)) return;
    
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp: timestamp,
      level: level,
      message: msg,
      ...meta
    };
    
    const logLine = JSON.stringify(logEntry);
    console.log(logLine);
    
    // Write to file (rotate daily)
    const dateStr = timestamp.split('T')[0];
    const logFile = path.join(this.logDir, `gateway-${dateStr}.log`);
    
    try {
      fs.appendFileSync(logFile, logLine + '\n');
    } catch (e) {
      // Ignore file write errors
    }
  }
  
  debug(msg, meta) { this._write('DEBUG', msg, meta); }
  info(msg, meta) { this._write('INFO', msg, meta); }
  warn(msg, meta) { this._write('WARN', msg, meta); }
  error(msg, meta) { this._write('ERROR', msg, meta); }
}

// Dynamic module loader with error handling
class ModuleLoader {
  constructor(logger) {
    this.logger = logger;
    this.modules = new Map();
  }
  
  load(modulePath, name) {
    try {
      const module = require(modulePath);
      this.modules.set(name, module);
      this.logger.info('Module loaded', { module: name, path: modulePath });
      return module;
    } catch (error) {
      this.logger.error('Module load failed', { module: name, error: error.message });
      throw error;
    }
  }
  
  get(name) {
    return this.modules.get(name);
  }
  
  unload(name) {
    const module = this.modules.get(name);
    if (module) {
      delete require.cache[require.resolve(name)];
      this.modules.delete(name);
      this.logger.info('Module unloaded', { module: name });
    }
  }
}

// Connection pool with health check
class ConnectionPool {
  constructor(options) {
    options = options || {};
    this.maxSize = options.maxSize || 100;
    this.minSize = options.minSize || 10;
    this.connections = [];
    this.activeCount = 0;
    this.logger = options.logger;
  }
  
  acquire() {
    // Get from pool or create new
    if (this.connections.length > 0) {
      const conn = this.connections.pop();
      this.activeCount++;
      return Promise.resolve(conn);
    }
    
    if (this.activeCount < this.maxSize) {
      this.activeCount++;
      return this._createConnection();
    }
    
    // Wait for available connection
    return new Promise((resolve) => {
      setTimeout(() => this.acquire().then(resolve), 100);
    });
  }
  
  release(conn) {
    if (this.connections.length < this.maxSize) {
      this.connections.push(conn);
    }
    this.activeCount--;
  }
  
  _createConnection() {
    // Placeholder - implement actual connection creation
    return Promise.resolve({ createdAt: Date.now() });
  }
  
  getStats() {
    return {
      active: this.activeCount,
      idle: this.connections.length,
      maxSize: this.maxSize,
      minSize: this.minSize
    };
  }
}

// Main Gateway Class
const { Layer1EndpointManager } = require('./layers/layer1-endpoint.cjs');
const { SessionManager } = require('./layers/layer2-session.cjs');
const { AgentMessageManager } = require('./layers/layer3-agent.cjs');
const { SubagentMessageManager } = require('./layers/layer4-subagent.cjs');

class Claw2EEGateway extends EventEmitter {
  constructor(options) {
    options = options || {};
    super();
    
    // Initialize logger first
    this.logger = new GatewayLogger(options.logDir);
    this.logger.info('Gateway initializing', { options: options });
    
    // Configuration
    this.config = {
      wsPort: options.wsPort || 8080,
      httpPort: options.httpPort || 3000,
      qos: options.qos || {
        P1: { maxLatency: 20, weight: 10 },
        P2: { maxLatency: 50, weight: 8 },
        P3: { maxLatency: 100, weight: 5 },
        P4: { maxLatency: 500, weight: 3 },
        P5: { maxLatency: 1000, weight: 1 }
      },
      sessionTTL: options.sessionTTL || 3600000,
      maxConnections: options.maxConnections || 10000,
      statsInterval: options.statsInterval || 60000,
      autoRestart: options.autoRestart !== false,
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000
    };
    
    // Initialize modules
    this.moduleLoader = new ModuleLoader(this.logger);
    this.connectionPool = new ConnectionPool({
      maxSize: 50,
      minSize: 10,
      logger: this.logger
    });
    
    // Layer instances
    this.layer1 = new Layer1EndpointManager({ port: this.config.wsPort, logger: this.logger });
    this.layer2 = new SessionManager({ ttl: this.config.sessionTTL, logger: this.logger });
    this.layer3 = new AgentMessageManager({ logger: this.logger });
    this.layer4 = new SubagentMessageManager({ logger: this.logger });
    
    // HTTP server
    this.httpServer = null;
    this.statsTimer = null;
    
    // State
    this.isRunning = false;
    this.startTime = null;
    this.restartCount = 0;
    
    // Error tracking
    this.errors = [];
    this.maxErrors = 100;
    
    // Bind layer events
    this._bindEvents();
    
    this.logger.info('Gateway core initialized');
  }
  
  _bindEvents() {
    const self = this;
    
    // Layer 1 events
    this.layer1.on('endpoint:connected', function(endpoint) {
      self.logger.info('Endpoint connected', { endpointId: endpoint.endpointId });
      self.emit('endpoint:connected', endpoint);
    });
    
    this.layer1.on('endpoint:message', function(endpoint, data) {
      self._handleMessage(endpoint, data);
    });
    
    this.layer1.on('endpoint:disconnected', function(endpoint) {
      self.logger.info('Endpoint disconnected', { endpointId: endpoint.endpointId });
      
      // Clean up sessions
      try {
        const sessions = self.layer2.getSessionsByEndpoint(endpoint.endpointId);
        for (const session of sessions) {
          self.layer2.deleteSession(session.sessionId);
        }
      } catch (error) {
        self.logger.error('Error cleaning up sessions', { error: error.message });
      }
      
      self.emit('endpoint:disconnected', endpoint);
    });
    
    this.layer1.on('error', function(error) {
      self._handleError('Layer1', error);
    });
    
    // Layer 2 events
    this.layer2.on('session:created', function(session) {
      self.logger.debug('Session created', { sessionId: session.sessionId });
      self.emit('session:created', session);
    });
    
    this.layer2.on('session:expired', function(session) {
      self.logger.info('Session expired', { sessionId: session.sessionId });
      self.emit('session:expired', session);
    });
    
    this.layer2.on('error', function(error) {
      self._handleError('Layer2', error);
    });
    
    // Layer 3 events
    this.layer3.on('message:created', function(message) {
      self.logger.debug('Agent message created', { messageId: message.messageId });
      self.emit('agent:message:created', message);
    });
    
    this.layer3.on('error', function(error) {
      self._handleError('Layer3', error);
    });
    
    // Layer 4 events
    this.layer4.on('subagent:message:created', function(message) {
      self.logger.debug('Subagent message created', { messageId: message.messageId });
      self.emit('subagent:message:created', message);
    });
    
    this.layer4.on('error', function(error) {
      self._handleError('Layer4', error);
    });
  }
  
  _handleError(source, error) {
    const errorEntry = {
      source: source,
      message: error.message,
      stack: error.stack,
      timestamp: Date.now()
    };
    
    this.errors.push(errorEntry);
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }
    
    this.logger.error('Layer error', { source: source, error: error.message });
    this.emit('error', errorEntry);
  }
  
  _handleMessage(endpoint, data) {
    try {
      // Route message to appropriate layer
      const messageType = data.type || 'unknown';
      
      switch (messageType) {
        case 'auth':
          this.layer2.handleAuth(endpoint, data);
          break;
        case 'session_create':
          this.layer2.createSession(endpoint, data);
          break;
        case 'agent_message':
          this.layer3.handleMessage(endpoint, data);
          break;
        case 'subagent_message':
          this.layer4.handleMessage(endpoint, data);
          break;
        case 'ping':
          endpoint.send({ type: 'pong', timestamp: Date.now() });
          break;
        default:
          this.logger.warn('Unknown message type', { type: messageType });
          endpoint.send({ type: 'error', error: 'Unknown message type' });
      }
    } catch (error) {
      this._handleError('MessageRouter', error);
    }
  }
  
  async start() {
    if (this.isRunning) {
      this.logger.warn('Gateway already running');
      return;
    }
    
    this.logger.info('Starting gateway', { 
      wsPort: this.config.wsPort, 
      httpPort: this.config.httpPort 
    });
    
    try {
      // Start layers
      await this.layer1.start();
      this.logger.info('Layer 1 started');
      
      // Start HTTP server
      await this._startHttpServer();
      this.logger.info('HTTP server started');
      
      // Start stats timer
      this._startStatsTimer();
      
      this.isRunning = true;
      this.startTime = Date.now();
      this.logger.info('Gateway started successfully');
      
      this.emit('started');
    } catch (error) {
      this.logger.error('Failed to start gateway', { error: error.message });
      throw error;
    }
  }
  
  async _startHttpServer() {
    // Use ApiServer for REST API
    this.apiServer = new ApiServer(this, { port: this.config.httpPort });
    await this.apiServer.start();
    this.logger.info('API Server started', { port: this.config.httpPort });
  }
  
  _handleHttpRequest(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    const url = req.url.split('?')[0];
    
    if (url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.getStatus()));
      return;
    }
    
    if (url === '/metrics') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.getMetrics(), null, 2));
      return;
    }
    
    if (url === '/errors') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ errors: this.errors.slice(-20) }));
      return;
    }
    
    if (url === '/config') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.config, null, 2));
      return;
    }
    
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
  
  _startStatsTimer() {
    const self = this;
    this.statsTimer = setInterval(function() {
      const metrics = self.getMetrics();
      self.logger.info('Gateway stats', metrics);
    }, this.config.statsInterval);
  }
  
  getStatus() {
    return {
      status: this.isRunning ? 'running' : 'stopped',
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      restartCount: this.restartCount,
      layers: {
        layer1: this.layer1 ? 'active' : 'inactive',
        layer2: this.layer2 ? 'active' : 'inactive',
        layer3: this.layer3 ? 'active' : 'inactive',
        layer4: this.layer4 ? 'active' : 'inactive'
      }
    };
  }
  
  getMetrics() {
    const layer1Metrics = this.layer1.getMetrics ? this.layer1.getMetrics() : {};
    const layer2Metrics = this.layer2.getMetrics ? this.layer2.getMetrics() : {};
    const layer3Metrics = this.layer3.getMetrics ? this.layer3.getMetrics() : {};
    const layer4Metrics = this.layer4.getMetrics ? this.layer4.getMetrics() : {};
    
    return {
      status: this.isRunning ? 'running' : 'stopped',
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      connections: layer1Metrics.connections || {},
      sessions: layer2Metrics,
      agentMessages: layer3Metrics,
      subagentMessages: layer4Metrics,
      connectionPool: this.connectionPool.getStats(),
      errorCount: this.errors.length
    };
  }
  
  async stop() {
    if (!this.isRunning) return;
    
    this.logger.info('Stopping gateway');
    
    // Stop stats timer
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
    
    // Stop layers
    if (this.layer1 && this.layer1.stop) {
      await this.layer1.stop();
    }
    
    // Stop API server
    if (this.apiServer) {
      await this.apiServer.stop();
      this.apiServer = null;
    }
    
    this.isRunning = false;
    this.logger.info('Gateway stopped');
    
    this.emit('stopped');
  }
  
  async restart() {
    this.logger.info('Restarting gateway');
    this.restartCount++;
    
    await this.stop();
    await this.start();
    
    this.logger.info('Gateway restarted', { restartCount: this.restartCount });
    this.emit('restarted');
  }
}

module.exports = { Claw2EEGateway, GatewayLogger, ModuleLoader, ConnectionPool };
