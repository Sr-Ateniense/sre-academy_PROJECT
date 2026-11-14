"use strict";

const http = require("node:http");
const { performance } = require("node:perf_hooks");

const PORT = Number(process.env.PORT || 3000);
const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];
const metrics = {
  requests: new Map(),
  latency: new Map(),
  ordersCreated: 0,
  startedAt: Date.now(),
};

function labels(method, route, status) {
  return `{method="${method}",route="${route}",status="${status}"}`;
}

function observeRequest(method, route, status, seconds) {
  const key = labels(method, route, status);
  metrics.requests.set(key, (metrics.requests.get(key) || 0) + 1);
  const histogram = metrics.latency.get(key) || { count: 0, sum: 0, buckets: BUCKETS.map(() => 0) };
  histogram.count += 1;
  histogram.sum += seconds;
  BUCKETS.forEach((bound, index) => {
    if (seconds <= bound) histogram.buckets[index] += 1;
  });
  metrics.latency.set(key, histogram);
}

function renderMetrics() {
  const lines = [
    "# HELP sre_demo_http_requests_total Total HTTP requests handled by the demo API.",
    "# TYPE sre_demo_http_requests_total counter",
  ];
  for (const [key, value] of metrics.requests) lines.push(`sre_demo_http_requests_total${key} ${value}`);
  lines.push(
    "# HELP sre_demo_http_request_duration_seconds HTTP request duration in seconds.",
    "# TYPE sre_demo_http_request_duration_seconds histogram",
  );
  for (const [key, histogram] of metrics.latency) {
    BUCKETS.forEach((bound, index) => lines.push(`sre_demo_http_request_duration_seconds_bucket${key.slice(0, -1)},le="${bound}"} ${histogram.buckets[index]}`));
    lines.push(`sre_demo_http_request_duration_seconds_bucket${key.slice(0, -1)},le="+Inf"} ${histogram.count}`);
    lines.push(`sre_demo_http_request_duration_seconds_sum${key} ${histogram.sum.toFixed(6)}`);
    lines.push(`sre_demo_http_request_duration_seconds_count${key} ${histogram.count}`);
  }
  lines.push(
    "# HELP sre_demo_orders_created_total Orders successfully created.",
    "# TYPE sre_demo_orders_created_total counter",
    `sre_demo_orders_created_total ${metrics.ordersCreated}`,
    "# HELP sre_demo_process_uptime_seconds Process uptime in seconds.",
    "# TYPE sre_demo_process_uptime_seconds gauge",
    `sre_demo_process_uptime_seconds ${((Date.now() - metrics.startedAt) / 1000).toFixed(0)}`,
  );
  return `${lines.join("\n")}\n`;
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(body)}\n`);
}

const server = http.createServer(async (req, res) => {
  const started = performance.now();
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let route = url.pathname;
  let status = 200;

  try {
    if (req.method === "GET" && route === "/metrics") {
      res.writeHead(200, { "content-type": "text/plain; version=0.0.4; charset=utf-8" });
      res.end(renderMetrics());
      return;
    }
    if (req.method === "GET" && (route === "/healthz" || route === "/readyz")) {
      sendJson(res, 200, { status: "ok" });
      return;
    }
    if (req.method === "GET" && route === "/") {
      sendJson(res, 200, {
        name: "SRE Academy Orders API",
        endpoints: ["GET /healthz", "GET /readyz", "GET /metrics", "POST /api/orders", "GET /api/demo?scenario=error|slow"],
      });
      return;
    }
    if (req.method === "GET" && route === "/api/demo") {
      const scenario = url.searchParams.get("scenario");
      if (scenario === "slow") await new Promise((resolve) => setTimeout(resolve, 1200));
      if (scenario === "error") {
        status = 500;
        sendJson(res, status, { error: "Simulated demo failure" });
      } else if (scenario === "slow" || scenario === null) {
        sendJson(res, 200, { status: "ok", scenario: scenario || "normal" });
      } else {
        status = 400;
        sendJson(res, status, { error: "scenario must be slow or error" });
      }
      return;
    }
    if (req.method === "POST" && route === "/api/orders") {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 16_384) {
          status = 413;
          sendJson(res, status, { error: "Request body too large" });
          return;
        }
      }
      let order;
      try {
        order = body ? JSON.parse(body) : {};
      } catch {
        status = 400;
        sendJson(res, status, { error: "Request body must be valid JSON" });
        return;
      }
      if (typeof order.item !== "string" || order.item.trim() === "") {
        status = 400;
        sendJson(res, status, { error: "item is required" });
        return;
      }
      metrics.ordersCreated += 1;
      status = 201;
      sendJson(res, 201, { id: metrics.ordersCreated, item: order.item.trim(), status: "accepted" });
      return;
    }
    status = 404;
    // Unknown paths share one label to keep metric cardinality bounded.
    route = "/not-found";
    sendJson(res, status, { error: "Not found" });
  } catch (error) {
    status = 500;
    if (!res.headersSent) sendJson(res, status, { error: "Internal server error" });
    else res.destroy(error);
  } finally {
    // Scrapes and Kubernetes probes are excluded from customer-facing traffic signals.
    if (!["/metrics", "/healthz", "/readyz"].includes(route)) {
      const method = ["GET", "POST"].includes(req.method) ? req.method : "OTHER";
      observeRequest(method, route, status, (performance.now() - started) / 1000);
    }
  }
});

server.listen(PORT, "0.0.0.0", () => console.log(`SRE demo API listening on port ${PORT}`));
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
