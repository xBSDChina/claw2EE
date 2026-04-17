# Claw2EE MCP 调用说明

> 版本: 1.0.0 | 更新: 2026-04-15

## 概述

Claw2EE 企业版支持 MCP (Model Context Protocol) 协议，提供两种服务模式：

| 端口 | 服务 | 协议 | 用途 |
|------|------|------|------|
| **3000** | 主服务 | REST API | LLM 调用、自动编程、存储 |
| **3100** | HIS MCP | JSON-RPC (MCP) | 六层架构监督、风险评估 |

---

## MCP 端点

```
HTTP POST http://192.168.122.150:3100/mcp
```

---

## 快速开始

### 1. 初始化连接

```bash
curl -X POST http://192.168.122.150:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "id": 1,
    "params": {
      "protocolVersion": "2024-11-05",
      "clientInfo": {"name": "my-client", "version": "1.0.0"}
    }
  }'
```

**响应:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {"listChanged": true},
      "resources": {"subscribe": true, "listChanged": true},
      "prompts": {"listChanged": true}
    },
    "serverInfo": {
      "name": "claw2ee-his-mcp",
      "version": "1.0.0",
      "description": "Claw2EE HIS (Hierarchical Incomplete Supervision) MCP Server"
    }
  }
}
```

---

### 2. 列出可用工具

```bash
curl -X POST http://192.168.122.150:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 2,
    "params": {}
  }'
```

**响应 (18 个 HIS 工具):**

| 工具名 | 层级 | 功能 |
|--------|------|------|
| `his_health` | L5 | 健康检查 |
| `his_veto` | L5 | 最高权限否决 |
| `his_circuit_breaker` | L5 | 熔断器控制 |
| `his_audit` | L4 | 跨层一致性审计 |
| `his_blindspot` | L4 | 标记盲区 |
| `his_get_blindspots` | L4 | 获取盲区列表 |
| `his_align` | L3 | 目标对齐检查 |
| `his_risk_assess` | L3 | 风险评估 |
| `his_understand` | L2 | 语义理解 |
| `his_predict` | L2 | 状态预测 |
| `his_generate_plan` | L2 | 生成候选方案 |
| `his_prove` | L1 | 逻辑证明 |
| `his_compute` | L1 | 数学计算 |
| `his_check_consistency` | L1 | 一致性检查 |
| `his_perceive` | L0 | 感知输入 |
| `his_read_memory` | L0 | 读取短期记忆 |
| `his_write_memory` | L0 | 写入短期记忆 |
| `his_status` | ALL | 整体状态 |

---

### 3. 调用工具

#### 格式

```bash
curl -X POST http://192.168.122.150:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "id": <ID>,
    "params": {
      "name": "<工具名>",
      "arguments": {
        <参数>
      }
    }
  }'
```

---

## HIS 六层调用示例

### L5: 稳态控制层

#### 健康检查

```bash
curl -X POST http://192.168.122.150:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "id": 10,
    "params": {
      "name": "his_health",
      "arguments": {}
    }
  }'
```

**响应:**
```json
{
  "jsonrpc": "2.0",
  "id": 10,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"status\":\"healthy\",\"uptime\":3600,\"cb\":false,\"errors\":0}"
    }]
  }
}
```

#### 风险评估 (Veto 检查)

```bash
curl -X POST http://192.168.122.150:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "id": 11,
    "params": {
      "name": "his_risk_assess",
      "arguments": {
        "plan": "execute rm -rf /tmp"
      }
    }
  }'
```

**响应:**
```json
{
  "jsonrpc": "2.0",
  "id": 11,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"level\":\"critical\",\"risks\":[\"rm -rf\"],\"approved\":false}"
    }]
  }
}
```

#### 最高权限否决

```bash
curl -X POST http://192.168.122.150:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "id": 12,
    "params": {
      "name": "his_veto",
      "arguments": {
        "output": "I will run: DROP DATABASE production;"
      }
    }
  }'
```

**响应:**
```json
{
  "jsonrpc": "2.0",
  "id": 12,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"vetoed\":true,\"reason\":\"drop database\"}"
    }]
  }
}
```

#### 熔断器控制

```bash
# 查看状态
curl -X POST http://192.168.122.150:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "id": 13,
    "params": {
      "name": "his_circuit_breaker",
      "arguments": {"action": "status"}
    }
  }'

# 重置熔断器
curl -X POST http://192.168.122.150:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "id": 14,
    "params": {
      "name": "his_circuit_breaker",
      "arguments": {"action": "reset"}
    }
  }'
```

---

### L4: 元认知监督层

#### 跨层一致性审计

```bash
curl -X POST http://192.168.122.150:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "id": 20,
    "params": {
      "name": "his_audit",
      "arguments": {
        "l1": {"claim": "operation succeeded"},
        "l2": {"claim": "operation failed"},
        "l3": {}
      }
    }
  }'
```

**响应:**
```json
{
  "jsonrpc": "2.0",
  "id": 20,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"ts\":1776299999999,\"status\":\"contradiction\",\"issues\":[\"L1-L2\"]}"
    }]
  }
}
```

#### 标记盲区

```bash
curl -X POST http://192.168.122.150:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "id": 21,
    "params": {
      "name": "his_blindspot",
      "arguments": {
        "query": "quantum encryption",
        "reason": "no prior knowledge in this domain"
      }
    }
  }'
```

#### 获取盲区列表

```bash
curl -X POST http://192.168.122.150:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "id": 22,
    "params": {
      "name": "his_get_blindspots",
      "arguments": {}
    }
  }'
