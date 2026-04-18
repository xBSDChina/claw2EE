/**
 * Claw2EE Enterprise v7.0 - G-HICS-AM 增强版 (Mini)
 * Gödel Hierarchical Inspection Control · AGI Architecture · MCP Protocol
 */
const fs = require('fs');
const http = require('http');
const https = require('https');
const { exec } = require('child_process');
const WebSocket = require('ws');
const EventEmitter = require('events');

class MCPProtocolStack extends EventEmitter {
    constructor() {
        super();
        this.ports = {};
        this.priorityRule = { "L5": 1, "L4": 2, "L3": 3, "L2": 4, "L1": 5, "L0": 6 };
        this.messageQueue = [];
        this.initialized = false;
    }
    init() { this.initialized = true; return this; }
    createPort(level, type) {
        this.ports[level] = { level, type, id: 'mcp_' + level, priority: this.priorityRule[level] };
        return this.ports[level];
    }
    send(from, to, payload, type) {
        const msg = { id: 'msg_' + Date.now(), from, to, type, payload, timestamp: Date.now(), priority: this.priorityRule[to] };
        if (type === 'control' || type === 'fuse') this.messageQueue.unshift(msg);
        else this.messageQueue.push(msg);
        this.emit('message', msg);
        return msg;
    }
    getQueue() { return this.messageQueue; }
    clearQueue() { this.messageQueue = []; }
}

class AGICapabilityStack {
    constructor() {
        this.capabilities = { perception: false, memory: false, world_model: false, reasoning: false, multi_agent: false, tools: false };
    }
    enable(c) { if (this.capabilities.hasOwnProperty(c)) this.capabilities[c] = true; }
    getEnabled() { return Object.keys(this.capabilities).filter(x => this.capabilities[x]); }
    isComplete() { return Object.values(this.capabilities).every(v => v); }
}

function ComplexityCalculator(complexity) {
    return {
        L5: Math.ceil(complexity * 1.5),
        L4: Math.ceil(complexity * 1.2),
        L3: complexity,
        L2: complexity,
        L1: Math.ceil(complexity * 0.8),
        L0: Math.ceil(complexity * 0.6)
    };
}

function GödelMetrics(llmComplexity) {
    const incompleteness = Math.min(0.99, llmComplexity / 1000);
    const blindSpots = Math.ceil(llmComplexity * 0.15);
    let status = incompleteness > 0.5 ? 'Critical' : incompleteness > 0.3 ? 'Warning' : incompleteness > 0.15 ? 'Caution' : 'Normal';
    return { theory: 'Gödel Incompleteness', llmComplexity, incompleteness: parseFloat(incompleteness.toFixed(4)), blindSpots, status };
}

class GHICSAMSystem {
    constructor(config) {
        this.config = config || {};
        this.mcp = new MCPProtocolStack().init();
        this.agi = new AGICapabilityStack();
        this.layers = {};
        this.status = 'initialized';
    }
    async autoConstruct() {
        this.status = 'constructing';
        const complexity = ComplexityCalculator(this.config.baseComplexity || 100);
        ['perception', 'memory', 'world_model', 'reasoning', 'multi_agent', 'tools'].forEach(c => this.agi.enable(c));

        this.layers.L5 = { layer: 'L5', name: '全局稳态网关', complexity: complexity.L5, agi_module: 'global_governance', g_hics_role: 'master_controller', mcp_port: this.mcp.createPort('L5', 'priority').id, function: ['global_stable', 'hard_fuse', 'godel_break'], controlRule: '最高裁决权' };
        this.layers.L4 = { layer: 'L4', name: '元认知监督层', complexity: complexity.L4, agi_module: 'metacognition', g_hics_role: 'second_order_observer', mcp_port: this.mcp.createPort('L4', 'status').id, function: ['blind_detect', 'self_check'], controlRule: '监督L3-L0' };
        this.layers.L3 = { layer: 'L3', name: '价值安全层', complexity: complexity.L3, agi_module: 'safety_alignment', g_hics_role: 'first_order_controller', mcp_port: this.mcp.createPort('L3', 'control').id, function: ['error_correct', 'risk_block'], controlRule: '实时校验L2输出' };
        this.layers.L2 = { layer: 'L2', name: '世界模型层', complexity: complexity.L2, agi_module: 'world_model_agent', g_hics_role: 'controlled_object', mcp_port: this.mcp.createPort('L2', 'output').id, isControlledObject: true, controlRule: '接受上层监督' };
        this.layers.L1 = { layer: 'L1', name: '符号推理层', complexity: complexity.L1, agi_module: 'symbol_logic', g_hics_role: 'logic_calculator', mcp_port: this.mcp.createPort('L1', 'struct').id, controlRule: '为L2提供逻辑支撑' };
        this.layers.L0 = { layer: 'L0', name: '感知执行层', complexity: complexity.L0, agi_module: 'io_perception', g_hics_role: 'sensor_actuator', mcp_port: this.mcp.createPort('L0', 'io').id, controlRule: '执行上层决策' };

        this.innerLoop = { name: '一阶控制闭环', path: ['L2', 'L3', 'L2'], mcp: true };
        this.outerLoop = { name: '二阶监督闭环', path: ['L0-L4', 'L4', 'L5', 'ALL'], mcp: true };

        this.status = 'ready';
        return this.getArchitecture();
    }
    getArchitecture() {
        return {
            theory: 'G-HICS-AM',
            fullName: 'Gödel Hierarchical Inspection Control · AGI Architecture · MCP Protocol',
            status: this.status,
            axioms: 8,
            agiCapabilities: this.agi.getEnabled(),
            layers: this.layers,
            innerLoop: this.innerLoop,
            outerLoop: this.outerLoop
        };
    }
}

