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

/* ---------------------- utils ---------------------- */

function run(cmd, args, options = {}) {
  const res = spawnSync(cmd, args, { stdio: "pipe", encoding: "utf8", ...options });
  if (res.status !== 0) {
    const msg = [
      `Command failed: ${cmd} ${args.join(" ")}`,
      (res.stderr || "").trim() || (res.stdout || "").trim() || "(no output)",
    ].join("\n");
    const err = new Error(msg);
    err.code = res.status;
    throw err;
  }
  return (res.stdout || "").trim();
}

function runInherit(cmd, args, options = {}) {
  const res = spawnSync(cmd, args, { stdio: "inherit", ...options });
  if (res.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(" ")}`);
  }
}

/* ---------------- configuration -------------------- */

function loadConfiguration() {
  const override = process.env[CONFIG_ENV_VAR];
  const candidates = [];
  if (override) candidates.push(override);
  candidates.push(...DEFAULT_CONFIG_PATHS);

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        return JSON.parse(fs.readFileSync(c, "utf8"));
      } catch (e) {
        throw new ConfigurationError(`Failed to parse configuration at ${c}: ${e.message}`);
      }
    }
  }
  throw new ConfigurationError(
      "Unable to locate agent configuration. Set AGENT_CONFIG_PATH or add config/agent_config.json."
  );
}

/* ------------------- git helpers ------------------- */

function resolveRepoPath(name, repoConfig) {
  let repoPath = repoConfig.path || `/workspaces/${name}`;
  if (!path.isAbsolute(repoPath)) repoPath = path.join("/workspaces", repoPath);
  return path.resolve(repoPath);
}

function remoteHasAnyHeads(url) {
  try {
    return Boolean(run("git", ["ls-remote", "--heads", url]));
  } catch {
    return false;
  }
}

function remoteBranchExists(url, branch) {
  if (!branch) return false;
  try {
    return Boolean(run("git", ["ls-remote", "--heads", url, branch]));
  } catch {
    return false;
  }
}

/* ------------------- repo sync --------------------- */

function syncRepository(name, repoConfig) {
  if (!repoConfig || !repoConfig.url) {
    console.error(`[${name}] Missing ${name}_repo.url in configuration.`);
    return false;
  }

  const repoPath = resolveRepoPath(name, repoConfig);
  const url = repoConfig.url;
  const branch = repoConfig.branch || "main"; // single, simple rule

  fs.mkdirSync(path.dirname(repoPath), { recursive: true });

  // 1) Remote must have at least one branch
  if (!remoteHasAnyHeads(url)) {
    console.error(
        `\n[${name}] Remote has no branches at ${url}.\n` +
        `Create the initial branch "${branch}" once, then rerun:\n\n` +
        `  git init -b ${branch} ${name}-seed && cd ${name}-seed\n` +
        `  echo "# ${name}" > README.md\n` +
        `  git add README.md && git commit -m "init ${branch}"\n` +
        `  git remote add origin ${url}\n` +
        `  git push -u origin ${branch}\n` +
        `  cd .. && rm -rf ${name}-seed\n`
    );
    return false;
  }

  // 2) The requested branch must exist
  if (!remoteBranchExists(url, branch)) {
    console.error(
        `\n[${name}] Required branch "${branch}" does not exist on ${url}.\n` +
        `Please create it once (from the remote default or your desired base):\n\n` +
        `  git clone ${url} tmp && cd tmp\n` +
        `  # if the repo already has a default branch (e.g. master/trunk):\n` +
        `  git checkout -b ${branch} <base-branch>\n` +
        `  git push -u origin ${branch}\n` +
        `  cd .. && rm -rf tmp\n\n` +
        `Then rerun the container.`
    );
    return false;
  }

  const gitPath = path.join(repoPath, ".git");
  if (!fs.existsSync(gitPath) && fs.existsSync(repoPath) && fs.readdirSync(repoPath).length > 0) {
    console.log(`[${name}] Directory exists but is not a git repository. Initializing...`);
    try {
      runInherit("git", ["init"], { cwd: repoPath });
    } catch (e) {
      console.error(`\n[${name}] Git init failed: ${e.message}\n`);
      return false;
    }
  }

  const isGitDir = fs.existsSync(gitPath);

  if (isGitDir) {
    console.log(`Updating ${name} repository at ${repoPath}...`);
    try {
      // Check if remote 'origin' exists
      const remotes = run("git", ["-C", repoPath, "remote"]);
      if (remotes.includes("origin")) {
        runInherit("git", ["-C", repoPath, "remote", "set-url", "origin", url]);
      } else {
        runInherit("git", ["-C", repoPath, "remote", "add", "origin", url]);
      }

      runInherit("git", ["-C", repoPath, "fetch", "origin", "--prune"]);
      // Always check out from remote ref; avoids "pathspec" issues
      runInherit("git", ["-C", repoPath, "checkout", "-f", "-B", branch, `origin/${branch}`]);
      runInherit("git", ["-C", repoPath, "pull", "--ff-only", "origin", branch]);
    } catch (e) {
      console.error(`\n[${name}] Git update failed: ${e.message}\n`);
      return false;
    }
    return true;
  }

  // Fresh clone
  console.log(`Cloning ${name} (${branch}) into ${repoPath}...`);
  try {
    runInherit("git", ["clone", "--single-branch", "--branch", branch, url, repoPath]);
  } catch (e) {
    console.error(`\n[${name}] Git clone failed: ${e.message}\n`);
    return false;
  }
  return true;
}

/* --------------- network policy & misc ------------- */

