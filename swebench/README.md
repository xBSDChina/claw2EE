# Claw2EE SWE-bench Evaluation Mode

## Overview
Claw2EE supports SWE-bench evaluation mode for automated code patch generation benchmarking.

## Activation

### Environment Variable
```bash
export CLAW_EVAL_MODE=swebench
```

### Start in SWE-bench Mode
```bash
cd ~/claw2ee
CLAW_EVAL_MODE=swebench node index-enterprise.cjs
```

## Health Check

Check if SWE-bench mode is active:
```bash
curl -s localhost:3004/health
```

### SWE-bench Mode Response
```json
{
  "status": "healthy",
  "service": "claw2ee",
  "version": "7.0",
  "theory": "G-HICS-AM",
  "swebench_mode": true,
  "swebench_eval": "enabled",
  "extract_diff": true,
  "llm_output": "pure_diff_only"
}
```

### Normal Mode Response
```json
{
  "status": "healthy",
  "service": "claw2ee",
  "version": "7.0",
  "theory": "G-HICS-AM"
}
```

## LLM Output Processing

In SWE-bench mode:
1. All LLM responses pass through `extract_diff()`
2. Only pure diff format is returned
3. Invalid/missing diff returns error: `"SWEBENCH: No valid diff found"`

### Valid Diff Formats
- `diff --git a/file b/file`
- `--- a/file`
- `+++ b/file`
- `@@ -line,count +line,count @@`

### Error Response
```json
{
  "error": "SWEBENCH: No valid diff found"
}
```

## SWE-bench Integration

### API Endpoint
```bash
curl -X POST localhost:3004/api/v1/tools/llm_query \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": "wisemodel",
    "prompt": "Fix this bug: ...",
    "system": "You are a programmer. Return ONLY a git diff."
  }'
```

### Expected Response
```json
{
  "response": "diff --git a/app.py b/app.py\n--- a/app.py\n+++ b/app.py\n@@ -1,3 +1,3 @@\n-def add(a,b): return a-b\n+def add(a,b): return a+b\n",
  "swebench_mode": true
}
```

## Configuration

See `config_swebench.yaml` for SWE-bench specific settings.
