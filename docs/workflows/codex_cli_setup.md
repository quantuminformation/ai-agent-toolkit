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
docker run --rm --name ai-agent-toolkit \
  -v "$PWD/config:/opt/agent/config" \
  -v "$PWD/workspaces:/workspaces" \
  --add-host host.docker.internal:host-gateway \
  -e CODEX_CLI_COMMAND="codex-cli run --config /opt/agent/runtime/network_policy.json" \
  ai-agent-toolkit:latest
```

The `--add-host` flag makes the special hostname
`host.docker.internal` resolve to the host machine on Linux. That gives
the agent direct access to the host's internet connection (e.g., HTTP
proxies or VPN tunnels) whenever the configuration allows network
usage. Docker Desktop performs this mapping automatically on macOS and
Windows, so the flag is optional on those platforms.

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

## 6. Connecting to a remote VM

When the toolkit runs on a remote server, SSH provides the most direct way to inspect the environment:

```bash
ssh YOUR_USER@YOUR_VM_IP
```

Once connected you can confirm that the container is active, stream its logs, or open an interactive shell:

```bash
docker ps
docker logs --follow ai-agent-toolkit
docker exec -it ai-agent-toolkit /bin/bash
```

Inside the container, the helper has already cloned the repositories under `/workspaces` and written the network policy to `/opt/agent/runtime/network_policy.json`.

## 7. Running ad-hoc Codex CLI commands

By default the entrypoint invokes the command stored in the `CODEX_CLI_COMMAND` environment variable. You can override it when launching the container:

```bash
docker run --rm --name ai-agent-toolkit \
  -v "$PWD/config:/opt/agent/config" \
  -v "$PWD/workspaces:/workspaces" \
  --add-host host.docker.internal:host-gateway \
  -e CODEX_CLI_COMMAND="codex-cli run --config /opt/agent/runtime/network_policy.json" \
  ai-agent-toolkit:latest
```

To run additional commands after the container is up, use `docker exec`:

```bash
docker exec -it ai-agent-toolkit codex-cli status
docker exec -it ai-agent-toolkit codex-cli tasks list
```

These invocations respect the same environment variables and network policy exported by the bootstrapper.

## 8. Selecting a Codex model

The Codex CLI exposes a `--model` flag that lets you target different service tiers (for example, `codex-medium` or `codex-high`). To discover the identifiers available to your account, run:

```bash
codex-cli models list
```

Then pass the desired model name to the `run` command. You can bake this into the startup command:

```bash
docker run --rm --name ai-agent-toolkit \
  -v "$PWD/config:/opt/agent/config" \
  -v "$PWD/workspaces:/workspaces" \
  --add-host host.docker.internal:host-gateway \
  -e CODEX_CLI_COMMAND="codex-cli run --model codex-high --config /opt/agent/runtime/network_policy.json" \
  ai-agent-toolkit:latest
```

Or adjust it interactively once inside the container:

```bash
docker exec -it ai-agent-toolkit codex-cli run --model codex-medium --task-file /workspaces/specs/tickets/123.md
```

Any model choice will still be constrained by the policy produced from `agent_config.json`; unrestricted mode only activates when `allow_unrestricted_mode` is `true`.

