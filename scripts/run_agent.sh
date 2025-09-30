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

# If we're not launching the CLI, print friendly next steps.
if [[ -z "$CLI_CMD" ]]; then
  echo "Sync-only mode: will clone/update repos, apply policy, and then exit without starting Codex." >&2
  echo "Next steps:" >&2
  echo "  - To open a shell in the container: PERSIST_POLICY=1 CODEX_CLI_COMMAND=\"/bin/bash\" scripts/run_agent.sh" >&2
  echo "  - Inside the container: run 'codex auth login' (first time) and then 'codex run'." >&2
  echo "  - If a container is already running: docker exec -it $NAME /bin/bash" >&2
fi

# Port publishing for Codex browser login callback
# Publish only when explicitly requested or when AUTH_LOGIN=1
if [[ -z "${PUBLISH_AUTH_PORT:-}" ]]; then
  if [[ "$AUTH_LOGIN" == "1" ]]; then
    PUBLISH_AUTH_PORT=1
  else
    PUBLISH_AUTH_PORT=0
  fi
fi
AUTH_PORT="${AUTH_PORT:-}"
AUTH_PORT_RANGE="${AUTH_PORT_RANGE:-1455-1465}"

# Optional: persist the entire container home (/root) between runs.
# This guarantees Codex credentials are saved even if the CLI writes outside .openai/.codex.
PERSIST_HOME="${PERSIST_HOME:-0}"

CREDS_MOUNTS=()
EXTRA_ENVS=()
# Always persist CLI credentials/policy when doing browser login unless the caller disables it.
if [[ "$AUTH_LOGIN" == "1" && "${PERSIST_POLICY:-unset}" == "unset" ]]; then
  PERSIST_POLICY=1
fi
if [[ "${PERSIST_HOME}" == "1" ]]; then
  mkdir -p "$PWD/.container_home" >/dev/null 2>&1 || true
  echo "Persisting entire container home to .container_home/ (strongest persistence)." >&2
  CREDS_MOUNTS=(-v "$PWD/.container_home:/root")
elif [[ "${PERSIST_POLICY:-0}" == "1" ]]; then
  mkdir -p "$PWD/.codex" >/dev/null 2>&1 || true
  mkdir -p "$PWD/.openai" >/dev/null 2>&1 || true
  CREDS_MOUNTS=(
    -v "$PWD/.codex:/root/.config/codex"
    -v "$PWD/.openai:/root/.config/openai"
  )
fi

# Flexible GitHub auth options
MOUNT_SSH="${MOUNT_SSH:-0}"
FORWARD_SSH_AGENT="${FORWARD_SSH_AGENT:-0}"
if [[ "$MOUNT_SSH" == "1" && -d "$HOME/.ssh" ]]; then
  echo "Mounting host SSH keys from $HOME/.ssh (read-only)." >&2
  CREDS_MOUNTS+=( -v "$HOME/.ssh:/root/.ssh:ro" )
fi
if [[ "$FORWARD_SSH_AGENT" == "1" && -n "${SSH_AUTH_SOCK:-}" ]]; then
  echo "Forwarding SSH agent from host." >&2
  CREDS_MOUNTS+=( -v "$SSH_AUTH_SOCK:/ssh-agent" )
  EXTRA_ENVS+=( -e SSH_AUTH_SOCK=/ssh-agent )
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
    echo "Container '$NAME' is already running." >&2
    echo "To connect: docker exec -it $NAME /bin/bash" >&2
    echo "To stop:    docker stop $NAME" >&2
    exit 0
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
  -e GITHUB_TOKEN="${GITHUB_TOKEN:-}" \
  -e GH_TOKEN="${GH_TOKEN:-}" \
  -e GIT_TERMINAL_PROMPT=0 \
  -e GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=accept-new" \
  -e CODEX_CLI_COMMAND="$CLI_CMD" \
  "${EXTRA_ENVS[@]}" \
  "$IMAGE"
