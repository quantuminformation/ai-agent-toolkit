#!/bin/sh
set -e

CONFIG_PATH=${AGENT_CONFIG_PATH:-/opt/agent/config/agent_config.json}

if [ ! -f "$CONFIG_PATH" ]; then
  echo "Configuration file not found at $CONFIG_PATH."
  if [ -f /opt/agent/config/agent_config.example.json ]; then
    echo "Using example configuration instead."
    export AGENT_CONFIG_PATH=/opt/agent/config/agent_config.example.json
  else
    exit 1
  fi
fi

exec /opt/agent/scripts/bootstrap_agent.js
