#!/usr/bin/env python3
"""Bootstrap the AI agent container based on the JSON configuration."""

from __future__ import annotations

import json
import os
import shlex
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Tuple

CONFIG_ENV_VAR = "AGENT_CONFIG_PATH"
DEFAULT_CONFIG_PATHS = (
    Path("/opt/agent/config/agent_config.json"),
    Path(__file__).resolve().parents[1] / "config" / "agent_config.json",
    Path(__file__).resolve().parents[1] / "config" / "agent_config.example.json",
)


class ConfigurationError(RuntimeError):
    """Raised when the configuration file is missing or malformed."""


def load_configuration() -> Dict:
    """Load the agent configuration from the expected location."""
    override = os.environ.get(CONFIG_ENV_VAR)
    candidate_paths = []
    if override:
        candidate_paths.append(Path(override))
    candidate_paths.extend(DEFAULT_CONFIG_PATHS)

    for path in candidate_paths:
        if path.is_file():
            with path.open("r", encoding="utf-8") as fh:
                return json.load(fh)
    raise ConfigurationError(
        "Unable to locate agent configuration. Set AGENT_CONFIG_PATH or add config/agent_config.json."
    )


def sync_repository(name: str, repo_config: Dict) -> None:
    """Clone or update a repository declared in the configuration."""
    url = repo_config.get("url")
    path = Path(repo_config.get("path", f"/workspaces/{name}"))
    branch = repo_config.get("branch")

    if not url:
        raise ConfigurationError(f"{name}_repo.url must be provided in agent_config.json")

    path.parent.mkdir(parents=True, exist_ok=True)

    if path.exists() and (path / ".git").exists():
        print(f"Updating {name} repository at {path}...")
        subprocess.run(["git", "-C", str(path), "fetch", "origin"], check=True)
        if branch:
            subprocess.run(["git", "-C", str(path), "checkout", branch], check=True)
        subprocess.run(["git", "-C", str(path), "pull"], check=True)
    else:
        print(f"Cloning {name} repository into {path}...")
        clone_cmd = ["git", "clone", url, str(path)]
        if branch:
            clone_cmd.extend(["--branch", branch])
        subprocess.run(clone_cmd, check=True)


def resolve_network_policy(config: Dict) -> Tuple[str, List[str]]:
    """Determine the effective network policy for the agent."""
    policy = config.get("internet_access", {})
    allow_unrestricted = bool(config.get("allow_unrestricted_mode", False))

    requested_mode = policy.get("mode", "offline")
    allowed_sites = policy.get("allowed_sites", [])

    effective_mode = requested_mode
    if requested_mode == "unrestricted" and not allow_unrestricted:
        print("Unrestricted mode requested but allow_unrestricted_mode is false; falling back to codex_common.")
        effective_mode = "codex_common"

    if effective_mode not in {"offline", "codex_common", "unrestricted"}:
        raise ConfigurationError(f"Unsupported internet access mode: {effective_mode}")

    return effective_mode, allowed_sites


def apply_network_policy(mode: str, allowed_sites: List[str]) -> None:
    """Persist the network policy so the agent process can read it."""
    runtime_dir = Path("/opt/agent/runtime")
    runtime_dir.mkdir(parents=True, exist_ok=True)
    policy_path = runtime_dir / "network_policy.json"
    with policy_path.open("w", encoding="utf-8") as fh:
        json.dump({"mode": mode, "allowed_sites": allowed_sites}, fh, indent=2)
    os.environ["AGENT_INTERNET_MODE"] = mode
    os.environ["AGENT_ALLOWED_SITES"] = ",".join(allowed_sites)
    print(f"Applied network policy: mode={mode}, allowed_sites={allowed_sites}")


def run_seed_data_script(config: Dict) -> None:
    script_path = config.get("environment", {}).get("seed_data_script")
    if not script_path:
        return
    script = Path(script_path)
    if not script.exists():
        print(f"Seed data script configured but not found: {script}" )
        return
    if not os.access(script, os.X_OK):
        print(f"Seed data script is not executable. Running via shell: {script}")
        subprocess.run(["/bin/sh", str(script)], check=True)
    else:
        subprocess.run([str(script)], check=True)


def launch_agent() -> None:
    command = os.environ.get("CODEX_CLI_COMMAND")
    if not command:
        print("CODEX_CLI_COMMAND not set; skipping Codex CLI launch.")
        return
    print(f"Starting Codex CLI with command: {command}")
    subprocess.run(shlex.split(command), check=True)


def main() -> int:
    try:
        config = load_configuration()
    except ConfigurationError as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 1

    for repo_name in ("spec", "source"):
        repo_key = f"{repo_name}_repo"
        repo_config = config.get(repo_key)
        if not repo_config:
            raise ConfigurationError(f"Missing {repo_key} section in configuration")
        sync_repository(repo_name, repo_config)

    mode, allowed_sites = resolve_network_policy(config)
    apply_network_policy(mode, allowed_sites)
    run_seed_data_script(config)
    launch_agent()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
