# Claw2EE 调用指南 (最新 v7.0)

> **版本**: 7.0 Enterprise  
> **理论框架**: G-HICS-AM  
> **服务地址**: http://localhost:3004  
> **更新时间**: 2026-04-16

---

## 一、基础信息

### 1.1 服务端点

| 类型 | 地址 |
|------|------|
| HTTP API | http://localhost:3004 |
| WebSocket | ws://localhost:8082 |
| 健康检查 | http://localhost:3004/health |

### 1.2 工具列表

```
GET /api/v1/tools/
POST /api/v1/tools/<tool_name>
```

---

## 二、核心工具

### 2.1 健康检查

```bash
curl http://localhost:3004/health
```

**响应**:
```json
{
  "status": "healthy",
  "service": "claw2ee",
  "version": "7.0",
  "theory": "G-HICS-AM"
}
```

---

### 2.2 LLM 调用

**端点**: `POST /api/v1/tools/llm_query`

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| provider | string | 是 | LLM 提供商 |
| model | string | 否 | 模型名称 |
| prompt | string | 是 | 提示词 |
| system | string | 否 | 系统提示 |
| max_tokens | number | 否 | 最大 token 数 |

**示例**:
```bash
curl -X POST http://localhost:3004/api/v1/tools/llm_query \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": ,
    "prompt": "你好，请介绍一下自己"
  }'
```

**响应**:
```json
{
  "response": "你好！我是...",
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 50,
    "total_tokens": 60
  }
}
```

---

### 2.3 列出 LLM

**端点**: `POST /api/v1/tools/llm_list`

```bash
curl -X POST http://localhost:3004/api/v1/tools/llm_list -d '{}'
```

**响应**:
```json
{
  "providers": [, "wisemodel", "nvidia", "nvidia2", "moonshot"]
}
```

---

## 三、G-HICS-AM 工具

### 3.1 状态查询

**端点**: `POST /api/v1/tools/ghics_am_status`

```bash
curl -X POST http://localhost:3004/api/v1/tools/ghics_am_status -d '{}'
```

**返回**:
- theory: 理论名称
- version: 版本
- status: 系统状态
- axioms: 公理数量
- agiCapabilities: AGI 能力列表
- layers: 六层架构详情
- closedLoops: 双闭环状态
- mcp: MCP 协议栈状态

---

### 3.2 自动构造

**端点**: `POST /api/v1/tools/ghics_am_construct`

**参数**:
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| baseComplexity | number | 100 | 基础复杂度 |
| gödelThreshold | number | 0.3 | 哥德尔阈值 |

**示例**:
```bash
curl -X POST http://localhost:3004/api/v1/tools/ghics_am_construct \
  -H 'Content-Type: application/json' \
  -d '{
    "baseComplexity": 150,
    "gödelThreshold": 0.3
  }'
```

---

### 3.3 哥德尔度量

**端点**: `POST /api/v1/tools/ghics_am_metrics`

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| llmComplexity | number | 是 | LLM 复杂度 |

**示例**:
```bash
curl -X POST http://localhost:3004/api/v1/tools/ghics_am_metrics \
  -H 'Content-Type: application/json' \
  -d '{"llmComplexity": 100}'
```

**响应**:
```json
{
  "theory": "Gödel Incompleteness",
  "llmComplexity": 100,
  "incompleteness": 0.1,
  "blindSpots": 15,
  "status": "Normal",
  "axioms": {
    "axiom1": "哥德尔不完备公理",
    ...
  }
}
```

---

## 四、MCP 协议工具

### 4.1 发送 MCP 指令

**端点**: `POST /api/v1/tools/ghics_am_mcp_send`

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| from | string | 是 | 源层级 (L0-L5) |
| to | string | 是 | 目标层级 (L0-L5) |
| payload | any | 是 | 载荷数据 |
| type | string | 否 | 报文类型 |

**报文类型**:
| 类型 | 说明 | 优先级 |
|------|------|--------|
| control | 控制指令 | 高 |
| status | 状态上报 | 中 |
| fuse | 熔断指令 | 最高 |

**示例 - L2 到 L3 控制指令**:
```bash
curl -X POST http://localhost:3004/api/v1/tools/ghics_am_mcp_send \
  -H 'Content-Type: application/json' \
  -d '{
    "from": "L2",
    "to": "L3",
    "payload": {"claim": "2+2=4", "reasoning": "数学计算"},
    "type": "control"
  }'
```

**示例 - L5 到 L2 熔断指令**:
```bash
curl -X POST http://localhost:3004/api/v1/tools/ghics_am_mcp_send \
  -H 'Content-Type: application/json' \
  -d '{
    "from": "L5",
    "to": "L2",
    "payload": {"action": "fuse", "reason": "风险控制"},
    "type": "fuse"
  }'
```

**示例 - L0 到 L4 状态上报**:
```bash
curl -X POST http://localhost:3004/api/v1/tools/ghics_am_mcp_send \
  -H 'Content-Type: application/json' \
  -d '{
    "from": "L0",
    "to": "L4",
    "payload": {"sensors": "active", "memory": "normal"},
    "type": "status"
  }'
```

---

### 4.2 查询 MCP 队列