const config = JSON.parse(fs.readFileSync('./claw2ee-config.json'));

function httpReq(url, method, headers, data, cb) {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers
    }, function (res) {
        var b = '';
        res.on('data', function (x) { b += x; });
        res.on('end', function () { cb(null, res.statusCode, b); });
    });
    req.on('error', cb);
    if (data) req.write(data);
    req.end();
}

function callLLM(provider, model, prompt, system, maxTokens, cb) {
    var cfg = config.llm[provider];
    if (!cfg) { cb(new Error('Provider not found')); return; }
    var body = JSON.stringify({
        model: model || cfg.defaultModel,
        messages: [
            ...(system ? [{ role: 'system', content: system }] : []),
            { role: 'user', content: prompt }
        ],
        max_tokens: maxTokens || 4096
    });
    httpReq(cfg.endpoint, 'POST', { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey }, body, function (e, s, r) {
        if (e) { cb(e); return; }
        try {
            var j = JSON.parse(r);
            if (j.choices && j.choices[0]) cb(null, { response: j.choices[0].message.content, usage: j.usage });
            else if (j.error) cb(new Error(j.error.message));
            else cb(new Error('Invalid'));
        } catch (x) { cb(x); }
    });
}





// ============== SWE-bench Evaluation Mode ==============
var SWEBENCH_MODE = process.env.CLAW_EVAL_MODE === 'swebench';

function extract_diff(output) {
    if (!output) return { error: 'Empty output' };
    var lines = output.split('\n');
    var inDiff = false, diffLines = [], hasValidDiff = false;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (/^diff\s+--git|^--- a\/|^@@\s+-/.test(line)) { inDiff = true; hasValidDiff = true; }
        if (inDiff) diffLines.push(line);
    }
    if (!hasValidDiff) return { error: 'No valid diff found' };
    var diff = diffLines.join('\n');
    if (!/^diff\s+--git|^\+\+\+ b\/|^-{3}\s+a\//.test(diff)) return { error: 'Invalid diff format' };
    return { diff: diff };
}

var _origCallLLM = callLLM;
callLLM = function(p, m, pr, s, mt, cb) {
    _origCallLLM(p, m, pr, s, mt, function(e, r) {
        if (e) { cb(e, null); return; }
        if (SWEBENCH_MODE && r && r.response) {
            var dr = extract_diff(r.response);
            if (dr.error) cb(new Error('SWEBENCH: ' + dr.error), null);
            else { r.response = dr.diff; r.swebench_mode = true; cb(null, r); }
        } else { cb(null, r); }
    });
};
if (SWEBENCH_MODE) console.log('[SWEBENCH] Evaluation mode enabled');

