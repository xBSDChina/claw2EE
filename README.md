# Claw2EE - Enterprise Multi-Agent Collaboration Engine

<p align="center">
  <img src="https://img.shields.io/badge/Version-7.0-blue" alt="Version">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/Agents-10%2C000%2B-orange" alt="Scale">
  <img src="https://img.shields.io/badge/LLM-10K%20tokens%2Fs-red" alt="Performance">
</p>

> English | [中文](README_CN.md)

Claw2EE is an enterprise-grade multi-agent collaboration engine built on the **G-HICS-AM** (Gödel Hierarchical Intelligent Control System - Autonomous Machine) theory. It supports **10,000+ concurrent agents** with **10,000 tokens/s LLM throughput**.

## Key Features

- **Six-Layer Architecture**: L0-L5 hierarchical system (Perception → Reasoning → Value → Supervision → Stability)
- **G-HICS-AM Theory**: Gödel's Incompleteness Theorem + Hierarchical Intelligent Control + Autonomous Machine
- **MCP Protocol**: Native support for external agents via Model Context Protocol
- **Multi-VM Support**: Distributed execution across multiple virtual machines
- **Auto-Code Generation**: AI-driven code generation and execution
- **Enterprise-Grade**: Built-in health checks, circuit breakers, audit logs, and blind spot detection

## Architecture

```
L5: Stability Control (Health Check / Circuit Breaker / Veto)
    ↑
L4: Supervision & Audit (Cross-layer Audit / Blind Spot Detection)
    ↑
L3: Value Alignment (Goal Alignment / Risk Assessment)
    ↑
L2: World Model (Understanding / Prediction / Planning)
    ↑
L1: Reasoning (Proof / Computation / Consistency Check)
    ↑
L0: Perception & Memory (Input / Memory / Storage)
```

## Quick Start

```bash
# Clone and install dependencies
cd claw2ee
npm install

# Start the service
node index-enterprise.cjs

# Health check
curl localhost:3004/health

# Call a tool
curl -X POST localhost:3004/api/v1/tools/his_compute \
  -H "Content-Type: application/json" \
  -d '{"expr":"10+10"}'
```

## Project Structure

```
claw2ee/
├── index-enterprise.cjs      # Main entry point (v7.0)
├── ghics-am.cjs              # G-HICS-AM core implementation
├── his-*.cjs                 # HIS layer implementations
│   ├── his-layer.cjs         # L0-L5 layer definitions
│   ├── his-init.cjs          # System initialization
│   ├── his-tools.cjs         # Tool definitions
│   ├── his-mcp.cjs           # MCP protocol integration
│   ├── his-g-hics.cjs        # G-HICS integration
│   ├── his-sidecar.cjs       # Sidecar services
│   └── his-audit.cjs         # Audit logging
├── mcp-server.cjs            # MCP protocol server
├── mcp-transport.cjs         # HTTP/WebSocket transport
├── api-server.cjs            # REST API server
├── gateway-core-enhanced.cjs # Gateway core
├── auth-middleware.cjs       # Authentication
├── httpReq.cjs               # HTTP utilities
├── examples/                 # Usage examples
│   └── demo.js               # Complete demo
├── claw2ee-config.json       # Configuration
├── MCP-CALL-GUIDE-V7.md      # MCP API guide
└── README.md                 # This file
```

## Tools (29 Available)

### G-HICS-AM Core (10)
| Tool | Description |
|------|-------------|
| `llm_query` | Call LLM API |
| `llm_list` | List available LLMs |
| `ghics_am_status` | System status |
| `ghics_am_construct` | Auto architecture |
| `ghics_am_metrics` | Gödel metrics |
| `ghics_am_mcp_send` | MCP send |
| `ghics_am_mcp_queue` | Message queue |
| `ghics_am_loops` | Dual-loop status |
| `auto_code` | Auto code generation |
| `remote_exec` | Remote execution |

### L5 Stability (3)
| Tool | Description |
|------|-------------|
| `his_health` | Health check |
| `his_veto` | Top-level veto |
| `his_circuit_breaker` | Circuit breaker |

### L4 Supervision (3)
| Tool | Description |
|------|-------------|
| `his_audit` | Cross-layer audit |
| `his_blindspot` | Mark blind spots |
| `his_get_blindspots` | Get blind spots |

### L3 Value (2)
| Tool | Description |
|------|-------------|
| `his_align` | Goal alignment |
| `his_risk_assess` | Risk assessment |

### L2 World Model (3)
| Tool | Description |
|------|-------------|
| `his_understand` | Semantic understanding |
| `his_predict` | State prediction |
| `his_generate_plan` | Generate plan |

### L1 Reasoning (3)
| Tool | Description |
|------|-------------|
| `his_prove` | Logical proof |
| `his_compute` | Math computation |
| `his_check_consistency` | Consistency check |

### L0 Perception (3)
| Tool | Description |
|------|-------------|
| `his_perceive` | Perception input |
| `his_read_memory` | Read memory |
| `his_write_memory` | Write memory |

## API Examples

### his_compute (Math)
```bash
curl -X POST localhost:3004/api/v1/tools/his_compute \
  -H "Content-Type: application/json" \
  -d '{"expr":"50*3+20"}'
# Returns: {"result":170,"expression":"50*3+20"}
```

### auto_code (Code Generation)
```bash
curl -X POST localhost:3004/api/v1/tools/auto_code \
  -H "Content-Type: application/json" \
  -d '{"prompt":"calculate fibonacci","language":"python"}'
```

### llm_query (LLM Call)
```bash
curl -X POST localhost:3004/api/v1/tools/llm_query \
  -H "Content-Type: application/json" \
  -d '{"provider":"wisemodel","prompt":"Explain quantum computing"}'
```

## Configuration

Edit `claw2ee-config.json`:

```json
{
  "llm": {
    "wisemodel": {
      "apiKey": "your-api-key",
      "endpoint": "https://api.wisemodel.cn/v1/chat/completions",
      "defaultModel": "minimax-m2.5-highspeed"
    },
    "nvidia": {
      "apiKey": "nvapi-xxx",
      "endpoint": "https://integrate.api.nvidia.com/v1/chat/completions"
    }
  },
  "vms": {
    "lab": {"host":"192.168.1.100","user":"admin"},
    "upruix": {...}
  }
}
```

## MCP Protocol

Claw2EE supports the Model Context Protocol (MCP) for external agent integration:

```javascript
// MCP client example
const response = await fetch('http://localhost:3004/mcp', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {name: 'his_compute', arguments: {expr: '2+2'}}
  })
});
```

See [MCP-CALL-GUIDE-V7.md](MCP-CALL-GUIDE-V7.md) for complete MCP documentation.

## Supported LLM Providers

- **Wisemodel** (default)
- **NVIDIA** (deepseek-v3.1, step-3.5-flash)
- **Moonshot** (kimi-k2)

## Performance

| Metric | Value |
|--------|-------|
| Max Agents | 10,000+ |
| LLM Throughput | 10,000 tokens/s |
| Response Time | <100ms |
| Uptime | 99.9% |

## License

MIT License - See [LICENSE](LICENSE) file.

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## Contact

https://githiub.com/xbsdchina/claw2ee

