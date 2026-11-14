"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const net = require("node:net");
const path = require("node:path");
const { test } = require("node:test");

async function reservePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}

test("API creates an order and exposes its Prometheus metrics", async (t) => {
  const port = await reservePort();
  const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { output += chunk; });

  t.after(async () => {
    if (child.exitCode === null) {
      child.kill();
      await Promise.race([
        once(child, "exit"),
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]);
    }
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 5_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`API exited before becoming ready. Output: ${output}`);
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // The server may need a short time to start listening.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, `API did not become ready. Output: ${output}`);

  const orderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ item: "ci-smoke-test" }),
  });
  assert.equal(orderResponse.status, 201);
  assert.deepEqual(await orderResponse.json(), { id: 1, item: "ci-smoke-test", status: "accepted" });

  const metricsResponse = await fetch(`${baseUrl}/metrics`);
  assert.equal(metricsResponse.status, 200);
  const metrics = await metricsResponse.text();
  assert.match(metrics, /sre_demo_orders_created_total 1/);
  assert.match(metrics, /sre_demo_http_requests_total\{method="POST",route="\/api\/orders",status="201"\} 1/);
  assert.match(metrics, /# TYPE sre_demo_http_request_duration_seconds histogram/);
});
