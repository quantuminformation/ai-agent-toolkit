FROM python:3.11-slim

ENV AGENT_HOME=/opt/agent \
    CODEX_CLI_COMMAND=""

WORKDIR ${AGENT_HOME}

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

COPY scripts ${AGENT_HOME}/scripts
COPY config ${AGENT_HOME}/config
COPY docker/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh ${AGENT_HOME}/scripts/bootstrap_agent.py ${AGENT_HOME}/scripts/seed_data.sh

VOLUME ["/workspaces", "${AGENT_HOME}/config"]

ENTRYPOINT ["/entrypoint.sh"]
