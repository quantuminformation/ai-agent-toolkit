# Codex CLI Setup Workflow

> **Note:** This guide describes a Docker-based setup for the `codex` CLI, specific to this `ai-agent-toolkit` project. For information on installing and running the `codex` CLI directly on your machine, please refer to the [official documentation](https://github.com/openai/codex).

This guide explains how to prepare the Docker image and start the Codex CLI agent with the configuration system in this repository.  
It is written for **beginners** — even if you are new to Docker or not very technical, you can follow along step by step.

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
   docker run --rm \
     -v "$PWD/config:/opt/agent/config" \
     -v "$PWD/workspaces:/workspaces" \
     -e OPENAI_API_KEY="sk-your-api-key" \
     -e CODEX_CLI_COMMAND="codex run --config /opt/agent/runtime/network_policy.json" \
     ai-agent-toolkit:latest
   ```

The agent will start automatically and use your API key.

---

### 🌐 Option B — Browser login (if you don’t have an API key)

1. Start the container **without** the API key:

   ```bash
   docker run -d \
     -v "$PWD/config:/opt/agent/config" \
     -v "$PWD/workspaces:/workspaces" \
     -e CODEX_CLI_COMMAND="codex run --config /opt/agent/runtime/network_policy.json" \
     ai-agent-toolkit:latest
   ```

   > The `-d` flag keeps the container running in the background.

2. Find the container ID:

   ```bash
   docker ps
   ```

3. Open a shell inside the container:

   ```bash
   docker exec -it <container_id> /bin/bash
   ```

4. Log in with your browser:

   ```bash
   codex auth login
   ```

   - You’ll see a short code and a URL.
   - Open the URL on your host machine, sign in to OpenAI, and paste the code.
   - Once confirmed, the CLI is authenticated.

5. (Optional) To make login persist across runs, add this volume mount:

   ```bash
   -v "$PWD/.codex:/root/.config/codex"
   ```

---

## 5. Verify Codex CLI connectivity

Once authenticated (via API key or browser login):

1. Attach to the container shell if you’re not already inside:

   ```bash
   docker exec -it <container_id> /bin/bash
   ```

2. Run a test command:

   ```bash
   codex status
   ```

If it prints a valid response, you’re ready to go!

---

## 6. Updating the configuration

- Any changes to `agent_config.json` take effect the next time you start the container.
- To test different access levels, edit `internet_access.mode` and toggle `allow_unrestricted_mode`.
- Delete and recreate the container if things look stuck.
