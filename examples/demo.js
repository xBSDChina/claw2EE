/**
 * Claw2EE Demo - G-HICS-AM 功能演示
 * 
 * 运行方式: node examples/demo.js
 * 
 * 需要先启动服务:
 *   node index-enterprise.cjs
 */

const http = require('http');

const BASE_URL = 'http://localhost:3004';

// 工具调用封装 - 纯 http 模块，兼容 Node.js 12+
function callTool(toolName, params) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(params || {});
    const req = http.request(`${BASE_URL}/api/v1/tools/${toolName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function demo() {
  console.log('========================================');
  console.log('  Claw2EE Demo - G-HICS-AM');
  console.log('========================================\n');

  // 1. 健康检查
  console.log('📡 1. 健康检查...');
  try {
    const healthRes = await new Promise((resolve, reject) => {
      http.get(`${BASE_URL}/health`, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(JSON.parse(body)));
      }).on('error', reject);
    });
    console.log('   状态:', healthRes.status);
    console.log('   版本:', healthRes.version);
    console.log('   理论:', healthRes.theory);
  } catch (e) {
    console.log('   ❌ 错误:', e.message);
    return;
  }

  // 2. 列出工具
  console.log('\n📋 2. 可用工具...');
  const toolsList = await callTool('llm_list', {});
  console.log('   LLM Providers:', toolsList.providers.join(', '));

  // 3. G-HICS-AM 状态
  console.log('\n🏛️ 3. G-HICS-AM 架构...');
  const status = await callTool('ghics_am_status', {});
  console.log('   状态:', status.status);
  console.log('   公理数:', status.axioms);
  console.log('   AGI能力:', status.agiCapabilities.join(', '));
  console.log('   层数:', Object.keys(status.layers).length);
  console.log('   稳定性:', status.closedLoops.overallStability);

  // 4. 哥德尔度量
  console.log('\n🔬 4. 哥德尔度量...');
  const metrics = await callTool('ghics_am_metrics', { llmComplexity: 100 });
  console.log('   理论:', metrics.theory);
  console.log('   不完备度:', metrics.incompleteness);
  console.log('   盲区数:', metrics.blindSpots);
  console.log('   状态:', metrics.status);

  // 5. MCP 发送 - L2 → L3
  console.log('\n📨 5. MCP 指令 (L2 → L3)...');
  const mcpSend = await callTool('ghics_am_mcp_send', {
    from: 'L2',
    to: 'L3',
    payload: { claim: '测试推理结果', reasoning: '逻辑推演' },
    type: 'control'
  });
  console.log('   发送成功:', mcpSend.success);
  console.log('   消息ID:', mcpSend.message.id);

  // 6. MCP 队列
  console.log('\n📬 6. MCP 消息队列...');
  const queue = await callTool('ghics_am_mcp_queue', {});
  console.log('   队列长度:', queue.length);
  console.log('   统计:', JSON.stringify(queue.stats));

  // 7. 双闭环状态
  console.log('\n🔄 7. 双闭环状态...');
  const loops = await callTool('ghics_am_loops', {});
  console.log('   内层闭环:', loops.innerLoop.name);
  console.log('   外层闭环:', loops.outerLoop.name);
  console.log('   稳定性分数:', loops.overallStability);

  // 8. LLM 调用
  console.log('\n🤖 8. LLM 调用...');
  try {
    const llm = await callTool('llm_query', {
      provider: 'wisemodel',
      prompt: '用一句话介绍 G-HICS-AM 理论'
    });
    const resp = llm.response || 'N/A';
    console.log('   响应:', resp.substring(0, 80) + '...');
  } catch (e) {
    console.log('   ⚠️ LLM 调用失败 (需要配置 API Key)');
  }

  console.log('\n========================================');
  console.log('  Demo 完成!');
  console.log('========================================');
}

demo().catch(console.error);
