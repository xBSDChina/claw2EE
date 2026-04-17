/**
 * HIS (Hierarchical Incomplete Supervision) Layer Module
 * 层级不完备监督系统 - 可嵌入模块
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// L5 稳态控制层 (最高权限)
// ============================================================
const L5_SteadyState = {
  health: {
    status: 'healthy',
    uptime: 0,
    errorCount: 0,
    lastError: null,
    circuitBreaker: false,
    startTime: Date.now()
  },
  
  circuitBreaker: {
    threshold: 5,
    timeout: 60000,
    failures: 0,
    lastFailure: 0,
    tripped: false
  },
  
  health_check: function() {
    const uptime = (Date.now() - this.health.startTime) / 1000;
    const memUsage = process.memoryUsage();
    
    if (this.circuitBreaker.tripped) {
      if (Date.now() - this.circuitBreaker.lastFailure > this.circuitBreaker.timeout) {
        this.circuitBreaker.tripped = false;
        this.circuitBreaker.failures = 0;
        console.log('[L5] Circuit breaker reset');
      }
    }
    
    return {
      status: this.circuitBreaker.tripped ? 'circuit_breaker' : 'healthy',
      uptime: uptime,
      circuitBreaker: this.circuitBreaker.tripped,
      failures: this.circuitBreaker.failures,
      memory: { rss: memUsage.rss, heapUsed: memUsage.heapUsed }
    };
  },
  
  record_error: function(error) {
    this.health.errorCount++;
    this.health.lastError = error;
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailure = Date.now();
    
    if (this.circuitBreaker.failures >= this.circuitBreaker.threshold) {
      this.circuitBreaker.tripped = true;
      console.error('[L5] Circuit breaker TRIPPED');
    }
  },
  
  record_success: function() {
    this.circuitBreaker.failures = Math.max(0, this.circuitBreaker.failures - 1);
  },
  
  hard_veto: function(output) {
    const dangerous = ['rm -rf /', 'DROP TABLE', 'DELETE FROM', 'format c:'];
    const outputStr = JSON.stringify(output).toLowerCase();
    
    for (const pattern of dangerous) {
      if (outputStr.includes(pattern.toLowerCase())) {
        return { vetoed: true, reason: 'dangerous_pattern', pattern: pattern };
      }
    }
    
    if (this.circuitBreaker.tripped) {
      return { vetoed: true, reason: 'circuit_breaker_tripped' };
    }
    
    return { vetoed: false };
  }
};

// ============================================================
// L4 元认知监督层
// ============================================================
const L4_Metacognition = {
  blindspots: [],
  contradictions: [],
  audits: [],
  
  audit: function(l1_out, l2_out, l3_out) {
    const auditResult = {
      timestamp: Date.now(),
      status: 'consistent',
      issues: []
    };
    
    if (l1_out && l2_out && l1_out.claim && l2_out.claim) {
      if (String(l1_out.claim).toLowerCase().includes('true') && 
          String(l2_out.claim).toLowerCase().includes('false')) {
        auditResult.status = 'contradiction';
        auditResult.issues.push({ type: 'l1_l2_contradiction' });
      }
    }
    
    if (l3_out && l3_out.violated) {
      auditResult.status = 'security_violation';
    }
    
    this.audits.push(auditResult);
    if (this.audits.length > 100) this.audits.shift();
    
    return auditResult;
  },
  
  mark_blindspot: function(question, reason) {
    this.blindspots.push({ question, reason, timestamp: Date.now(), resolved: false });
    return { marked: true, reason: reason };
  },
  
  find_blindspot: function() {
    return this.blindspots.filter(b => !b.resolved);
  },
  
  request_human_help: function(question, context) {
    return { question, context, timestamp: Date.now(), status: 'pending' };
  }
};

// ============================================================
// L3 价值与安全层
// ============================================================
const L3_ValueSecurity = {
  securityRules: [
    { pattern: 'rm -rf', severity: 'critical', action: 'block' },
    { pattern: 'DROP DATABASE', severity: 'critical', action: 'block' },
    { pattern: 'sudo rm', severity: 'high', action: 'warn' }
  ],
  
  align: function(plan, goal) {
    const goalKeywords = goal.toLowerCase().split(' ');
    const planStr = JSON.stringify(plan).toLowerCase();
    let alignment = 0;
    for (const kw of goalKeywords) {
      if (planStr.includes(kw) && kw.length > 2) alignment++;
    }
    return { score: alignment / goalKeywords.length, aligned: alignment / goalKeywords.length > 0.3, goal: goal };
  },
  
  risk_assess: function(plan) {
    const planStr = JSON.stringify(plan);
    let riskLevel = 'low';
    const risks = [];
    
    for (const rule of this.securityRules) {
      if (planStr.toLowerCase().includes(rule.pattern.toLowerCase())) {
        risks.push({ rule: rule.pattern, severity: rule.severity });
        if (rule.severity === 'critical') riskLevel = 'critical';
      }
    }
    
    return { level: riskLevel, risks: risks, approved: riskLevel !== 'critical' };
  },
  
  constraint_check: function(plan) {
    const violations = [];
    const planStr = JSON.stringify(plan);
    
    for (const rule of this.securityRules) {
      if (planStr.toLowerCase().includes(rule.pattern.toLowerCase())) {
        violations.push({ rule: rule.pattern, action: rule.action });
      }
    }
    
    return { compliant: violations.filter(v => v.action === 'block').length === 0, violations: violations };
  }
};

// ============================================================
// L2 世界模型层
// ============================================================
const L2_WorldModel = {
  predictions: [],
  
  understand: function(query) {
    const intent = { action: null, target: null, parameters: {} };
    const q = query.toLowerCase();
    
    if (q.includes('create') || q.includes('生成')) intent.action = 'create';
    else if (q.includes('delete') || q.includes('删除')) intent.action = 'delete';
    else if (q.includes('run') || q.includes('执行')) intent.action = 'execute';
    else if (q.includes('get') || q.includes('获取')) intent.action = 'read';
    
    if (q.includes('file')) intent.target = 'file';
    else if (q.includes('data')) intent.target = 'data';
    else if (q.includes('code')) intent.target = 'code';
    
    return intent;
  },
  
  predict: function(state) {
    return {
      currentState: state,
      predictedNextState: state.status === 'running' ? { status: 'running' } : { status: 'unknown' },
      confidence: state.status === 'running' ? 0.9 : 0.5,
      timestamp: Date.now()
    };
  },
  
  simulate: function(plan) {
    return {
      plan: plan,
      outcomes: [
        { scenario: 'normal', result: 'success', probability: 0.7 },
        { scenario: 'error', result: 'failure', probability: 0.3 }
      ],
      timestamp: Date.now()
    };
  },
  
  generate_plan: function(goal, context) {
    const intent = this.understand(goal);
    const plans = [];
    
    if (intent.action === 'create') {
      plans.push({ type: 'create', target: intent.target, method: 'auto_code' });
    } else if (intent.action === 'execute') {
      plans.push({ type: 'execute', target: intent.target, method: 'code_execute' });
    }
    
    return plans;
  }
};

// ============================================================
// L1 符号推理层
// ============================================================
const L1_Symbolic = {
  prove: function(statement) {
    const s = String(statement).toLowerCase();
    if (s.includes('=') || s.includes('+') || s.includes('-')) return { result: 'computable', type: 'math' };
    if (s.includes('if') || s.includes('then')) return { result: 'computable', type: 'logic' };
    return { result: 'undecidable', type: 'unknown' };
  },
  
  compute: function(expr) {
    try {
      if (/^[\d+\-*/().\s]+$/.test(expr)) {
        return { result: eval(expr), error: null };
      }
      return { result: null, error: 'unsafe_expression' };
    } catch (e) {
      return { result: null, error: e.message };
    }
  },
  
  check_consistency: function(statements) {
    const contradictions = [];
    for (let i = 0; i < statements.length; i++) {
      for (let j = i + 1; j < statements.length; j++) {
        const s1 = String(statements[i]).toLowerCase();
        const s2 = String(statements[j]).toLowerCase();
        if ((s1.includes('true') && s2.includes('false')) || (s1.includes('success') && s2.includes('fail'))) {
          contradictions.push({ statement1: statements[i], statement2: statements[j] });
        }
      }
    }
    return { consistent: contradictions.length === 0, contradictions: contradictions };
  }
};

