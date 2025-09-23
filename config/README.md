# Agent configuration

The runtime is configured through `agent_config.json`. Create the file by copying the provided example:

```
cp config/agent_config.example.json config/agent_config.json
```

## Fields

| Field | Type | Description |
| --- | --- | --- |
| `spec_repo.url` | string | Git URL that hosts the specification documents. |
| `spec_repo.branch` | string | Optional branch name to checkout (defaults to `main`). |
| `spec_repo.path` | string | Directory where the spec repository will be cloned. |
| `source_repo.url` | string | Git URL for the implementation repository. |
| `source_repo.branch` | string | Optional branch name for the source repo. |
| `source_repo.path` | string | Directory where the source repository will be cloned. |
| `internet_access.mode` | string | One of `"offline"`, `"codex_common"`, or `"unrestricted"`. |
| `internet_access.allowed_sites` | array | Optional list of domains that the runtime should permit when `mode` is `"codex_common"`. |
| `allow_unrestricted_mode` | boolean | Defaults to `false`. Must be `true` before unrestricted network access is enabled. |
| `environment.seed_data_script` | string | Optional path to a script that seeds non-production data when the container starts. |

The helper scripts read the configuration and apply the policy by exporting environment variables for the Codex CLI entrypoint.

