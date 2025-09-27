#!/usr/bin/env bash
set -euo pipefail

IMAGE="${IMAGE:-ai-agent-toolkit:latest}"
NAME="${NAME:-codex-agent}"
CONFIG_DIR="${CONFIG_DIR:-$PWD/config}"
WORK_DIR="${WORK_DIR:-$PWD/workspaces}"
SCRIPTS_DIR="${SCRIPTS_DIR:-$PWD/scripts}"
# When AUTH_LOGIN=1, default to interactive browser login then run the agent.
# Auto-enable browser login if no API key is present and not requesting shell access
if [[ -z "${OPENAI_API_KEY:-}" && "${CODEX_CLI_COMMAND:-}" != "/bin/bash" && -z "${AUTH_LOGIN:-}" ]]; then
  AUTH_LOGIN="1"
  echo "No API key found. Automatically enabling browser login..." >&2
else
  AUTH_LOGIN="${AUTH_LOGIN:-0}"
fi

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

CREDS_MOUNTS=()
# Always persist CLI credentials/policy when doing browser login unless the caller disables it.
if [[ "$AUTH_LOGIN" == "1" && "${PERSIST_POLICY:-unset}" == "unset" ]]; then
  PERSIST_POLICY=1
fi
if [[ "${PERSIST_POLICY:-0}" == "1" ]]; then
  mkdir -p "$PWD/.codex" >/dev/null 2>&1 || true
  mkdir -p "$PWD/.openai" >/dev/null 2>&1 || true
  CREDS_MOUNTS=(
    -v "$PWD/.codex:/root/.config/codex"
    -v "$PWD/.openai:/root/.config/openai"
  )
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

# Check if container with same name exists and handle it
if docker ps -a --format '{{.Names}}' | grep -q "^${NAME}$"; then
  echo "Found existing container '$NAME'. Checking status..." >&2
  if docker ps --format '{{.Names}}' | grep -q "^${NAME}$"; then
    echo "Container '$NAME' is running. Connecting to existing container..." >&2
    echo "Use 'docker stop $NAME' if you want to start fresh." >&2
    exec docker exec -it "$NAME" /bin/bash
  else
    echo "Removing stopped container '$NAME'..." >&2
    if ! docker rm "$NAME" 2>/dev/null; then
      echo "Failed to remove container '$NAME'. Trying with force..." >&2
      docker rm -f "$NAME" 2>/dev/null || {
        echo "Error: Could not remove existing container '$NAME'." >&2
        echo "Please run: docker rm -f $NAME" >&2
        exit 1
      }
    fi
  fi
fi

if [[ "$AUTH_LOGIN" == "1" ]]; then
  echo "Browser-login mode: will run 'codex auth login' inside the container, then 'codex run'." >&2
fi

exec docker run --rm -it --name "$NAME" \
  -v "$CONFIG_DIR:/opt/agent/config" \
  -v "$WORK_DIR:/workspaces" \
  -v "$SCRIPTS_DIR:/opt/agent/scripts" \
  "${CREDS_MOUNTS[@]}" \
  "${PUBLISH_FLAGS[@]}" \
  -e OPENAI_API_KEY="${OPENAI_API_KEY:-}" \
  -e CODEX_CLI_COMMAND="$CLI_CMD" \
  "$IMAGE"
