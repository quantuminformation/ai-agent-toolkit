# Codex CLI setup workflow

This guide explains how to prepare the Docker image and start the Codex CLI agent with the configuration system provided in this repository. The container uses a lightweight Node.js bootstrap script to clone repositories, enforce network policy, and launch the Codex CLI command you supply.

## 1. Prerequisites

Before you start, make sure the following items are ready:

1. **Docker installed locally.** Verify with `docker version`; install Docker Desktop or the Linux packages if the command is not found.
2. **An OpenAI API key** with access to the Codex-compatible endpoints. You can create one at <https://platform.openai.com/account/api-keys>. Keep the key handy—you will provide it to the container in a later step.
3. **Access to the spec and source repositories** the agent should work with. Confirm that the URLs are reachable from your machine and that you have credentials if they are private.

## 2. Prepare the configuration

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

## 3. Build the Docker image

```bash
docker build -t ai-agent-toolkit:latest -f docker/Dockerfile .
```

## 4. Start the container

Create a directory to host your repositories and mount it into the container:

```bash
mkdir -p workspaces
```

Then launch the container. Replace `sk-...` with your actual OpenAI API key. The quotes keep special characters in the key from being interpreted by the shell.

```bash
docker run --rm \
  -v "$PWD/config:/opt/agent/config" \
  -v "$PWD/workspaces:/workspaces" \
  -e OPENAI_API_KEY="sk-..." \
  -e CODEX_CLI_COMMAND="codex-cli run --config /opt/agent/runtime/network_policy.json" \
  ai-agent-toolkit:latest
```

The entrypoint performs the following tasks:

1. Reads `/opt/agent/config/agent_config.json` (or falls back to the example file if it is missing).
2. Clones or updates the spec and source repositories under `/workspaces`.
3. Exports environment variables that convey the effective network policy.
4. Executes the seed data script, if configured.
5. Starts the Codex CLI command defined by `CODEX_CLI_COMMAND`.

## 5. “Logging in” to the container for interactive access

Sometimes you will want to inspect the cloned repositories or run a Codex CLI command manually. Follow these steps:

1. Start the container in the background so it keeps running after you close the terminal. Add the `-d` flag to the previous `docker run` command and remove `--rm` if you want the container to stick around after it stops:
   ```bash
   docker run -d \
     -v "$PWD/config:/opt/agent/config" \
     -v "$PWD/workspaces:/workspaces" \
     -e OPENAI_API_KEY="sk-..." \
     -e CODEX_CLI_COMMAND="codex-cli run --config /opt/agent/runtime/network_policy.json" \
     ai-agent-toolkit:latest
   ```
2. List containers to find the ID:
   ```bash
   docker ps
   ```
3. Open an interactive shell inside the running container:
   ```bash
   docker exec -it <container_id> /bin/bash
   ```
4. Once inside, you will find:
   * Configuration under `/opt/agent` (including `agent_config.json`).
   * Cloned repositories in `/workspaces/<configured_path>`.
   * The `OPENAI_API_KEY` environment variable already exported (`echo $OPENAI_API_KEY`).

Exit the shell with `exit` when you are done. The container keeps running until you stop it with `docker stop <container_id>`.

## 6. Verify Codex CLI connectivity

With the container running (either through the standard or detached command), you can confirm that the Codex CLI can reach OpenAI:

1. Attach to the container shell using `docker exec -it <container_id> /bin/bash` if you are not already inside.
2. Check that the API key is present: `echo $OPENAI_API_KEY`.
3. Run a simple Codex CLI command, for example:
   ```bash
   codex-cli status
   ```
   Replace `status` with the command relevant to your workflow. A successful response indicates the key is valid and the CLI can connect to OpenAI.

If the CLI cannot authenticate, double-check that the `OPENAI_API_KEY` value is correct and that your network policy allows access to the OpenAI endpoints.

## 7. Enforcing network policies

The bootstrap script writes the effective policy to `/opt/agent/runtime/network_policy.json`. This file can be consumed by network tooling or wrapper scripts to configure firewall rules or HTTP proxies. A simple pattern is to pair the container with a sidecar that reads the JSON and programs `iptables` accordingly.

## 8. Updating the configuration

Changes to `agent_config.json` take effect the next time the container starts. To test different access levels, edit `internet_access.mode` and toggle `allow_unrestricted_mode` as needed. The script always checks the flag before enabling unrestricted access.