function resolveNetworkPolicy(config) {
  const policy = config.internet_access || {};
  const allowUnrestricted = Boolean(config.allow_unrestricted_mode);
  const requestedMode = policy.mode || "offline";
  const allowedSites = Array.isArray(policy.allowed_sites) ? policy.allowed_sites : [];

  let effective = requestedMode;
  if (requestedMode === "unrestricted" && !allowUnrestricted) {
    console.log(
        "Unrestricted mode requested but allow_unrestricted_mode is false; falling back to codex_common."
    );
    effective = "codex_common";
  }

  const supported = new Set(["offline", "codex_common", "unrestricted"]);
  if (!supported.has(effective)) {
    throw new ConfigurationError(`Unsupported internet access mode: ${effective}`);
  }

  return { mode: effective, allowedSites };
}

function applyNetworkPolicy(mode, allowedSites) {
  const runtimeDir = "/opt/agent/runtime";
  fs.mkdirSync(runtimeDir, { recursive: true });
  const policyPath = path.join("/root/.config/codex", "config.json");
  fs.writeFileSync(policyPath, JSON.stringify({ mode, allowed_sites: allowedSites }, null, 2), "utf8");

  process.env.AGENT_INTERNET_MODE = mode;
  process.env.AGENT_ALLOWED_SITES = allowedSites.join(",");
  console.log(`Applied network policy: mode=${mode}, allowed_sites=${JSON.stringify(allowedSites)}`);
}

/** Minimal, non-fatal seed runner (auto-uses bash if 'pipefail' is present). */
function runSeedDataScript(config) {
  const scriptValue = config.environment && config.environment.seed_data_script;
  if (!scriptValue) return;

  const resolved = path.isAbsolute(scriptValue) ? scriptValue : path.resolve(scriptValue);
  if (!fs.existsSync(resolved)) {
    console.warn(`Seed data script configured but not found: ${resolved}`);
    return;
  }

  try {
    const content = fs.readFileSync(resolved, "utf8");
    const firstLine = content.split("\n", 1)[0] || "";
    const useBash = /^#!.*\b(bash|env\s+bash)\b/.test(firstLine) || /\bset\s+-o\s+pipefail\b/.test(content);
    if (useBash) {
      runInherit("/usr/bin/env", ["bash", resolved]);
    } else {
      runInherit("/bin/sh", [resolved]);
    }
  } catch (e) {
    console.warn(`Seed data script failed (continuing): ${e.message}`);
  }
}

function hasCommand(bin) {
  return spawnSync("sh", ["-lc", `command -v ${bin} >/dev/null 2>&1`]).status === 0;
}

function shellQuote(s) {
  if (typeof s !== 'string') {
    s = String(s);
  }
  if (!s) {
    return "''";
  }
  if (/["' \t\n\r]/.test(s)) {
    return "'" + s.replace(/'/g, "'\\''") + "'";
  }
  return s;
}

function wrapWithPtyIfNeeded(cmd) {
  // If container stdout isn't a TTY, give the CLI a pseudo-TTY
  if (!process.stdout.isTTY && hasCommand("script")) {
    return `script -qfec ${shellQuote(cmd)} /dev/null`;
  }
  return cmd;
}

function launchAgent() {
  const raw = process.env.CODEX_CLI_COMMAND;
  if (!raw) {
    console.log(
        "CODEX_CLI_COMMAND not set; skipping Codex CLI launch."
    );
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error("[codex] OPENAI_API_KEY is not set; refusing to run Codex CLI.");
    return;
  }
  // Decide interactivity: default to interactive when attached to a TTY,
  // or when explicitly requested via CODEX_INTERACTIVE=1. Disable when CODEX_INTERACTIVE=0.
  const envFlag = process.env.CODEX_INTERACTIVE;
  const interactive = envFlag ? envFlag !== "0" : Boolean(process.stdout.isTTY);

  if (!interactive) {
    console.log("[codex] No TTY detected (or CODEX_INTERACTIVE=0). Skipping interactive CLI launch.");
    console.log("        Re-run the container with -it, or exec into it and run `codex run` manually.");
    return;
  }

  const env = { ...process.env };
  // Ensure interactive UX: unset CI/quiet flags if present.
  delete env.CI;
  delete env.CODEX_QUIET_MODE;

  console.log(`[codex] Running (interactive): ${raw}`);
  const res = spawnSync(raw, {
    stdio: "inherit",
    shell: true,
    env,
  });
  if (res.status !== 0) {
    console.warn("Codex CLI exited non-zero (continuing).");
  }
}

/* ----------------------- main ---------------------- */

function main() {
  let config;
  try {
    config = loadConfiguration();
  } catch (e) {
    if (e instanceof ConfigurationError) {
      console.error(`Configuration error: ${e.message}`);
      return 0; // exit cleanly with message
    }
    console.error(e.message || String(e));
    return 0;
  }

  let allReady = true;
  for (const repoName of ["spec", "source"]) {
    const repoKey = `${repoName}_repo`;
    if (!config[repoKey]) {
      console.error(`Missing ${repoKey} section in configuration`);
      allReady = false;
      continue;
    }
    const ok = syncRepository(repoName, config[repoKey]);
    if (!ok) allReady = false;
  }

  if (!allReady) {
    console.log("\nOne or more repositories are not ready. Please follow the instructions above and rerun.\n");
    return 0; // clean exit, no stacktraces
  }

  const { mode, allowedSites } = resolveNetworkPolicy(config);
  applyNetworkPolicy(mode, allowedSites);
  runSeedDataScript(config);
  launchAgent();
  return 0;
}

Promise.resolve()
    .then(() => (process.exitCode = main()))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 0; // still exit cleanly
    });