```

---

### L3: 价值与安全层

#### 目标对齐检查

```bash
curl -X POST http://192.168.122.150:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "id": 30,
    "params": {
      "name": "his_align",
      "arguments": {
        "plan": {"action": "create_file", "target": "readme.md"},
        "goal": "create a documentation file for the project"
      }
    }
  }'
```

**响应:**
```json
{
  "jsonrpc": "2.0",
  "id": 30,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"score\":0.6,\"aligned\":true}"
    }]
  }
}
```

---

### L2: 世界模型层

#### 语义理解

```bash
curl -X POST http://192.168.122.150:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "id": 40,
    "params": {
      "name": "his_understand",
      "arguments": {
        "query": "create a new Python virtual environment"
      }
    }
  }'
```

**响应:**
```json
{
  "jsonrpc": "2.0",
  "id": 40,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"action\":\"create\",\"target\":\"file\",\"confidence\":0.85}"
    }]
  }
}
```

#### 生成候选方案

```bash
curl -X POST http://192.168.122.150:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "id": 41,
    "params": {
      "name": "his_generate_plan",
      "arguments": {
        "goal": "deploy the application to production"
      }
    }
  }'
```

---

### L1: 符号推理层

#### 数学计算

```bash
curl -X POST http://192.168.122.150:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "id": 50,
    "params": {
      "name": "his_compute",
      "arguments": {
        "expr": "2 + 3 * 4"
      }
    }
  }'
```

**响应:**
```json
{
  "jsonrpc": "2.0",
  "id": 50,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"result\":14,\"safe\":true}"
    }]
  }
}
```

#### 一致性检查

```bash
curl -X POST http://192.168.122.150:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "id": 51,
    "params": {
      "name": "his_check_consistency",
      "arguments": {
        "statements": [
          "the system is running",
          "the system has failed",
          "all tests passed"
        ]
      }
    }
  }'
```

---

### L0: 感知执行层

#### 感知输入

```bash
curl -X POST http://192.168.122.150:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "id": 60,
    "params": {
      "name": "his_perceive",
      "arguments": {
        "input": "User requested file creation at 14:30"
      }
    }
  }'
```

#### 写入短期记忆

```bash
curl -X POST http://192.168.122.150:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "id": 61,
    "params": {
      "name": "his_write_memory",
      "arguments": {
        "fact": "Important: backup scheduled for midnight"
      }
    }
  }'
```

#### 读取短期记忆

```bash
curl -X POST http://192.168.122.150:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "id": 62,
    "params": {
      "name": "his_read_memory",
      "arguments": {}
    }
  }'
```

---

### 整体状态

```bash
curl -X POST http://192.168.122.150:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "id": 99,
    "params": {
      "name": "his_status",
      "arguments": {}
    }
  }'
```

**响应:**
```json
{
  "jsonrpc": "2.0",
  "id": 99,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"protocol\":\"mcp\",\"version\":\"1.0\",\"layers\":{\"L0\":{\"name\":\"感知执行层\",\"memory\":5},\"L1\":{\"name\":\"符号推理层\",\"status\":\"active\"},\"L2\":{\"name\":\"世界模型层\",\"status\":\"active\"},\"L3\":{\"name\":\"价值与安全层\",\"rules\":5},\"L4\":{\"name\":\"元认知监督层\",\"audits\":1,\"blindspots\":1},\"L5\":{\"name\":\"稳态控制层\",\"health\":{\"status\":\"healthy\",\"cb\":false}}},\"total_tools\":18,\"timestamp\":1776300000000}"
    }]
  }
}
```

---

## MCP 资源

### 列出资源

```bash
curl -X POST http://192.168.122.150:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "resources/list",
    "id": 100,
    "params": {}
  }'
```

**响应:**
```json
{
  "jsonrpc": "2.0",
  "id": 100,
  "result": {
    "resources": [
      {"uri": "his://status", "name": "HIS Status", "mimeType": "application/json"},
      {"uri": "his://layers", "name": "HIS Layers", "mimeType": "application/json"},
      {"uri": "his://memory", "name": "HIS Memory", "mimeType": "application/json"},
      {"uri": "his://audits", "name": "HIS Audits", "mimeType": "application/json"}
    ]
  }
}
```

### 读取资源

```bash
curl -X POST http://192.168.122.150:3100/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "resources/read",
    "id": 101,
    "params": {"uri": "his://status"}
  }'
```

---

## 典型使用场景

### 场景 1: 执行前风险检查

```bash
# 1. 先理解意图
his_understand → "create file"

# 2. 风险评估
his_risk_assess → {level, risks, approved}

# 3. 如果 approved=false，阻止执行
if (!result.approved) {
  blockOperation(result.reason);
}
```

### 场景 2: 执行后一致性验证

```bash
# 1. 记录执行结果
his_perceive → {input, ts}

# 2. 一致性检查
his_check_consistency → {consistent, contradictions}

# 3. 如果矛盾，触发审计
if (!result.consistent) {
  his_audit(l1, l2, l3);
}
```

### 场景 3: 熔断器保护

```bash
# 检查健康状态
his_health → {status, cb, errors}

# 如果熔断器触发 (cb=true)
if (result.cb) {
  // 拒绝新请求，等待恢复
  return "Service temporarily unavailable";
}
```

---

## 错误处理

| 错误码 | 含义 |
|--------|------|
| `-32700` | Parse error - JSON 解析失败 |
| `-32600` | Invalid Request - 请求格式错误 |
| `-32601` | Method not found - 方法不存在 |
| `-32603` | Internal error - 内部错误 |

**示例错误响应:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32601,
    "message": "Method not found: tools/execute"
  }
}
```

---

## 文件

- `his-mcp.cjs` - MCP 服务器源码
- `claw2ee-config.json` - 配置文件

---

*文档版本: 1.0.0 | Claw2EE Enterprise*
