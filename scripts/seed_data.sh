#!/usr/bin/env bash
set -euo pipefail

echo "Generating non-production seed data..."
mkdir -p /workspaces/source/tmp
cat <<'DATA' > /workspaces/source/tmp/seed.json
{
  "users": [
    {"email": "dev@example.com", "role": "developer"},
    {"email": "pm@example.com", "role": "product_manager"}
  ]
}
DATA

echo "Seed data created at /workspaces/source/tmp/seed.json"
