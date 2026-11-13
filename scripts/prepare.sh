#!/usr/bin/env bash
set -euo pipefail
mkdir -p .cache
curl -fL --retry 2 https://github.com/evansiroky/timezone-boundary-builder/releases/download/2025b/timezones.geojson.zip -o .cache/timezones.zip
curl -fL --retry 2 https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json -o .cache/states.json
sha256sum --check <<'HASHES'
89dfbacb944fac18a2eb3be71f806c7486b791c01b61c0ce7ee3a7ee79dc1a61  .cache/timezones.zip
d76b391ccfa8bff601d51e3e3da5d43a89fa46cd5caca72ce731b383be5596d0  .cache/states.json
HASHES
