#!/usr/bin/env bash
set -euo pipefail

IMAGE="${IMAGE:-ai-agent-toolkit:latest}"
NAME="${NAME:-codex-agent}"
CONFIG_DIR="${CONFIG_DIR:-$PWD/config}"
WORK_DIR="${WORK_DIR:-$PWD/workspaces}"
SCRIPTS_DIR="${SCRIPTS_DIR:-$PWD/scripts}"
# When AUTH_LOGIN=1, default to interactive browser login then run the agent.
AUTH_LOGIN="${AUTH_LOGIN:-0}"
CLI_CMD_DEFAULT="codex run"
if [[ "$AUTH_LOGIN" == "1" ]]; then
  CLI_CMD_DEFAULT="codex auth login && codex run"
fi
CLI_CMD="${CODEX_CLI_COMMAND:-$CLI_CMD_DEFAULT}"

# Port publishing for Codex browser login callback
# By default, publish a small range so the login flow works even if the CLI picks
# a non-default port. You can disable with PUBLISH_AUTH_PORT=0 or override the
# exact port(s) with AUTH_PORT or AUTH_PORT_RANGE.
PUBLISH_AUTH_PORT="${PUBLISH_AUTH_PORT:-1}"
AUTH_PORT="${AUTH_PORT:-}"
AUTH_PORT_RANGE="${AUTH_PORT_RANGE:-1455-1465}"

# Require API key unless doing browser login.
if [[ -z "${OPENAI_API_KEY:-}" && "$AUTH_LOGIN" != "1" ]]; then
  echo "OPENAI_API_KEY is not set in your shell. Export it or run with AUTH_LOGIN=1 for browser login." >&2
  exit 1
fi

POLICY_MOUNT=()
# Always persist CLI credentials/policy when doing browser login unless the caller disables it.
if [[ "$AUTH_LOGIN" == "1" && "${PERSIST_POLICY:-unset}" == "unset" ]]; then
  PERSIST_POLICY=1
fi
if [[ "${PERSIST_POLICY:-0}" == "1" ]]; then
  mkdir -p "$PWD/.codex" >/dev/null 2>&1 || true
  POLICY_MOUNT=(-v "$PWD/.codex:/root/.config/codex")
fi

PUBLISH_FLAGS=()
if [[ "$PUBLISH_AUTH_PORT" == "1" ]]; then
  if [[ -n "$AUTH_PORT" ]]; then
    PUBLISH_FLAGS=(-p "$AUTH_PORT:$AUTH_PORT")
    echo "Publishing auth callback port $AUTH_PORT → host (ctrl+click login links will work)" >&2
  else
    PUBLISH_FLAGS=(-p "$AUTH_PORT_RANGE:$AUTH_PORT_RANGE")
    echo "Publishing auth callback port range $AUTH_PORT_RANGE → host (covers Codex dynamic ports)" >&2
  fi
fi

if [[ "$AUTH_LOGIN" == "1" ]]; then
  echo "Browser-login mode: will run 'codex auth login' inside the container, then 'codex run'." >&2
fi

exec docker run --rm -it --name "$NAME" \
  -v "$CONFIG_DIR:/opt/agent/config" \
  -v "$WORK_DIR:/workspaces" \
  -v "$SCRIPTS_DIR:/opt/agent/scripts" \
  "${POLICY_MOUNT[@]}" \
  "${PUBLISH_FLAGS[@]}" \
  -e OPENAI_API_KEY="${OPENAI_API_KEY:-}" \
  -e CODEX_CLI_COMMAND="$CLI_CMD" \
  "$IMAGE"
