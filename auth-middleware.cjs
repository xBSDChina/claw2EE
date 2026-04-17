/**
 * Claw2EE Auth & Rate Limit Middleware
 */

const crypto = require('crypto');

class ApiKeyManager {
  constructor(options) {
    options = options || {};
    this.keys = new Map();
    this._loadKeys(options.keys || []);
  }
  
  _loadKeys(keys) {
    if (keys.length === 0) {
      const defaultKey = 'claw2ee_' + crypto.randomBytes(16).toString('hex');
      this.keys.set(this._hashKey(defaultKey), {
        key: defaultKey,
        name: 'admin',
        role: 'admin',
        createdAt: Date.now(),
        lastUsed: null
      });
      console.log('[Auth] Default API Key:', defaultKey);
    } else {
      for (const k of keys) {
        this.keys.set(this._hashKey(k.key), {
          key: k.key,
          name: k.name || 'unknown',
          role: k.role || 'user',
          createdAt: k.createdAt || Date.now(),
          lastUsed: null
        });
      }
    }
  }
  
  _hashKey(key) {
    return crypto.createHash('sha256').update(key).digest('hex');
  }
  
  validate(key) {
    if (!key) return null;
    const hash = this._hashKey(key);
    const entry = this.keys.get(hash);
    if (entry) {
      entry.lastUsed = Date.now();
    }
    return entry;
  }
  
  addKey(name, role) {
    const key = 'claw2ee_' + crypto.randomBytes(16).toString('hex');
    this.keys.set(this._hashKey(key), {
      key,
      name,
      role,
      createdAt: Date.now(),
      lastUsed: null
    });
    return { key, name, role };
  }
  
  revokeKey(keyId) {
    for (const [hash, entry] of this.keys) {
      if (entry.name === keyId || entry.key === keyId) {
        this.keys.delete(hash);
        return true;
      }
    }
    return false;
  }
  
  listKeys() {
    const result = [];
    for (const [hash, entry] of this.keys) {
      result.push({
        keyId: entry.name,
        role: entry.role,
        createdAt: entry.createdAt,
        lastUsed: entry.lastUsed
      });
    }
    return result;
  }
}

class RateLimiter {
  constructor(options) {
    options = options || {};
    this.buckets = new Map();
    this.maxTokens = options.maxTokens || 100;
    this.refillRate = options.refillRate || 10;
    this.blockDuration = options.blockDuration || 60000;
    this.blocked = new Map();
  }
  
  _refill(bucket) {
    const now = Date.now();
    const timePassed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(this.maxTokens, bucket.tokens + timePassed * this.refillRate);
    bucket.lastRefill = now;
  }
  
  check(identifier, cost) {
    cost = cost || 1;
    const blockedUntil = this.blocked.get(identifier);
    if (blockedUntil && blockedUntil > Date.now()) {
      return { allowed: false, reason: 'blocked', blockedUntil };
    }
    
    let bucket = this.buckets.get(identifier);
    if (!bucket) {
      bucket = { tokens: this.maxTokens, lastRefill: Date.now() };
      this.buckets.set(identifier, bucket);
    }
    
    this._refill(bucket);
    
    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return { allowed: true, remaining: Math.floor(bucket.tokens), resetIn: Math.ceil((this.maxTokens - bucket.tokens) / this.refillRate * 1000) };
    }
    
    this.blocked.set(identifier, Date.now() + this.blockDuration);
    return { allowed: false, reason: 'rate_limit_exceeded', resetIn: Math.ceil((this.maxTokens - bucket.tokens) / this.refillRate * 1000) };
  }
  
  getStats(identifier) {
    const bucket = this.buckets.get(identifier);
    const blockedUntil = this.blocked.get(identifier);
    return {
      tokens: bucket ? Math.floor(bucket.tokens) : this.maxTokens,
      blocked: blockedUntil && blockedUntil > Date.now(),
      blockedUntil: blockedUntil || null
    };
  }
  
  getAllStats() {
    const stats = { totalIdentifiers: this.buckets.size, blockedCount: 0, buckets: [] };
    for (const [id, bucket] of this.buckets) {
      const blockedUntil = this.blocked.get(id);
      if (blockedUntil && blockedUntil > Date.now()) stats.blockedCount++;
      stats.buckets.push({ identifier: id.substring(0, 8) + '...', tokens: Math.floor(bucket.tokens) });
    }
    return stats;
  }
  
  reset(identifier) {
    this.buckets.delete(identifier);
    this.blocked.delete(identifier);
  }
}

class RequestLogger {
  constructor(options) {
    options = options || {};
    this.logs = [];
    this.maxLogs = options.maxLogs || 10000;
  }
  
  log(entry) {
    const logEntry = { timestamp: new Date().toISOString(), ...entry };
    this.logs.push(logEntry);
    if (this.logs.length > this.maxLogs) this.logs = this.logs.slice(-this.maxLogs);
    return logEntry;
  }
  
  query(filters) {
    let results = this.logs;
    if (filters.endpoint) results = results.filter(l => l.endpoint === filters.endpoint);
    if (filters.statusCode) results = results.filter(l => l.statusCode === filters.statusCode);
    if (filters.apiKey) results = results.filter(l => l.apiKey === filters.apiKey);
    return results.slice(-100);
  }
  
  getStats() {
    const now = Date.now();
    const lastHour = now - 3600000;
    const recent = this.logs.filter(l => new Date(l.timestamp).getTime() > lastHour);
    const byEndpoint = {};
    const byStatus = {};
    for (const l of recent) {
      byEndpoint[l.endpoint] = (byEndpoint[l.endpoint] || 0) + 1;
      byStatus[l.statusCode] = (byStatus[l.statusCode] || 0) + 1;
    }
    return { totalLogs: this.logs.length, lastHour: recent.length, byEndpoint, byStatus };
  }
}

function createAuthMiddleware(options) {
  const apiKeyManager = new ApiKeyManager(options);
  const rateLimiter = new RateLimiter(options.rateLimit || {});
  const requestLogger = new RequestLogger(options.logging || {});
  return { apiKeyManager, rateLimiter, requestLogger };
}

module.exports = { createAuthMiddleware, ApiKeyManager, RateLimiter, RequestLogger };
