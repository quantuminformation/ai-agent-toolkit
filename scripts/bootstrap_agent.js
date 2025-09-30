#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

// Make git non-interactive by default inside the container so scripts fail fast
// and print guidance instead of blocking for username/password.
if (!process.env.GIT_TERMINAL_PROMPT) process.env.GIT_TERMINAL_PROMPT = "0";
// Accept new SSH host keys automatically (safe in ephemeral containers)
if (!process.env.GIT_SSH_COMMAND) process.env.GIT_SSH_COMMAND = "ssh -o StrictHostKeyChecking=accept-new";

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

function setupGitAuthForGitHub() {
  // Check if we have GitHub credentials configured
  const hasGitHubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const hasSSHKey = fs.existsSync('/root/.ssh/id_rsa') || fs.existsSync('/root/.ssh/id_ed25519');
  
  if (!hasGitHubToken && !hasSSHKey) {
    console.log('No GitHub authentication found. For private repos, you may need to:');
    console.log('1. Set GITHUB_TOKEN environment variable, or');
    console.log('2. Mount SSH keys to /root/.ssh/');
    return false;
  }
  
  if (hasGitHubToken) {
    // Configure git to use token for GitHub HTTPS URLs
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    try {
      run('git', ['config', '--global', 'credential.helper', 'store']);
      // Store credentials for github.com
      const credentialsPath = '/root/.git-credentials';
      const credentialsContent = `https://x-access-token:${token}@github.com\n`;
      fs.writeFileSync(credentialsPath, credentialsContent, { mode: 0o600 });
      console.log('Configured GitHub token authentication');
      return true;
    } catch (e) {
      console.warn('Failed to configure GitHub token:', e.message);
    }
  }
  
  return hasSSHKey;
}

function convertToAuthenticatedURL(url) {
  // If it's a GitHub HTTPS URL and we have a token, ensure it uses the token
  if (url.includes('github.com') && url.startsWith('https://')) {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (token && !url.includes('@')) {
      return url.replace('https://github.com', `https://x-access-token:${token}@github.com`);
    }
  }
  return url;
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
  let url = repoConfig.url;
  const branch = repoConfig.branch || "main"; // single, simple rule
  
  // Set up GitHub authentication if needed
  if (url.includes('github.com')) {
    setupGitAuthForGitHub();
    url = convertToAuthenticatedURL(url);
  }

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
  const includesBrowserLogin = /\bcodex\s+auth\s+login\b/.test(raw);
  if (!process.env.OPENAI_API_KEY && !includesBrowserLogin) {
    console.warn("[codex] OPENAI_API_KEY is not set; attempting to use cached credentials.");
    console.warn("        If auth fails (401/Unauthorized), do one of the following on your host:");
    console.warn("          1) One-shot browser login: AUTH_LOGIN=1 PERSIST_POLICY=1 scripts/run_agent.sh");
    console.warn("             - Expect: 'Starting local login server on http://localhost:1455' and an auth.openai.com URL");
    console.warn("             - If the CLI chooses a different port, re-run with AUTH_PORT=<port> AUTH_LOGIN=1 PERSIST_POLICY=1 scripts/run_agent.sh");
    console.warn("          2) Shell-first: PERSIST_POLICY=1 PUBLISH_AUTH_PORT=1 CODEX_CLI_COMMAND=\"/bin/bash\" scripts/run_agent.sh");
    console.warn("             - Then run inside the container: 'codex auth login' followed by 'codex run' (you can omit PUBLISH_AUTH_PORT next time)");
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

  // Repo resolution: support single-repo mode where docs and source live together.
  let allReady = true;
  let specPathResolved = null;
  let sourcePathResolved = null;

  const singleRepo = Boolean(config.docs_and_source_same_repo);
  if (singleRepo) {
    const combined = (config.source_repo && config.source_repo.url) ? config.source_repo : config.spec_repo;
    if (!combined || !combined.url) {
      console.error("[repos] docs_and_source_same_repo=true but no spec_repo/source_repo with a URL was provided.");
      allReady = false;
    } else {
      console.log("[repos] Single-repo mode is ON. The source repository configuration (if any) will be ignored.");
      // Sync once, prefer labeling it as 'source' for logs.
      const ok = syncRepository("source", combined);
      if (!ok) {
        allReady = false;
      } else {
        // Resolve both paths to the same location (prefer provided path; default to /workspaces/source).
        const p = resolveRepoPath("source", combined);
        sourcePathResolved = p;
        specPathResolved = p;
      }
    }
  } else {
    // Two-repo mode (default)
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
    // Resolve paths for env propagation
    if (config.spec_repo && config.spec_repo.url) {
      specPathResolved = resolveRepoPath("spec", config.spec_repo);
    }
    if (config.source_repo && config.source_repo.url) {
      sourcePathResolved = resolveRepoPath("source", config.source_repo);
    }
  }

  if (!allReady) {
    console.log("\nOne or more repositories are not ready. Please follow the instructions above and rerun.\n");
    return 0; // clean exit, no stacktraces
  }

  // Export paths for downstream scripts (e.g., seed scripts or helpers)
  if (specPathResolved) process.env.AGENT_SPEC_PATH = specPathResolved;
  if (sourcePathResolved) process.env.AGENT_SOURCE_PATH = sourcePathResolved;

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