**端点**: `POST /api/v1/tools/ghics_am_mcp_queue`

```bash
curl -X POST http://localhost:3004/api/v1/tools/ghics_am_mcp_queue -d '{}'
```

**响应**:
```json
{
  "queue": [...],
  "length": 5,
  "stats": {
    "sent": 10,
    "received": 10,
    "fuse": 2,
    "control": 5,
    "status": 3
  }
}
```

---

### 4.3 双闭环状态

**端点**: `POST /api/v1/tools/ghics_am_loops`

```bash
curl -X POST http://localhost:3004/api/v1/tools/ghics_am_loops -d '{}'
```

**响应**:
```json
{
  "innerLoop": {
    "name": "一阶控制闭环",
    "path": ["L2", "L3", "L2"],
    "active": false,
    "executions": 0,
    "stabilityScore": 1
  },
  "outerLoop": {
    "name": "二阶监督闭环",
    "path": ["L0-L4", "L4", "L5", "ALL"],
    "active": false,
    "executions": 0
  },
  "overallStability": 1
}
```

---

## 五、执行工具

### 5.1 自动编程

**端点**: `POST /api/v1/tools/auto_code`

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| vm | string | 是 | VM 名称 |
| prompt | string | 是 | 代码需求 |
| language | string | 否 | python/sh |
| provider | string | 否 | LLM 提供商 |
| timeout | number | 否 | 超时时间 |

**示例**:
```bash
curl -X POST http://localhost:3004/api/v1/tools/auto_code \
  -H 'Content-Type: application/json' \
  -d '{
    "vm": "lab",
    "prompt": "写一个 Hello World 程序",
    "language": "python"
  }'
```

---

### 5.2 远程执行

**端点**: `POST /api/v1/tools/remote_exec`

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| vm | string | 是 | VM 名称 |
| command | string | 是 | 执行命令 |

**示例**:
```bash
curl -X POST http://localhost:3004/api/v1/tools/remote_exec \
  -H 'Content-Type: application/json' \
  -d '{
    "vm": "lab",
    "command": "echo Hello Claw2EE"
  }'
```

**响应**:
```json
{
  "stdout": "Hello Claw2EE\n",
  "stderr": "",
  "success": true
}
```

---

### 5.3 执行历史

**端点**: `POST /api/v1/tools/execution_history`

```bash
curl -X POST http://localhost:3004/api/v1/tools/execution_history -d '{}'
```

---

## 六、完整调用示例

### 6.1 完整 G-HICS-AM 工作流

```bash
# 1. 健康检查
curl http://localhost:3004/health

# 2. 查看架构
curl -X POST http://localhost:3004/api/v1/tools/ghics_am_status -d '{}'

# 3. 计算哥德尔度量
curl -X POST http://localhost:3004/api/v1/tools/ghics_am_metrics \
  -d '{"llmComplexity": 100}'

# 4. 发送 MCP 控制指令
curl -X POST http://localhost:3004/api/v1/tools/ghics_am_mcp_send \
  -d '{"from":"L2","to":"L3","payload":"推理结果","type":"control"}'

# 5. 查看 MCP 队列
curl -X POST http://localhost:3004/api/v1/tools/ghics_am_mcp_queue -d '{}'

# 6. 查看双闭环状态
curl -X POST http://localhost:3004/api/v1/tools/ghics_am_loops -d '{}'

# 7. LLM 调用
curl -X POST http://localhost:3004/api/v1/tools/llm_query \
  -d '{"provider":,"prompt":"解释 G-HICS-AM"}'

# 8. 远程执行
curl -X POST http://localhost:3004/api/v1/tools/remote_exec \
  -d '{"vm":"lab","command":"uname -a"}'
```

---

### 6.2 JavaScript SDK 风格

```javascript
const http = require('http');

const BASE = 'http://localhost:3004';

function call(tool, params = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(params);
    const req = http.request(`${BASE}/api/v1/tools/${tool}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// 使用
call('llm_query', { provider: 'wisemodel', prompt: '你好' })
  .then(console.log);

call('ghics_am_mcp_send', {
  from: 'L2', to: 'L3', 
  payload: { claim: 'test' }, type: 'control'
}).then(console.log);
```

---

## 七、错误处理

### 7.1 常见错误

| 错误 | 说明 | 解决方案 |
|------|------|----------|
| 404 | 工具不存在 | 检查工具名称 |
| 504 | 超时 | 增加 timeout |
| 500 | 服务错误 | 查看日志 |
| Connection refused | 服务未启动 | 启动服务 |

### 7.2 错误响应格式

```json
{
  "error": "工具名称错误"
}
```

---

## 八、端口映射

| 端口 | 服务 | 说明 |
|------|------|------|
| 3000 | 基础版 | 原始版本 |
| 3001 | HIS 边车 | his-sidecar |
| 3002 | G-HICS | index-ghics |
| 3003 | G-HICS-AM | index-ghics-am |
| **3004** | **企业版** | **index-enterprise** ⭐ |
| 3100 | MCP | mcp-server |
| 5000 | Meteor | IM 服务 |
| 8082 | WebSocket | WS 服务 |

---

**服务**: http://localhost:3004  
**文档**: README.md, MCP-COMPLETE-BRIEF.md
