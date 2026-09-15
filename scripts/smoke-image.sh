#!/usr/bin/env bash
set -euo pipefail
image=$1
platform=$2
name="radar-smoke-$RANDOM-$$"
volume="$name-data"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; docker volume rm "$volume" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker volume create "$volume" >/dev/null
docker run -d --name "$name" --platform "$platform" --network none -v "$volume:/data" "$image" >/dev/null
wait_ready() {
  for attempt in $(seq 1 60); do
    if docker exec "$name" node -e 'fetch("http://localhost:3000/healthz").then(async r=>{if(!r.ok || !(await r.json()).ok)process.exit(1)}).catch(()=>process.exit(1))' >/dev/null 2>&1; then return; fi
    sleep 2
  done
  docker logs "$name"
  return 1
}
wait_ready
docker exec "$name" node --input-type=module -e '
import fs from "node:fs";
import assert from "node:assert/strict";
const html=await (await fetch("http://localhost:3000/")).text();
const status=await (await fetch("http://localhost:3000/api/status")).json();
assert(!html.includes("{{"));
assert(html.includes(`name="app-version" content="${status.appVersion}"`));
assert.equal(status.appVersion,JSON.parse(fs.readFileSync("/app/package.json")).version);
assert.equal(status.weather.configured,false);
fs.writeFileSync("/data/persistence-smoke","kept");
'
docker restart "$name" >/dev/null
wait_ready
docker exec "$name" node -e 'require("node:assert/strict").equal(require("node:fs").readFileSync("/data/persistence-smoke","utf8"),"kept")'
echo "Fresh startup and restart passed: $platform"
