# Codex CLI Setup (Consolidated)

This guide has been merged into README.md to avoid duplication.

- Quick start: see README.md#quick-start
- Common commands: see README.md#common-commands
- Troubleshooting: see README.md#troubleshooting

Recommended commands:

- API key

```
export OPENAI_API_KEY="{{OPENAI_API_KEY}}"
scripts/run_agent.sh
```

- Browser login (no API key)

```
AUTH_LOGIN=1 PERSIST_POLICY=1 scripts/run_agent.sh
```
