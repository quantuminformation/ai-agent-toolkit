# AI Agent Toolkit

This repository provides a minimal workflow for managing a Docker image that runs an AI coding agent (such as the Codex CLI) against two Git repositories:

* A **specification repository** that contains product requirements and task descriptions.
* A **source repository** that receives the generated implementation.

The repository delivers:

* A configuration format that lets operators declare the repositories that will be mounted inside the container, the level of internet access that the agent should receive, and whether unrestricted mode is permitted.
* Docker assets for building a base image that can host the Codex CLI agent with optional restrictions applied at runtime.
* Documentation describing how to prepare the Docker image and bootstrap the agent.

## Getting started

1. Copy `config/agent_config.example.json` to `config/agent_config.json` and update it with the correct repository URLs and desired access policy.
2. Build the Docker image (see [Docker image](#docker-image)).
3. Launch the container using the helper script so the configuration is applied.

## Configuration

The agent runtime is governed by `config/agent_config.json`. The file captures:

* `spec_repo` and `source_repo` – Git repository URLs and optional branch overrides that will be cloned into the container.
* `internet_access` – Controls whether the agent has no network connectivity, access to a curated list of common Codex documentation sites, or full unrestricted egress.
* `allow_unrestricted_mode` – A safety flag (default `false`). Even if the configuration requests unrestricted network access, the runtime will only honor it when this flag is explicitly set to `true`.

Consult [config/README.md](config/README.md) for field-level documentation.

## Docker image

The provided `docker/Dockerfile` builds a lightweight Node.js image with the prerequisites for running the Codex CLI. The build installs Git, curl, and the packages required by the helper scripts. It also copies an entrypoint that reads the JSON configuration at runtime and applies the declared policy before starting the agent process.

```
docker build -t ai-agent-toolkit:latest -f docker/Dockerfile .
```

To run the container and mount the configuration and shared workspace:

```
docker run --rm --name ai-agent-toolkit \
  -v "$PWD/config:/opt/agent/config" \
  -v "$PWD/workspaces:/workspaces" \
  --add-host host.docker.internal:host-gateway \
  ai-agent-toolkit:latest
```

> **Note for macOS/Windows users:** Docker Desktop already routes
> `host.docker.internal` to the host machine. On Linux, the
> `--add-host` flag above binds the special hostname so tools inside the
> container can talk to services (HTTP proxies, package mirrors, etc.)
> running on the host. When `internet_access.mode` resolves to
> `codex_common` or `unrestricted`, the agent will therefore use the
> host's own internet connection.

The entrypoint invokes `scripts/bootstrap_agent.js` which performs the following steps:

1. Loads `agent_config.json`.
2. Clones or updates the spec and source repositories inside `/workspaces`.
3. Applies the network policy by exporting environment variables the Codex CLI can read.
4. Launches the Codex CLI agent in restricted or unrestricted mode as dictated by the configuration.

## Codex CLI workflow

Detailed setup steps for installing and running the Codex CLI inside the container are documented in [docs/workflows/codex_cli_setup.md](docs/workflows/codex_cli_setup.md).

## Working on a remote VM

Many operators run the toolkit on a cloud VM instead of their local workstation. Once the host has been provisioned, connect to
it over SSH to inspect the runtime or trigger commands manually:

```bash
ssh YOUR_USER@YOUR_VM_IP
```

After authenticating, you can check whether the container is running and review its logs:

```bash
docker ps
docker logs --follow ai-agent-toolkit
```

To run Codex CLI commands interactively inside the container, attach a shell session and invoke the CLI as needed:

```bash
docker exec -it ai-agent-toolkit /bin/bash
codex-cli run --help
```

Refer to the workflow guide for details on choosing a Codex model and adjusting the startup command.

