# Codex CLI Setup Workflow

> **Note:** This guide describes a Docker-based setup for the `codex` CLI, specific to this `ai-agent-toolkit` project. For information on installing and running the `codex` CLI directly on your machine, please refer to the [official documentation](https://github.com/openai/codex).

This guide explains how to prepare the Docker image and start the Codex CLI agent with the configuration system in this repository.
It is written for **beginners** — even if you are new to Docker or not very technical, you can follow along step by step.

---

## Why this workflow exists

Running the agent inside Docker keeps it isolated from your host machine. Even
when you grant the model unrestricted internet access (for example to let it
research libraries), the container boundary keeps prompt-injection payloads from
touching your local files or secrets—only the bind-mounted workspace is
visible. To stay safe:

- Create a dedicated `workspaces/` directory for the repos the agent should
  modify. Do **not** mount your entire home folder.
- Leave the default network policy (`internet_access.mode: "codex_common"`)
  unless you explicitly need full internet access.
- If you do enable unrestricted access, set `allow_unrestricted_mode` to
  `true` in `agent_config.json` and keep sensitive data outside the bind
  mounts.

No container setup can make AI agents perfectly safe, but this workflow gives
you a strong isolation layer while keeping the ergonomics of the Codex CLI.

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
      - `"unrestricted"` → full internet access (use only when you understand the risks).
   - Leave `allow_unrestricted_mode` as `false` unless you truly need the
     agent online without restrictions. If you flip it to `true`, double-check
     that the container is the only place the agent can reach your files.

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

### A Note on Cost

Both authentication methods (API Key and Browser Login) use the OpenAI API. Your cost is determined by token usage, which is the same regardless of how you log in. The API Key method is recommended as it is simpler and easier to automate.

---

### 🔑 Option A — API Key Login (Recommended)

This is the most direct and automated method. Your API credentials will be cached in a `.codex` directory in your project folder, so you only need to provide the key once.

1.  Get your API key from [platform.openai.com](https://platform.openai.com/account/api-keys). It will look like `sk-...`.

2.  Run the container with your API key. This single command includes a volume mount to cache your credentials, so you won't need the API key for subsequent runs.

    ```bash
    docker run --rm --name codex-agent \
      -v "$PWD/config:/opt/agent/config" \
      -v "$PWD/workspaces:/workspaces" \
      -v "$PWD/.codex:/root/.config/codex" \
      -e OPENAI_API_KEY="sk-your-api-key" \
      -e CODEX_CLI_COMMAND="codex run" \
      ai-agent-toolkit:latest
    ```

    > **Note:** If you already have a container named `codex-agent`, remove it first with `docker rm -f codex-agent`.

The agent will start automatically. For future runs, you can omit the `OPENAI_API_KEY` variable, as your login will be cached in the `.codex` directory.

#### Tip — provide the API key via your shell before Docker (safer and reusable)

Instead of hardcoding the key in the `docker run` line, you can set it in your shell first, then let Docker pass it through. This avoids storing the key in the command history and makes re‑runs simpler.

- Export once for your current terminal session:

  ```bash
  export OPENAI_API_KEY=sk-...   # Do not include curly braces
  ```

  Then start the container and pass the variable through:

  ```bash
  docker run --rm --name codex-agent \
    -v "$PWD/config:/opt/agent/config" \
    -v "$PWD/workspaces:/workspaces" \
    -v "$PWD/.codex:/root/.config/codex" \
    -e OPENAI_API_KEY \
    -e CODEX_CLI_COMMAND="codex run" \
    ai-agent-toolkit:latest
  ```

- One‑liner with a secret manager (applies only to that command):

  ```bash
  OPENAI_API_KEY=$(secret_manager --get OPENAI_API_KEY) \
  docker run --rm --name codex-agent \
    -v "$PWD/config:/opt/agent/config" \
    -v "$PWD/workspaces:/workspaces" \
    -v "$PWD/.codex:/root/.config/codex" \
    -e OPENAI_API_KEY \
    -e CODEX_CLI_COMMAND="codex run" \
    ai-agent-toolkit:latest
  ```

- No secret manager? Prompt without echoing to the screen:

  ```bash
  stty -echo; printf "Paste OPENAI_API_KEY: "; read -r OPENAI_API_KEY; stty echo; echo
  docker run --rm --name codex-agent \
    -v "$PWD/config:/opt/agent/config" \
    -v "$PWD/workspaces:/workspaces" \
    -v "$PWD/.codex:/root/.config/codex" \
    -e OPENAI_API_KEY \
    -e CODEX_CLI_COMMAND="codex run" \
    ai-agent-toolkit:latest
  ```

Notes:
- Environment variables are captured at container start. If you change `OPENAI_API_KEY`, restart the container to apply the new value.
- Don’t wrap keys in curly braces like `{sk-...}` — use the raw `sk-...` string.

---

### 🌐 Option B — Browser Login

Use this option if you do not have an API key. This process involves starting the container and then authenticating through your browser.

1.  Start the container in the background. This command includes a volume mount to cache your login, so you will only need to do the interactive login once.

    ```bash
    docker run -d --name codex-agent \
      -p 1455:1455 \
      -v "$PWD/config:/opt/agent/config" \
      -v "$PWD/workspaces:/workspaces" \
      -v "$PWD/.codex:/root/.config/codex" \
      -e CODEX_CLI_COMMAND="" \
      ai-agent-toolkit:latest
    ```
    > **Note:** We publish port `1455` as a default. If the CLI chooses a different port, you will need to stop this container and restart it with the correct port mapping (e.g., `-p <new_port>:<new_port>`).

2.  Open a shell inside the running container:

    ```bash
    docker exec -it codex-agent /bin/bash
    ```

3.  From inside the container, run the login command:

    ```bash
    codex auth login
    ```

    - The CLI will provide a URL and a code. Open the URL in your browser on your host machine and enter the code to authenticate.
    - **Important:** Some older versions of the CLI used a `--port` flag. This is no longer supported. If the CLI automatically starts on a port other than `1455`, you must stop the container (`docker stop codex-agent`) and restart it, replacing `-p 1455:1455` with the correct port number.

4.  Once authenticated, you can start the agent manually:

    ```bash
    codex run
    ```

5.  After your first successful login, your credentials are saved in the `.codex` directory. For future sessions, you can start the container and the agent in a single step, as the login is cached:

    ```bash
    docker run --rm --name codex-agent \
      -v "$PWD/config:/opt/agent/config" \
      -v "$PWD/workspaces:/workspaces" \
      -v "$PWD/.codex:/root/.config/codex" \
      -e CODEX_CLI_COMMAND="codex run" \
      ai-agent-toolkit:latest
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

> **Do I need to rebuild or restart after every change?**
>
> - **No rebuild** is required for JS/shell edits that are bind-mounted — just
>   rerun `codex run` (or restart the container) to pick up the new code.
> - **Restart the container** if you change `agent_config.json`; the entrypoint
>   reads it at startup.
> - **Rebuild the image** only when you touch `docker/Dockerfile` or install new
>   global dependencies inside the image.

You can apply the same volume mounts to the browser-login flow by adding the
`-v` lines from above to the Option B command.

---

## 7. Updating the configuration

- Any changes to `agent_config.json` take effect the next time you start the container.
- To test different access levels, edit `internet_access.mode` and toggle `allow_unrestricted_mode`.
- Delete and recreate the container if things look stuck.