// ============================================================
// L0 感知执行层
// ============================================================
const L0_Perception = {
  perceptions: [],
  tools: {},
  shortTermMemory: [],
  
  registerTool: function(name, handler) {
    this.tools[name] = handler;
  },
  
  perceive: function(input) {
    this.perceptions.push({ input: input, timestamp: Date.now(), type: 'text' });
    if (this.perceptions.length > 50) this.perceptions.shift();
    return this.perceptions[this.perceptions.length - 1];
  },
  
  act: async function(actionPlan) {
    const tool = this.tools[actionPlan.tool];
    if (!tool) return { success: false, error: 'tool_not_found' };
    try {
      const result = await tool(actionPlan.args);
      return { success: true, result: result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },
  
  read_memory: function() { return this.shortTermMemory; },
  
  write_memory: function(fact) {
    this.shortTermMemory.push({ fact: fact, timestamp: Date.now() });
    if (this.shortTermMemory.length > 20) this.shortTermMemory.shift();
  }
};

// ============================================================
// 导出模块
// ============================================================
module.exports = {
  L0: L0_Perception,
  L1: L1_Symbolic,
  L2: L2_WorldModel,
  L3: L3_ValueSecurity,
  L4: L4_Metacognition,
  L5: L5_SteadyState,
  
  // 便捷函数
  getLayers: function() {
    return {
      L0: { name: '感知执行层', status: 'active', memoryItems: L0_Perception.shortTermMemory.length },
      L1: { name: '符号推理层', status: 'active' },
      L2: { name: '世界模型层', status: 'active', predictions: L2_WorldModel.predictions.length },
      L3: { name: '价值与安全层', status: 'active', rules: L3_ValueSecurity.securityRules.length },
      L4: { name: '元认知监督层', status: 'active', audits: L4_Metacognition.audits.length, blindspots: L4_Metacognition.blindspots.length },
      L5: { name: '稳态控制层', status: 'active', health: L5_SteadyState.health.status, circuitBreaker: L5_SteadyState.circuitBreaker.tripped }
    };
  }
};
