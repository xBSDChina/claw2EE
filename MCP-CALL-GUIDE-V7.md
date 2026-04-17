# Claw2EE v7.0 MCP 调用指南

> 版本: 7.0 | 理论: G-HICS-AM | 端口: 3004 | 工具数: 29

## 一、服务状态

```bash
curl localhost:3004/health
# 返回: {"status":"healthy","service":"claw2ee","version":"7.0","theory":"G-HICS-AM"}
```

---

## 二、工具总览 (29个)

### 1. G-HICS-AM 核心 (8个)
| 工具名 | 描述 |
|--------|------|
| `llm_query` | 调用LLM API |
| `llm_list` | 列出LLM |
| `ghics_am_status` | 系统状态 |
| `ghics_am_construct` | 自动构造 |
| `ghics_am_metrics` | 哥德尔度量 |
| `ghics_am_mcp_send` | MCP指令发送 |
| `ghics_am_mcp_queue` | 消息队列 |
| `ghics_am_loops` | 双闭环状态 |

### 2. 系统工具 (3个)
| 工具名 | 描述 |
|--------|------|
| `auto_code` | 自动编程 |
| `remote_exec` | 远程执行 |
| `execution_history` | 执行历史 |

---

## 三、HIS 工具 (18个) - L0-L5 六层架构

### L5 稳态层 (3个)
| 工具名 | 描述 |
|--------|------|
| `his_health` | 健康检查 |
| `his_veto` | 最高权限否决 |
| `his_circuit_breaker` | 熔断器 |

### L4 监督层 (3个)
| 工具名 | 描述 |
|--------|------|
| `his_audit` | 跨层审计 |
| `his_blindspot` | 标记盲区 |
| `his_get_blindspots` | 获取盲区 |

### L3 价值层 (2个)
| 工具名 | 描述 |
|--------|------|
| `his_align` | 目标对齐 |
| `his_risk_assess` | 风险评估 |

### L2 世界模型 (3个) ⭐ 更新
| 工具名 | 描述 |
|--------|------|
| `his_understand` | 语义理解 (支持修复/fix) |
| `his_predict` | 状态预测 (支持fixed) |
| `his_generate_plan` | 生成方案 (非空) |

### L1 推理层 (3个)
| 工具名 | 描述 |
|--------|------|
| `his_prove` | 逻辑证明 |
| `his_compute` | 数学计算 |
| `his_check_consistency` | 一致性检查 |

### L0 感知层 (3个)
| 工具名 | 描述 |
|--------|------|
| `his_perceive` | 感知输入 |
| `his_read_memory` | 读取记忆 |
| `his_write_memory` | 写入记忆 |

### 全局 (1个)
| 工具名 | 描述 |
|--------|------|
| `his_status` | 整体状态 |

---

## 四、调用示例

### his_understand (语义理解 - 支持修复任务)
```bash
curl -X POST localhost:3004/api/v1/tools/his_understand \
  -d '{"query":"修复内存泄漏"}'
# 返回: {"action":"fix","target":"file"}
```

### his_generate_plan (生成方案)
```bash
curl -X POST localhost:3004/api/v1/tools/his_generate_plan \
  -d '{"goal":"修复bug"}'
# 返回: {"plans":[{"type":"fix","tool":"auto_code","step":"analyze and fix code"}]}
```

### his_predict (状态预测)
```bash
curl -X POST localhost:3004/api/v1/tools/his_predict \
  -d '{"state":{"status":"fixed"}}'
# 返回: {"current":{"status":"fixed"},"next":{"status":"completed"},"confidence":0.95}
```

### his_compute (数学计算)
```bash
curl -X POST localhost:3004/api/v1/tools/his_compute \
  -d '{"expr":"100+200"}'
# 返回: {"result":300,"expression":"100+200"}
```

---

## 五、SWE-bench 评测支持

V7 已优化支持 SWE-bench 软件工程评测:

| 问题 | his_understand 响应 |
|------|---------------------|
| 修复内存泄漏 | action:fix, target:file |
| 修复bug | action:fix, target:code |
| 运行测试 | action:execute, target:unknown |

---

## 六、版本对比

| 项目 | v6 | v7 |
|------|----|-----|
| 工具数 | 18 | 29 |
| his_understand | 仅基础动作 | 支持 fix/修复 |
| his_generate_plan | 空方案 | 返回有效方案 |
| his_predict | 无 fixed | 支持 fixed→completed |
| SWE-bench | ❌ | ✅ 支持 |