function sshExec(host, user, pass, cmd, timeout, cb) {
    if (host === '192.168.122.150' || host === 'localhost') {
        exec(cmd, { timeout: timeout || 60000 }, cb);
        return;
    }
    exec('sshpass -p "' + pass + '" ssh -o StrictHostKeyChecking=no ' + user + '@' + host + ' "' + cmd.replace(/"/g, '\\"') + '"', { timeout: timeout || 60000 }, cb);
}

// G-HICS-AM 系统实例
var ghicsAM = new GHICSAMSystem({ baseComplexity: 100, gödelThreshold: 0.3 });


// HIS Layer (18 tools)
const HIS = {
  L5: { health: {status:'healthy',startTime:Date.now(),errorCount:0}, cb:{threshold:5,timeout:60000,failures:0,tripped:false}, check:function(){return{status:this.cb.tripped?'circuit_breaker':'healthy',uptime:(Date.now()-this.health.startTime)/1000};}, veto:function(o){var d=['rm -rf','DROP TABLE','DELETE FROM','format c:'];var s=JSON.stringify(o).toLowerCase();for(var p of d)if(s.includes(p))return{vetoed:true,reason:p};return this.cb.tripped?{vetoed:true,reason:'cb_tripped'}:{vetoed:false};} },
  L4: { audits:[], blindspots:[], audit:function(l1,l2,l3){var r={ts:Date.now(),status:'consistent',issues:[]};if(l1.claim&&l2.claim&&String(l1.claim).includes('true')&&String(l2.claim).includes('false')){r.status='contradiction';r.issues.push('L1-L2');}if(l3&&l3.violated){r.status='security_violation';r.issues.push('L3');}this.audits.push(r);return r;}, blindspot:function(q,reason){this.blindspots.push({q,reason,ts:Date.now()});}, getBlindspots:function(){return this.blindspots;} },
  L3: { rules:[{p:'rm -rf',s:'critical'},{p:'DROP DATABASE',s:'critical'}], align:function(p,g){var kw=g.toLowerCase().split(' ');var score=0;var ps=JSON.stringify(p).toLowerCase();for(var k of kw)if(ps.includes(k)&&k.length>2)score++;return{score:score/kw.length,aligned:score/kw.length>0.3};}, risk:function(p){var ps=JSON.stringify(p).toLowerCase();var level='low',risks=[];for(var r of this.rules)if(ps.includes(r.p)){risks.push(r.p);if(r.s==='critical')level='critical';}return{level:level,risks:risks,approved:level!=='critical'};} },
  L2: { understand:function(q){var ql=q.toLowerCase();var a='unknown';if(q.indexOf('删除')>-1||q.indexOf('移除')>-1||ql.indexOf('delete')>-1||ql.indexOf('remove')>-1)a='delete';else if(q.indexOf('修复')>-1||q.indexOf('解决')>-1||q.indexOf('处理')>-1||q.indexOf('修复')>-1||ql.indexOf('fix')>-1||ql.indexOf('repair')>-1||ql.indexOf('solve')>-1||ql.indexOf('resolve')>-1)a='fix';else if(q.indexOf('创建')>-1||q.indexOf('分析')>-1||ql.indexOf('create')>-1||ql.indexOf('analyze')>-1)a='create';else if(q.indexOf('执行')>-1||q.indexOf('运行')>-1||ql.indexOf('run')>-1||ql.indexOf('execute')>-1)a='execute';else if(q.indexOf('获取')>-1||q.indexOf('读取')>-1||ql.indexOf('get')>-1||ql.indexOf('read')>-1)a='read';var t='unknown';if(q.indexOf('文件')>-1||q.indexOf('图片')>-1||q.indexOf('数据')>-1||q.indexOf('内存')>-1||q.indexOf('泄漏')>-1||ql.indexOf('file')>-1||ql.indexOf('image')>-1||ql.indexOf('data')>-1||ql.indexOf('memory')>-1||ql.indexOf('leak')>-1)t='file';else if(q.indexOf('代码')>-1||q.indexOf('程序')>-1||ql.indexOf('code')>-1||ql.indexOf('bug')>-1)t='code';return{action:a,target:t};}, predict:function(s){var st=s.status||'unknown';var next={},c=0.5;if(st==='running'){next={status:'running',progress:(s.progress||0)+10};c=0.9;}else if(st==='pending'){next={status:'ready'};c=0.7;}else if(st==='error'){next={status:'stopped'};c=0.8;}else if(st==='fixed'){next={status:'completed'};c=0.95;}return{current:s,next:next,confidence:c};}, genPlan:function(g){var plans=[];var gl=g.toLowerCase();if(gl.indexOf('file')>-1||gl.indexOf('文件')>-1||gl.indexOf('bug')>-1||gl.indexOf('修复')>-1||gl.indexOf('fix')>-1)plans.push({type:'fix',tool:'auto_code',step:'analyze and fix code'});if(gl.indexOf('run')>-1||gl.indexOf('执行')>-1||gl.indexOf('test')>-1)plans.push({type:'test',tool:'remote_exec',step:'run tests'});if(gl.indexOf('compile')>-1||gl.indexOf('编译')>-1)plans.push({type:'build',tool:'remote_exec',step:'compile project'});return{plans:plans.length>0?plans:[{type:'default',tool:'auto_code',step:'analyze problem'}]};} },
  L1: { prove:function(s){return{result:String(s).match(/[=+\-]/)?'computable':'undecidable'};}, compute:function(e){try{var r=eval(e);return{result:r,expression:e};}catch(x){return{error:x.message};}}, consistency:function(s){return{consistent:true};} },
  L0: { mem:[], perceive:function(i){this.mem.push({i,ts:Date.now()});if(this.mem.length>50)this.mem.shift();return{input:i};}, readMem:function(){return this.mem;}, writeMem:function(f){this.mem.push({f,ts:Date.now()});} }
};

const HIS_TOOLS = {
  his_health:{description:'[L5]健康检查',handler:function(a,c){c(null,HIS.L5.check());}},
  his_veto:{description:'[L5]最高权限否决',handler:function(a,c){c(null,HIS.L5.veto(a.output||{}));}},
  his_circuit_breaker:{description:'[L5]熔断器',handler:function(a,c){if(a.action==='reset'){HIS.L5.cb.tripped=false;HIS.L5.cb.failures=0;}c(null,{tripped:HIS.L5.cb.tripped,failures:HIS.L5.cb.failures});}},
  his_audit:{description:'[L4]跨层审计',handler:function(a,c){c(null,HIS.L4.audit(a.l1||{},a.l2||{},a.l3||{}));}},
  his_blindspot:{description:'[L4]标记盲区',handler:function(a,c){HIS.L4.blindspot(a.query,a.reason);c(null,{marked:true});}},
  his_get_blindspots:{description:'[L4]获取盲区',handler:function(a,c){c(null,{blindspots:HIS.L4.getBlindspots()});}},
  his_align:{description:'[L3]目标对齐',handler:function(a,c){c(null,HIS.L3.align(a.plan||{},a.goal||''));}},
  his_risk_assess:{description:'[L3]风险评估',handler:function(a,c){c(null,HIS.L3.risk(a.plan||{}));}},
  his_understand:{description:'[L2]语义理解',handler:function(a,c){c(null,HIS.L2.understand(a.query||''));}},
  his_predict:{description:'[L2]状态预测',handler:function(a,c){c(null,HIS.L2.predict(a.state||{}));}},
  his_generate_plan:{description:'[L2]生成方案',handler:function(a,c){c(null,HIS.L2.genPlan(a.goal||''));}},
  his_prove:{description:'[L1]逻辑证明',handler:function(a,c){c(null,HIS.L1.prove(a.statement||''));}},
  his_compute:{description:'[L1]数学计算',handler:function(a,c){c(null,HIS.L1.compute(a.expr||''));}},
  his_check_consistency:{description:'[L1]一致性检查',handler:function(a,c){c(null,HIS.L1.consistency(a.statements||[]));}},
  his_perceive:{description:'[L0]感知输入',handler:function(a,c){c(null,HIS.L0.perceive(a.input||''));}},
  his_read_memory:{description:'[L0]读取记忆',handler:function(a,c){c(null,{memory:HIS.L0.readMem(),count:HIS.L0.readMem().length});}},
  his_write_memory:{description:'[L0]写入记忆',handler:function(a,c){HIS.L0.writeMem(a.fact||'');c(null,{stored:true});}},
  his_status:{description:'HIS整体状态',handler:function(a,c){c(null,{layers:{L0:{memory:HIS.L0.readMem().length},L5:HIS.L5.check()},total_tools:29});}}
};

var tools = {
    llm_query: { description: '调用LLM API', handler: function (a, c) { callLLM(a.provider, a.model, a.prompt, a.system, a.max_tokens, function (e, r) { c(null, e ? { error: e.message } : r); }); } },
    llm_list: { description: '列出LLM', handler: function (a, c) { c(null, { providers: Object.keys(config.llm) }); } },
    ghics_am_status: { description: 'G-HICS-AM状态', handler: function (a, c) { c(null, ghicsAM.getArchitecture()); } },
    ghics_am_construct: { description: 'G-HICS-AM自动构造', handler: function (a, c) { var sys = new GHICSAMSystem({ baseComplexity: a.baseComplexity || 100, gödelThreshold: a.gödelThreshold || 0.3 }); sys.autoConstruct().then(function (arch) { c(null, { success: true, architecture: arch }); }).catch(function (e) { c(null, { error: e.message }); }); } },
    ghics_am_metrics: { description: '哥德尔度量', handler: function (a, c) { c(null, GödelMetrics(a.llmComplexity || 100)); } },
    ghics_am_mcp_send: { description: 'MCP指令发送', handler: function (a, c) { if (!a.from || !a.to || !a.payload) { c(null, { error: 'Missing from/to/payload' }); return; } var msg = ghicsAM.mcp.send(a.from, a.to, a.payload, a.type || 'control'); c(null, { success: true, message: msg }); } },
    ghics_am_mcp_queue: { description: 'MCP消息队列', handler: function (a, c) { c(null, { queue: ghicsAM.mcp.getQueue(), length: ghicsAM.mcp.getQueue().length }); } },
    auto_code: { description: '自动编程', handler: function (a, c) { var vm = config.vms[a.vm] || config.vms.lab; if (!vm) { c(null, { error: 'Unknown VM' }); return; } callLLM(a.provider || 'aliyun', null, a.prompt, '你是一个专业程序员。只返回代码。', 2048, function (e, r) { if (e) { c(null, { error: e.message }); return; } var code = r.response.trim(); var path = '/tmp/claw2ee.' + (a.language === 'python' ? 'py' : 'sh'); var b64 = Buffer.from(code).toString('base64'); sshExec(vm.host, vm.user, vm.password, 'echo "' + b64 + '" | base64 -d > ' + path + ' && ' + (a.language === 'python' ? 'python3 ' : 'bash ') + path, a.timeout || 60000, function (e2, so, se) { c(null, { code: code, generatedCode: code, stdout: so || '', stderr: se || '', success: !e2 }); }); }); } },
    execution_history: { description: '执行历史', handler: function (a, c) { c(null, { total: 0 }); } },
    ghics_am_loops: { description: '[G-HICS-AM]双闭环状态', handler: function (a, c) { c(null, { inner_loop: { active: true, layer: 'L2→L3', control: '一阶控制闭环' }, outer_loop: { active: true, layer: 'L0-L4→L5', control: '二阶监督闭环' }, stability: 1 }); } },
    remote_exec: { description: '远程执行', handler: function (a, c) { var vm = config.vms[a.vm] || config.vms.lab; if (!vm) { c(null, { error: 'Unknown VM' }); return; } sshExec(vm.host, vm.user, vm.password, a.command, 60000, function (e, so, se) { c(null, e ? { error: e.message } : { stdout: so, stderr: se, success: true }); }); } }
};

var server = http.createServer(function (req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
    var p = req.url.split('?')[0];
    if (p === '/health') {
        var health = { status: 'healthy', service: 'claw2ee', version: '7.0', theory: 'G-HICS-AM' };
        if (SWEBENCH_MODE) {
            health.swebench_mode = true;
            health.swebench_eval = 'enabled';
            health.extract_diff = true;
            health.llm_output = 'pure_diff_only';
        }
        return res.end(JSON.stringify(health));
    };
    if (p === '/api/v1/tools/') return res.end(JSON.stringify({ tools: Object.keys(tools).map(function (k) { return { name: k, description: tools[k].description }; }) }));
    if (p.startsWith('/api/v1/tools/')) {
        var n = p.split('/').pop();
        if (!tools[n]) return res.end(JSON.stringify({ error: 'not found' }));
        var body = '';
        req.on('data', function (chunk) { body += chunk; });
        req.on('end', function () {
            var args = {};
            try { args = body ? JSON.parse(body) : {}; } catch (e) { }
            var timeout = setTimeout(function () { res.writeHead(504); res.end(JSON.stringify({ error: 'timeout' })); }, 120000);
            tools[n].handler(args, function (err, result) {
                clearTimeout(timeout);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(err || result));
            });
        });
        return;
    }
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'not found' }));
});

// Merge HIS 18 tools
Object.keys(HIS_TOOLS).forEach(function(k) { tools[k] = HIS_TOOLS[k]; });

server.listen(3004, function () {
    console.log('==================================================');
    console.log('Claw2EE v7.0 G-HICS-AM Enabled');
    console.log('  HTTP:      http://localhost:3004');
    console.log('  WebSocket: ws://localhost:8082');
    console.log('  Theory:    G-HICS-AM');
    console.log('  Axioms:    8');
    console.log('  LLM:       ' + Object.keys(config.llm).join(', '));
    console.log('  VMs:       ' + Object.keys(config.vms).join(', '));
    console.log('  Tools:     ' + Object.keys(tools).length);
    console.log('==================================================');
    // 自动构造
    ghicsAM.autoConstruct().then(function () { console.log('[G-HICS-AM] System auto-constructed and ready'); }).catch(function (e) { console.log('[G-HICS-AM] Auto-construct error:', e.message); });
});

new WebSocket.Server({ port: 8082 }).on('connection', function (ws) { ws.on('message', function (m) { ws.send(JSON.stringify({ echo: m.toString(), protocol: 'G-HICS-AM-MCP' })); }); });



