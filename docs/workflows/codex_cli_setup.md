# Codex CLI setup workflow

This guide explains how to prepare the Docker image and start the Codex CLI agent with the configuration system provided in this repository. The container uses a lightweight Node.js bootstrap script to clone repositories, enforce network policy, and launch the Codex CLI command you supply.

## 1. Prepare the configuration

1. Copy the example configuration and edit it to match your environment.
   ```bash
   cp config/agent_config.example.json config/agent_config.json
   $EDITOR config/agent_config.json
   ```
2. Update the spec and source repository URLs, branches, and clone paths.
3. Choose the desired `internet_access.mode`:
   * `offline` – Blocks all outbound connectivity for the agent.
   * `codex_common` – Restricts egress to the curated allowlist defined in `internet_access.allowed_sites`.
   * `unrestricted` – Allows full internet access **only** when `allow_unrestricted_mode` is set to `true`.
4. Leave `allow_unrestricted_mode` set to `false` unless the environment has been assessed and the agent should operate without restrictions.

## 2. Build the Docker image

```bash
docker build -t ai-agent-toolkit:latest -f docker/Dockerfile .
```

## 3. Start the container

Create a directory to host your repositories and mount it into the container:

```bash
mkdir -p workspaces
```

Then launch the container:

```bash
docker run --rm \
  -v "$PWD/config:/opt/agent/config" \
  -v "$PWD/workspaces:/workspaces" \
  -e CODEX_CLI_COMMAND="codex-cli run --config /opt/agent/runtime/network_policy.json" \
  ai-agent-toolkit:latest
```

The entrypoint performs the following tasks:

1. Reads `/opt/agent/config/agent_config.json` (or falls back to the example file if it is missing).
2. Clones or updates the spec and source repositories under `/workspaces`.
3. Exports environment variables that convey the effective network policy.
4. Executes the seed data script, if configured.
5. Starts the Codex CLI command defined by `CODEX_CLI_COMMAND`.

## 4. Enforcing network policies

The bootstrap script writes the effective policy to `/opt/agent/runtime/network_policy.json`. This file can be consumed by network tooling or wrapper scripts to configure firewall rules or HTTP proxies. A simple pattern is to pair the container with a sidecar that reads the JSON and programs `iptables` accordingly.

## 5. Updating the configuration

Changes to `agent_config.json` take effect the next time the container starts. To test different access levels, edit `internet_access.mode` and toggle `allow_unrestricted_mode` as needed. The script always checks the flag before enabling unrestricted access.

