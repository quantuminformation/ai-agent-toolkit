# Use this at your own risk, no AI Agent workflow is 100% secure, or immune to bugs prompt injection attacks which make be able to escape the container and cause unlimited damage to your systems, IP or PII data.

# Purpose

Workflow to manage a docker image that works with two repositories 

* First which holds the specs and MD format which the clients create in GitHub or synced with a platform like Basecamp
* Second repository is to work with the source code,

# Docker
We run a Docker image that runs in unrestricted mode with an AI agent like codex CLI, to use the Specs repo to generate code in the source code repo. Optional websites agents can use or unlimited access to the internet to research and find code snippets, libraries or other resources.

The docker image never has production keys but develops the app with sensible seed data that is created on startup.
