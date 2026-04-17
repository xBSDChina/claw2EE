/**
 * HIS Layer Module - 可集成到 v6
 * 从 index-his-v2.cjs 提取 HIS 工具定义
 */

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

// HIS 工具定义
const HIS_TOOLS = {
  // L5 稳态控制层
  his_health: {
    description: '[L5] 健康检查',
    inputSchema: { type: 'object' },
    handler: function(args, callback) {
      callback(null, HIS.L5.check());
    }
  },

  his_veto: {
    description: '[L5] 最高权限否决检查',
    inputSchema: { type: 'object', properties: { output: { type: 'object' } }, required: ['output'] },
    handler: function(args, callback) {
      callback(null, HIS.L5.veto(args.output));
    }
  },

  his_circuit_breaker: {
    description: '[L5] 熔断器控制',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['status', 'reset'] } } },
    handler: function(args, callback) {
      if (args.action === 'reset') {
        HIS.L5.cb.tripped = false;
        HIS.L5.cb.failures = 0;
      }
      callback(null, { tripped: HIS.L5.cb.tripped, failures: HIS.L5.cb.failures });
    }
  },

  // L4 元认知监督层
  his_audit: {
    description: '[L4] 跨层一致性审计',
    inputSchema: { type: 'object', properties: { l1: { type: 'object' }, l2: { type: 'object' }, l3: { type: 'object' } } },
    handler: function(args, callback) {
      callback(null, HIS.L4.audit(args.l1 || {}, args.l2 || {}, args.l3 || {}));
    }
  },

  his_blindspot: {
    description: '[L4] 查询盲区',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, reason: { type: 'string' } } },
    handler: function(args, callback) {
      HIS.L4.blindspot(args.query, args.reason);
      callback(null, { marked: true });
    }
  },

  his_get_blindspots: {
    description: '[L4] 获取所有盲区',
    inputSchema: { type: 'object' },
    handler: function(args, callback) {
      callback(null, { blindspots: HIS.L4.getBlindspots() });
    }
  },

  // L3 价值与安全层
  his_align: {
    description: '[L3] 目标对齐检查',
    inputSchema: { type: 'object', properties: { plan: { type: 'object' }, goal: { type: 'string' } }, required: ['plan', 'goal'] },
    handler: function(args, callback) {
      callback(null, HIS.L3.align(args.plan, args.goal));
    }
  },

  his_risk_assess: {
    description: '[L3] 风险评估',
    inputSchema: { type: 'object', properties: { plan: { type: 'object' } }, required: ['plan'] },
    handler: function(args, callback) {
      callback(null, HIS.L3.risk(args.plan));
    }
  },

  // L2 世界模型层
  his_understand: {
    description: '[L2] 语义理解与意图提取',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    handler: function(args, callback) {
      callback(null, HIS.L2.understand(args.query));
    }
  },

  his_predict: {
    description: '[L2] 状态预测',
    inputSchema: { type: 'object', properties: { state: { type: 'object' } }, required: ['state'] },
    handler: function(args, callback) {
      callback(null, HIS.L2.predict(args.state));
    }
  },

  his_generate_plan: {
    description: '[L2] 生成候选方案',
    inputSchema: { type: 'object', properties: { goal: { type: 'string' } }, required: ['goal'] },
    handler: function(args, callback) {
      callback(null, { plans: HIS.L2.genPlan(args.goal) });
    }
  },

  // L1 符号推理层
  his_prove: {
    description: '[L1] 逻辑证明',
    inputSchema: { type: 'object', properties: { statement: { type: 'string' } }, required: ['statement'] },
    handler: function(args, callback) {
      callback(null, HIS.L1.prove(args.statement));
    }
  },

  his_compute: {
    description: '[L1] 数学计算',
    inputSchema: { type: 'object', properties: { expr: { type: 'string' } }, required: ['expr'] },
    handler: function(args, callback) {
      callback(null, HIS.L1.compute(args.expr));
    }
  },

  his_check_consistency: {
    description: '[L1] 一致性检查',
    inputSchema: { type: 'object', properties: { statements: { type: 'array', items: { type: 'string' } } }, required: ['statements'] },
    handler: function(args, callback) {
      callback(null, HIS.L1.consistency(args.statements));
    }
  },

  // L0 感知执行层
  his_perceive: {
    description: '[L0] 感知输入',
    inputSchema: { type: 'object', properties: { input: { type: 'string' } }, required: ['input'] },
    handler: function(args, callback) {
      callback(null, HIS.L0.perceive(args.input));
    }
  },

  his_read_memory: {
    description: '[L0] 读取短期记忆',
    inputSchema: { type: 'object' },
    handler: function(args, callback) {
      callback(null, { memory: HIS.L0.readMem(), count: HIS.L0.readMem().length });
    }
  },

  his_write_memory: {
    description: '[L0] 写入短期记忆',
    inputSchema: { type: 'object', properties: { fact: { type: 'string' } }, required: ['fact'] },
    handler: function(args, callback) {
      HIS.L0.writeMem(args.fact);
      callback(null, { stored: true });
    }
  },

  // HIS 整体状态
  his_status: {
    description: 'HIS 架构整体状态',
    inputSchema: { type: 'object' },
    handler: function(args, callback) {
      const l5health = HIS.L5.check();
      callback(null, {
        layers: {
          L0: { name: '感知执行层', memory: HIS.L0.readMem().length },
          L1: { name: '符号推理层', status: 'active' },
          L2: { name: '世界模型层', status: 'active' },
          L3: { name: '价值与安全层', rules: HIS.L3.rules.length },
          L4: { name: '元认知监督层', audits: HIS.L4.audits.length, blindspots: HIS.L4.blindspots.length },
          L5: { name: '稳态控制层', health: l5health }
        },
        total_tools: Object.keys(HIS_TOOLS).length,
        timestamp: Date.now()
      });
    }
  }
};

module.exports = { HIS, HIS_TOOLS };
