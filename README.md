# AI Agent Toolkit

- For security details and common concerns, see [SECURITY.md](SECURITY.md).

> Quick start (4 steps)
>
> 1) Build the image:
> ```bash path=null start=null
> docker build -t ai-agent-toolkit:latest -f docker/Dockerfile .
> ```
> 2) Start a shell with login ports (first run):
> ```bash path=null start=null
> PERSIST_POLICY=1 PUBLISH_AUTH_PORT=1 CODEX_CLI_COMMAND="/bin/bash" scripts/run_agent.sh
> ```
> 3) Inside the container:
> ```bash path=null start=null
> codex auth login
> codex run
> ```
> 4) Next runs (no login needed):
> ```bash path=null start=null
> PERSIST_POLICY=1 CODEX_CLI_COMMAND="/bin/bash" scripts/run_agent.sh
> ```

This repository provides a minimal workflow for managing a Docker image that runs an AI coding agent (such as the Codex CLI) against two Git repositories:

* A **specification repository** that contains product requirements and task descriptions.
* A **source repository** that receives the generated implementation.

The repository delivers:

* A configuration format that lets operators declare the repositories that will be mounted inside the container, the level of internet access that the agent should receive, and whether unrestricted mode is permitted.
* Docker assets for building a base image that can host the Codex CLI agent with optional restrictions applied at runtime.
* Documentation describing how to prepare the Docker image and bootstrap the agent.

## Getting started

**Quick workflow for beginners (shell-first):**
1. Copy `config/agent_config.example.json` to `config/agent_config.json`
2. Update the config file with your GitHub repository URLs
3. Build the Docker image:
```bash
docker build -t ai-agent-toolkit:latest -f docker/Dockerfile .
```
4. Start container shell (publish login ports on first run):
```bash
PERSIST_POLICY=1 PUBLISH_AUTH_PORT=1 CODEX_CLI_COMMAND="/bin/bash" scripts/run_agent.sh
```
5. Inside container (first time):
```bash
codex auth login
codex run
```
6. Next time you can skip port publishing unless you need to log in again:
```bash
PERSIST_POLICY=1 CODEX_CLI_COMMAND="/bin/bash" scripts/run_agent.sh
```
7. Ask the AI to help with your code!

**Need more details?** See the sections below for configuration options and advanced usage.

## Configuration

The agent runtime is governed by `config/agent_config.json`. The file captures:

* `spec_repo` and `source_repo` – Git repository URLs and optional branch overrides that will be cloned into the container. To use a single repository for both docs and source, set `docs_and_source_same_repo: true`.
* `internet_access` – Controls whether the agent has no network connectivity, access to a curated list of common Codex documentation sites, or full unrestricted egress.
* `allow_unrestricted_mode` – A safety flag (default `false`). Even if the configuration requests unrestricted network access, the runtime will only honor it when this flag is explicitly set to `true`.

Consult [config/README.md](config/README.md) for field-level documentation.

## Docker image

The provided `docker/Dockerfile` builds a lightweight Node.js image with the prerequisites for running the Codex CLI. The build installs Git, curl, and the packages required by the helper scripts. It also copies an entrypoint that reads the JSON configuration at runtime and applies the declared policy before starting the agent process.

```
docker build -t ai-agent-toolkit:latest -f docker/Dockerfile .
```

To run the container, use the helper script which handles mounts, port publishing, and policy automatically. By default it runs in sync-only mode: it clones/updates the repos and applies policy, then exits. See Quick start below for the recommended shell-first workflow and other options.

```
scripts/run_agent.sh
```

The entrypoint invokes `scripts/bootstrap_agent.js` which performs the following steps:

1. Loads `agent_config.json`.
2. Clones or updates the spec and source repositories inside `/workspaces`.
3. Applies the network policy by exporting environment variables the Codex CLI can read.
4. Launches the Codex CLI agent in restricted or unrestricted mode as dictated by the configuration.

## Usage

Once you're inside the container shell (from command #2 above), use these commands:

```bash
# First time setup - log into OpenAI
codex auth login

# Start a new AI coding session
codex run

# Resume a previous session (replace <session-id> with actual ID)
codex resume <session-id>
```

**New to AI coding?** Start with `codex run` and ask the AI to help you understand your project structure or create simple features.

## Common commands

### 1. Build the Docker image
```bash
docker build -t ai-agent-toolkit:latest -f docker/Dockerfile .
```
**What this does:** Creates a Docker image with all the tools needed to run AI agents. You need to run this once before using the toolkit.

