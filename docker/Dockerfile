# docker/Dockerfile

FROM node:20-bookworm-slim
ENV AGENT_HOME=/opt/agent CODEX_CLI_COMMAND=""
WORKDIR ${AGENT_HOME}

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates curl bash \
 && rm -rf /var/lib/apt/lists/*

# 👇 Install the CLI so `codex-cli` exists in PATH.
RUN npm install -g @openai/codex

COPY scripts ${AGENT_HOME}/scripts
COPY config ${AGENT_HOME}/config
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh ${AGENT_HOME}/scripts/bootstrap_agent.js ${AGENT_HOME}/scripts/seed_data.sh
EXPOSE 1455
VOLUME ["/workspaces", "${AGENT_HOME}/config"]
ENTRYPOINT ["/entrypoint.sh"]
