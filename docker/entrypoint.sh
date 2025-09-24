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

# Finally, run the agent
exec node /opt/agent/scripts/bootstrap_agent.js