### 2. Start a container shell (Recommended for beginners)
```bash
PERSIST_POLICY=1 PUBLISH_AUTH_PORT=1 CODEX_CLI_COMMAND="/bin/bash" scripts/run_agent.sh
```
Tip: After you’ve logged in once, you can omit `PUBLISH_AUTH_PORT=1` on future runs unless you need to log in again.

**What this does:** 
- Opens a shell inside the container where you can run AI agent commands
- `PERSIST_POLICY=1` saves your login credentials so you don't have to log in every time
- Publishes the auth callback port(s) so browser login works from your host
- You stay in the container even after the AI agent exits
- **No API key needed** - you can use browser login from inside the container
- **Best for:** Learning, debugging, or when you want control over each step

### 3. One-shot run (Advanced)
```bash
AUTH_LOGIN=1 PERSIST_POLICY=1 scripts/run_agent.sh
```
**What this does:**
- Automatically opens browser for OpenAI login
- Starts AI agent immediately after login
- Container exits when AI agent finishes
- **Best for:** Automated workflows once you're comfortable

### 4. Use API key instead of browser login
```bash
export OPENAI_API_KEY="your-actual-api-key-here"
scripts/run_agent.sh
```
**What this does:**
- Uses your OpenAI API key instead of browser login
- Replace `your-actual-api-key-here` with your real API key
- **Best for:** CI/CD pipelines or when browser login isn't available

### 5. Sync repositories only (no AI agent)
```bash
CODEX_CLI_COMMAND="" PUBLISH_AUTH_PORT=0 scripts/run_agent.sh
```
**What this does:**
- Updates your spec and source repositories
- Doesn't start the AI agent
- **Best for:** Just syncing your code repos without running AI

### 6. Working with private GitHub repositories
For private GitHub repositories, you need to provide authentication. The easiest way is to use a GitHub Personal Access Token:

```bash
export GITHUB_TOKEN="your-github-token-here"
scripts/run_agent.sh
```

**To create a GitHub token:**
1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Generate a new token (classic) with `repo` scope
3. Copy the token and set it as `GITHUB_TOKEN` environment variable

**What this does:**
- Automatically configures git to use your GitHub token for private repo access
- No more username/password prompts for private repositories
- Works with both HTTPS repository URLs

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
- In single-repo mode (`docs_and_source_same_repo: true`), both AGENT_SPEC_PATH and AGENT_SOURCE_PATH point to the same path.
- /root/.config/codex/config.json (in-container): generated policy the bootstrap writes/updates. Optionally persist to host by adding a .codex bind mount (see below).

### Optional: persist Codex policy across runs

When using the helper script, enable persistence by setting PERSIST_POLICY=1 (credentials and policy will be saved under `.codex/` and `.openai/`):

```
PERSIST_POLICY=1 scripts/run_agent.sh
```

### Browser login (AUTH_LOGIN=1) guide

Use this if you don’t have an API key exported. This starts a local callback server in the container and prints a URL to auth.openai.com that you open in your browser.

- One-shot login + run

```
AUTH_LOGIN=1 PERSIST_POLICY=1 scripts/run_agent.sh
```

What you should see
- “Starting local login server on http://localhost:1455.”
- A long auth.openai.com URL. Open it, sign in, and the CLI will continue.
- “Successfully logged in,” followed by the Codex UI.

If the port is different
- If the CLI chooses a different port, pin it:
```
AUTH_LOGIN=1 AUTH_PORT=1456 PERSIST_POLICY=1 scripts/run_agent.sh
```

Shell-first alternative (manual login)
- Keep a shell open in the container and run Codex yourself:
```
PERSIST_POLICY=1 PUBLISH_AUTH_PORT=1 CODEX_CLI_COMMAND="/bin/bash" scripts/run_agent.sh
```
- Then inside the container:
```
codex auth login
codex run
```

Persistence
- With PERSIST_POLICY=1, credentials are saved to .openai/ and policy to .codex/ in your project.
- Verify on the host:
```
ls -la .openai .codex
```

## Troubleshooting

- Codex login link not opening from your host
  - If you used one-shot login, ports are published automatically. In shell-first mode, re-run with `PUBLISH_AUTH_PORT=1` (or pin a port with `AUTH_PORT=<port>`). If needed, you can manually add `-p <port>:<port>` to a docker run.

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
