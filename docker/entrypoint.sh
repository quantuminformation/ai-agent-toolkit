#!/usr/bin/env bash
set -Eeuo pipefail

CONFIG_PATH=${AGENT_CONFIG_PATH:-/opt/agent/config/agent_config.json}

if [[ ! -f "$CONFIG_PATH" ]]; then
  echo "Configuration file not found at $CONFIG_PATH."
  if [[ -f /opt/agent/config/agent_config.example.json ]]; then
    echo "Using example configuration instead."
    export AGENT_CONFIG_PATH=/opt/agent/config/agent_config.example.json
  else
    exit 1
  fi
fi

# Run seed script if present
SEED="/opt/agent/scripts/seed_data.sh"
if [[ -x "$SEED" ]]; then
  "$SEED"
fi

# Start port forwarders for auth callback so host can reach CLI's localhost listener
if command -v socat >/dev/null 2>&1; then
  CONTAINER_IP=$(getent hosts "$(hostname)" | awk '{print $1; exit}')
  if [[ -n "$CONTAINER_IP" ]]; then
    for p in $(seq 1455 1465); do
      # Bind specifically to the container IP to avoid conflicts with 127.0.0.1 bindings
      socat TCP-LISTEN:$p,bind=$CONTAINER_IP,fork,reuseaddr TCP:127.0.0.1:$p >/dev/null 2>&1 &
    done
  fi
fi

# Finally, run the agent
exec node /opt/agent/scripts/bootstrap_agent.js
