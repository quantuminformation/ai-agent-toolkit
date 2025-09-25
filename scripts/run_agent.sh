#!/usr/bin/env bash
set -euo pipefail

IMAGE="${IMAGE:-ai-agent-toolkit:latest}"
NAME="${NAME:-codex-agent}"
CONFIG_DIR="${CONFIG_DIR:-$PWD/config}"
WORK_DIR="${WORK_DIR:-$PWD/workspaces}"
SCRIPTS_DIR="${SCRIPTS_DIR:-$PWD/scripts}"
CLI_CMD="${CODEX_CLI_COMMAND:-codex run}"

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "OPENAI_API_KEY is not set in your shell. Export it before running." >&2
  exit 1
fi

POLICY_MOUNT=()
if [[ "${PERSIST_POLICY:-0}" == "1" ]]; then
  mkdir -p "$PWD/.codex" >/dev/null 2>&1 || true
  POLICY_MOUNT=(-v "$PWD/.codex:/root/.config/codex")
fi

exec docker run --rm -it --name "$NAME" \
  -v "$CONFIG_DIR:/opt/agent/config" \
  -v "$WORK_DIR:/workspaces" \
  -v "$SCRIPTS_DIR:/opt/agent/scripts" \
  "${POLICY_MOUNT[@]}" \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  -e CODEX_CLI_COMMAND="$CLI_CMD" \
  "$IMAGE"
