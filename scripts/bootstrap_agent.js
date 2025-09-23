#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const CONFIG_ENV_VAR = "AGENT_CONFIG_PATH";
const DEFAULT_CONFIG_PATHS = [
  "/opt/agent/config/agent_config.json",
  path.join(__dirname, "..", "config", "agent_config.json"),
  path.join(__dirname, "..", "config", "agent_config.example.json"),
];

class ConfigurationError extends Error {}

function loadConfiguration() {
  const override = process.env[CONFIG_ENV_VAR];
  const candidates = [];
  if (override) {
    candidates.push(override);
  }
  candidates.push(...DEFAULT_CONFIG_PATHS);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const raw = fs.readFileSync(candidate, "utf8");
        return JSON.parse(raw);
      } catch (error) {
        throw new ConfigurationError(
          `Failed to parse configuration at ${candidate}: ${error.message}`
        );
      }
    }
  }

  throw new ConfigurationError(
    "Unable to locate agent configuration. Set AGENT_CONFIG_PATH or add config/agent_config.json."
  );
}

function resolveRepoPath(name, repoConfig) {
  let repoPath = repoConfig.path || `/workspaces/${name}`;
  if (!path.isAbsolute(repoPath)) {
    repoPath = path.join("/workspaces", repoPath);
  }
  return path.resolve(repoPath);
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

function syncRepository(name, repoConfig) {
  if (!repoConfig || !repoConfig.url) {
    throw new ConfigurationError(
      `${name}_repo.url must be provided in agent_config.json`
    );
  }

  const repoPath = resolveRepoPath(name, repoConfig);
  const branch = repoConfig.branch;
  const url = repoConfig.url;

  fs.mkdirSync(path.dirname(repoPath), { recursive: true });

  if (fs.existsSync(path.join(repoPath, ".git"))) {
    console.log(`Updating ${name} repository at ${repoPath}...`);
    runCommand("git", ["-C", repoPath, "fetch", "origin"]);
    if (branch) {
      runCommand("git", ["-C", repoPath, "checkout", branch]);
    }
    runCommand("git", ["-C", repoPath, "pull"]);
  } else {
    console.log(`Cloning ${name} repository into ${repoPath}...`);
    const cloneArgs = ["clone", url, repoPath];
    if (branch) {
      cloneArgs.splice(2, 0, "--branch", branch);
    }
    runCommand("git", cloneArgs);
  }
}

function resolveNetworkPolicy(config) {
  const policy = config.internet_access || {};
  const allowUnrestricted = Boolean(config.allow_unrestricted_mode);

  const requestedMode = policy.mode || "offline";
  const allowedSites = Array.isArray(policy.allowed_sites)
    ? policy.allowed_sites
    : [];

  let effectiveMode = requestedMode;
  if (requestedMode === "unrestricted" && !allowUnrestricted) {
    console.log(
      "Unrestricted mode requested but allow_unrestricted_mode is false; falling back to codex_common."
    );
    effectiveMode = "codex_common";
  }

  const supportedModes = new Set(["offline", "codex_common", "unrestricted"]);
  if (!supportedModes.has(effectiveMode)) {
    throw new ConfigurationError(
      `Unsupported internet access mode: ${effectiveMode}`
    );
  }

  return { mode: effectiveMode, allowedSites };
}

function applyNetworkPolicy(mode, allowedSites) {
  const runtimeDir = "/opt/agent/runtime";
  fs.mkdirSync(runtimeDir, { recursive: true });
  const policyPath = path.join(runtimeDir, "network_policy.json");
  fs.writeFileSync(
    policyPath,
    JSON.stringify({ mode, allowed_sites: allowedSites }, null, 2),
    "utf8"
  );

  process.env.AGENT_INTERNET_MODE = mode;
  process.env.AGENT_ALLOWED_SITES = allowedSites.join(",");
  console.log(
    `Applied network policy: mode=${mode}, allowed_sites=${JSON.stringify(
      allowedSites
    )}`
  );
}

function runSeedDataScript(config) {
  const scriptValue =
    config.environment && config.environment.seed_data_script;
  if (!scriptValue) {
    return;
  }

  const resolvedPath = path.isAbsolute(scriptValue)
    ? scriptValue
    : path.resolve(scriptValue);

  if (!fs.existsSync(resolvedPath)) {
    console.warn(`Seed data script configured but not found: ${resolvedPath}`);
    return;
  }

  try {
    fs.accessSync(resolvedPath, fs.constants.X_OK);
    runCommand(resolvedPath, [], { shell: false });
  } catch (error) {
    console.log(
      `Seed data script is not executable. Running via shell: ${resolvedPath}`
    );
    runCommand("/bin/sh", [resolvedPath]);
  }
}

function launchAgent() {
  const command = process.env.CODEX_CLI_COMMAND;
  if (!command) {
    console.log("CODEX_CLI_COMMAND not set; skipping Codex CLI launch.");
    return;
  }

  console.log(`Starting Codex CLI with command: ${command}`);
  const result = spawnSync(command, {
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error("Codex CLI command exited with a non-zero status.");
  }
}

function main() {
  let config;
  try {
    config = loadConfiguration();
  } catch (error) {
    if (error instanceof ConfigurationError) {
      console.error(`Configuration error: ${error.message}`);
      return 1;
    }
    throw error;
  }

  for (const repoName of ["spec", "source"]) {
    const repoKey = `${repoName}_repo`;
    if (!config[repoKey]) {
      throw new ConfigurationError(
        `Missing ${repoKey} section in configuration`
      );
    }
    syncRepository(repoName, config[repoKey]);
  }

  const { mode, allowedSites } = resolveNetworkPolicy(config);
  applyNetworkPolicy(mode, allowedSites);
  runSeedDataScript(config);
  launchAgent();
  return 0;
}

Promise.resolve()
  .then(() => main())
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
