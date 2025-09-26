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
docker run --rm \
  -v "$PWD/config:/opt/agent/config" \
  -v "$PWD/workspaces:/workspaces" \
  ai-agent-toolkit:latest
```

The entrypoint invokes `scripts/bootstrap_agent.js` which performs the following steps:

1. Loads `agent_config.json`.
2. Clones or updates the spec and source repositories inside `/workspaces`.
3. Applies the network policy by exporting environment variables the Codex CLI can read.
4. Launches the Codex CLI agent in restricted or unrestricted mode as dictated by the configuration.

## Quick start (one command)

- Export your API key once in your shell, then run the helper script (allocates a TTY and mounts everything for you). The script now publishes the Codex auth callback port(s) to your host so that ctrl+click login links work out of the box.

```
export OPENAI_API_KEY="{{OPENAI_API_KEY}}"   # set in your shell; do not paste in commands
scripts/run_agent.sh
```

- To persist the CLI policy file as a cache on your host (optional):

```
PERSIST_POLICY=1 scripts/run_agent.sh
```

## Common commands

- Build the image (same as above)

```
docker build -t ai-agent-toolkit:latest -f docker/Dockerfile .
```

- Sync/policy only (no interactive CLI launch)

```
docker run --rm \
  -v "$PWD/config:/opt/agent/config" \
  -v "$PWD/workspaces:/workspaces" \
  ai-agent-toolkit:latest
```

- Interactive Codex CLI
  - Ensure OPENAI_API_KEY is already set in your shell; do not paste secrets inline.
  - Allocate a TTY with -it to avoid interactive UI issues.
  - Publish the auth callback port so browser login can complete from your host.

```
docker run --rm -it \
  -v "$PWD/config:/opt/agent/config" \
  -v "$PWD/workspaces:/workspaces" \
  -p 1455:1455 \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  -e CODEX_CLI_COMMAND="codex run" \
  ai-agent-toolkit:latest
```

- Rapid iteration on startup logic (optional)
  - Mount local scripts instead of rebuilding the image:

```
docker run --rm -it \
  -v "$PWD/config:/opt/agent/config" \
  -v "$PWD/workspaces:/workspaces" \
  -v "$PWD/scripts:/opt/agent/scripts" \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  -e CODEX_CLI_COMMAND="codex run" \
  ai-agent-toolkit:latest
```

- Lint/Tests
  - None are defined in this repository. The primary "build" is the Docker image above.

## High-level architecture

- Entry flow
  1) The container starts at /entrypoint.sh.
  2) The entrypoint reads AGENT_CONFIG_PATH (or defaults to /opt/agent/config/agent_config.json, falling back to the example if necessary).
  3) It invokes scripts/bootstrap_agent.js.

- scripts/bootstrap_agent.js responsibilities
  - Configuration: Loads agent_config.json from AGENT_CONFIG_PATH or from the local config directory.
  - Repo sync: For spec_repo and source_repo
    - Validates the remote has a branch and that the requested branch exists.
    - Clones the repo to /workspaces/<path> or updates it if already present (resets to the remote branch and fast-forwards).
    - Provides clear guidance if the remote has no initial branch.
  - Network policy:
    - Computes an effective mode: offline | codex_common | unrestricted.
    - If mode is unrestricted but allow_unrestricted_mode is false, it downgrades to codex_common.
    - Writes the policy to /root/.config/codex/config.json and exports helper env vars.
  - Seed data: If environment.seed_data_script is set and present, runs it (bash if appropriate). The default seed script writes /workspaces/source/tmp/seed.json. The entrypoint also attempts to run the same seed script defensively; the operation is idempotent.
  - Agent launch:
    - If CODEX_CLI_COMMAND is set and OPENAI_API_KEY is present, it starts the CLI.
    - If stdout isn’t a TTY, it wraps the command with script -qfec to provide a pseudo-TTY and sets CI=1 and CODEX_QUIET_MODE=1.

- Persistent data layout (host-mounted)
  - workspaces/specs: clone of the specs repo (see config.spec_repo)
  - workspaces/source: clone of the source repo (see config.source_repo)
- /root/.config/codex/config.json (in-container): generated policy the bootstrap writes/updates. Optionally persist to host by adding a .codex bind mount (see below).

### Optional: persist Codex policy across runs

Add this flag to any docker run to persist the CLI policy to the host (do not edit it; it is overwritten each run):

```
-v "$PWD/.codex:/root/.config/codex"
```

## Troubleshooting

- Codex login link not opening from your host
  - By default scripts/run_agent.sh publishes a small range of ports (1455–1465) so ctrl+click on http://localhost:<port>/auth/callback works. If the CLI shows a different port, re-run with AUTH_PORT=<port> scripts/run_agent.sh (or manually add -p <port>:<port> to docker run). To disable publishing, set PUBLISH_AUTH_PORT=0.

- No -it provided
  - When the container is started without a TTY, the bootstrap will still sync repos, apply network policy, and seed data, but it will intentionally skip launching the interactive CLI. Re-run with -it (or use scripts/run_agent.sh) if you want an interactive Codex session.

- First run on empty remotes
  - If the remote has no branches, bootstrap prints a one-time sequence to initialize the branch (e.g., main) before proceeding.

- Interactive CLI rendering/cursor issues
  - If you see a message like "Error: The cursor position could not be read within a normal duration", re-run the container with -it so a TTY is allocated (see the interactive command above). Alternatively, run without CODEX_CLI_COMMAND to skip the interactive CLI and perform only sync/policy/seed.

- Missing OPENAI_API_KEY
- The CLI will not launch if the variable is unset. Export it in your shell and pass it through as shown above.

## Why this harness instead of just codex-cli settings?

- Reproducibility: The Docker image pins Node, git, and the CLI for identical behavior across machines and CI.
- Two-repo contract: The harness syncs a spec repo (requirements) and a source repo (outputs) with branch existence checks and friendly guidance for empty remotes.
- Policy enforcement: offline / allow-list / unrestricted, with explicit allow_unrestricted_mode to prevent accidental full egress.
- Idempotent bootstrap: optional seed script, clear logs, and safe early exits when preconditions aren’t met.
- Fewer surprises: Interactive CLI only runs when a TTY is present; otherwise the container prepares everything and exits cleanly.
- Single source of truth: You edit config/agent_config.json. The CLI policy file is generated and (optionally) persisted as a cache, never hand-edited.
