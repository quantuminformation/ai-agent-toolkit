# Codex CLI Setup Workflow

> **Note:** This guide describes a Docker-based setup for the `codex` CLI, specific to this `ai-agent-toolkit` project. For information on installing and running the `codex` CLI directly on your machine, please refer to the [official documentation](https://github.com/openai/codex).

This guide explains how to prepare the Docker image and start the Codex CLI agent with the configuration system in this repository.
It is written for **beginners** — even if you are new to Docker or not very technical, you can follow along step by step.

> **If you hit an error:** copy the exact command you ran and its full output.
> Sharing both together makes it much easier to diagnose issues.

---

## 1. What you need before starting

1. **Docker installed** on your computer.
   - Run `docker version` in your terminal to check.
   - If it says “command not found,” install [Docker Desktop](https://docs.docker.com/get-docker/).

2. **An OpenAI account.**
   - There are **two types of OpenAI access**:
      - **ChatGPT Plus** → lets you use models like GPT-5 in the ChatGPT app.
      - **OpenAI API access** → gives you an API key (`sk-...`) that works with the Codex CLI.
   - ⚠️ Having ChatGPT Plus does *not* automatically give you API access.
   - To check: log in at [platform.openai.com](https://platform.openai.com/).
      - If you can create an API key under **View API Keys**, you can use **Option A** below.
      - If you cannot, you must use **Option B (browser login)**.

3. **Access to the repos** the agent should work with.
   - In your config you’ll set the URLs and branches of the `specs` and `source` repositories.
   - Make sure you can open these URLs in a browser and that you have the right permissions (for private repos you’ll need GitHub/SSH credentials).

---

## 2. Configure the agent

1. Copy the example config:
   ```bash
   cp config/agent_config.example.json config/agent_config.json
   ```

2. Edit it with your editor:
   ```bash
   nano config/agent_config.json
   ```
   *(Replace `nano` with `vim`, `code`, or `wstorm` if you prefer.)*

3. Inside `agent_config.json`:
   - Update repo URLs and branches.
   - Set `internet_access.mode`:
      - `"offline"` → no internet access.
      - `"codex_common"` → access to a safe allowlist (recommended).
      - `"unrestricted"` → full internet access (**not recommended** unless you know the risks).

---

## 3. Build the Docker image

```bash
docker build -t ai-agent-toolkit:latest -f docker/Dockerfile .
```

---

## 4. Run the container

Create a workspace folder (this is where your repos and generated data will live):

```bash
mkdir -p workspaces
```

Now run the container.  
This is where you choose **Option A (API key)** or **Option B (browser login)**.

---

### 🔑 Option A — API key login (recommended if you have API access)

1. Get your API key from [platform.openai.com](https://platform.openai.com/account/api-keys).  
   It will look like `sk-...`.

2. Run:

   ```bash
   docker run --rm --name codex-agent \
     -v "$PWD/config:/opt/agent/config" \
     -v "$PWD/workspaces:/workspaces" \
     -e OPENAI_API_KEY="sk-your-api-key" \
     -e CODEX_CLI_COMMAND="codex run" \
     ai-agent-toolkit:latest
   ```

   > If you already have a container called `codex-agent`, stop and remove it
   > first with `docker rm -f codex-agent`.

The agent will start automatically and use your API key. The container entrypoint
applies the network policy declared in `config/agent_config.json`, so no extra
flags are required when launching `codex run`. Advanced users can still add
`--config key=value` overrides to `CODEX_CLI_COMMAND` if they need to tweak
Codex CLI behaviour.

---

### 🌐 Option B — Browser login (if you don’t have an API key)

1. Start the container **without** the API key and leave `CODEX_CLI_COMMAND`
   blank so the entrypoint does not try to run the Codex CLI before you finish
   logging in. Publish port `1455` so your host browser can reach the callback
   endpoint that the CLI spins up during authentication. When
   `CODEX_CLI_COMMAND` is empty the container now stays alive in an idle state
   so you can exec into it afterward:

   ```bash
   docker run -d --name codex-agent \
     -p 1455:1455 \
     -v "$PWD/config:/opt/agent/config" \
     -v "$PWD/workspaces:/workspaces" \
     -e CODEX_CLI_COMMAND="" \
     ai-agent-toolkit:latest
   ```

   > The `-d` flag keeps the container running in the background, and the
   > entrypoint will idle instead of exiting so you can authenticate.

   > Network restrictions from `agent_config.json` are still enforced by the
   > entrypoint; customize `CODEX_CLI_COMMAND` only if you need additional Codex
   > CLI overrides.

2. Open a shell inside the container by referring to the name you just set:

   ```bash
   docker exec -it codex-agent /bin/bash
   ```

3. Log in with your browser. Bind the login server to `0.0.0.0` (so Docker can
   forward traffic from your host) and pin the port to `1455` to match the
   publish rule above:

   ```bash
   codex auth login --bind 0.0.0.0 --port 1455
   ```

   - You’ll see a short code and a URL.
   - Open the URL on your host machine, sign in to OpenAI, and paste the code.
   - Once confirmed, the CLI is authenticated. If the browser callback hangs,
     double-check that the container is still running and that port `1455` is
     exposed on your `docker run` command.

4. (Optional) To make login persist across runs, add this volume mount:

   ```bash
   -v "$PWD/.codex:/root/.config/codex"
   ```

5. Start the Codex agent once login succeeds. Because you left
   `CODEX_CLI_COMMAND` empty when the container booted, launch the CLI manually
   (the login flags are not needed anymore):

   ```bash
   docker exec -it codex-agent codex run
   ```

   > Alternatively, stop the temporary container (`docker stop codex-agent && docker rm codex-agent`) and
   > restart it with `-e CODEX_CLI_COMMAND="codex run"` now that your login is cached.

6. When you are done with the idle container, stop it to clean up resources:

   ```bash
   docker stop codex-agent
   docker rm codex-agent
   ```

---

## 5. Verify Codex CLI connectivity

Once authenticated (via API key or browser login):

1. Attach to the container shell if you’re not already inside:

   ```bash
   docker exec -it codex-agent /bin/bash
   ```

2. Run a test command:

   ```bash
   codex status
   ```

If it prints a valid response, you’re ready to go!

---

## 6. Iterating on agent code without rebuilding the image

When you edit JavaScript in `scripts/` or tweak shell helpers, you do **not**
need to rebuild the Docker image. Bind-mount the source directories into the
container so it always runs your local files:

```bash
docker run --rm \
  -v "$PWD/config:/opt/agent/config" \
  -v "$PWD/scripts:/opt/agent/scripts" \
  -v "$PWD/docker/entrypoint.sh:/entrypoint.sh" \
  -v "$PWD/workspaces:/workspaces" \
  -e OPENAI_API_KEY="sk-your-api-key" \
  -e CODEX_CLI_COMMAND="codex run" \
  ai-agent-toolkit:latest
```

- Changes you make locally are reflected the next time the CLI runs.
- Rebuild the image only when you modify dependencies in the Dockerfile itself
  (for example, adding new apt or npm packages).

You can apply the same volume mounts to the browser-login flow by adding the
`-v` lines from above to the Option B command.

---

## 7. Updating the configuration

- Any changes to `agent_config.json` take effect the next time you start the container.
- To test different access levels, edit `internet_access.mode` and toggle `allow_unrestricted_mode`.
- Delete and recreate the container if things look stuck.
