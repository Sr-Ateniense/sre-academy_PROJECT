# SRE Academy Orders API

A small application built for the SRE Academy final project. It creates a real service to instrument, deploy, scrape, visualize, and alert on. The app code is written for this project and packaged into an image from the included Dockerfile.

## Project goals

- Build a custom HTTP application that exposes Prometheus metrics.
- Run it on Kubernetes with health checks and resource boundaries.
- Scrape it with Prometheus and evaluate operational alert rules.
- View service behavior in a provisioned Grafana dashboard.
- Route Prometheus alerts through Alertmanager.
- Keep the deployment reproducible with Kustomize-managed Kubernetes resources and a CI/CD workflow.

## Architecture

```text
Client
  | HTTP
  v
Orders API (2 pods, :3000) -- /metrics --> Prometheus (:9090)
                                               | alerts
                                               v
                                         Alertmanager (:9093)

Grafana (:3000) -- Prometheus data source --> Prometheus
```

The `sre-academy` namespace contains the app. Prometheus, Grafana, and Alertmanager run in `sre-monitoring`. Prometheus reaches the app through the Kubernetes Service DNS name. Grafana provisions its Prometheus data source and dashboard at startup.

## Application endpoints and metrics

| Endpoint | Purpose |
| --- | --- |
| `GET /` | API information |
| `GET /healthz` | Kubernetes liveness probe |
| `GET /readyz` | Kubernetes readiness probe |
| `GET /metrics` | Prometheus exposition format |
| `POST /api/orders` | Create a demo order, e.g. `{"item":"coffee"}` |
| `GET /api/demo?scenario=slow` | Generate a slow request for dashboard/alert demonstrations |
| `GET /api/demo?scenario=error` | Generate a 500 response for error-rate demonstrations |

The app exports `sre_demo_http_requests_total`, `sre_demo_http_request_duration_seconds` (histogram), `sre_demo_orders_created_total`, and `sre_demo_process_uptime_seconds`. The `/metrics` endpoint itself is excluded from request counters to prevent scrape traffic from affecting the service signals.

## Local development

Requires Node.js 24 or compatible.

```powershell
node app/server.js
```

In another terminal, create an order and inspect the metrics:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/orders -ContentType 'application/json' -Body '{"item":"coffee"}'
Invoke-RestMethod http://localhost:3000/api/demo?scenario=slow
Invoke-WebRequest http://localhost:3000/api/demo?scenario=error
Invoke-WebRequest http://localhost:3000/metrics
```

## Kubernetes deployment (Minikube)

Requires Docker and Minikube with the Docker driver. The image is built from this repository; the app is not pulled as a prebuilt application image.

```powershell
minikube start --driver=docker
docker build -t sre-demo-app:1.0.0 .
minikube image load sre-demo-app:1.0.0
kubectl apply -k k8s/
kubectl get pods -n sre-academy
kubectl get pods -n sre-monitoring
```

`k8s/kustomization.yaml` composes the version-controlled resources for the app and monitoring stack. Use `kubectl kustomize k8s/` to preview the rendered resources or `kubectl diff -k k8s/` to review changes before applying them. The optional local email Secret and Deployment patch are applied separately using the commands in the alerting section below.

Wait until pods are `Running` and ready before opening the UIs. Port-forward in separate terminal windows:

```powershell
kubectl port-forward -n sre-monitoring service/grafana 3000:3000
kubectl port-forward -n sre-monitoring service/prometheus 9090:9090
kubectl port-forward -n sre-monitoring service/alertmanager 9093:9093
kubectl port-forward -n sre-academy service/sre-demo-app 8080:3000
```

Open Grafana at `http://localhost:3000` (demo credentials: `admin` / `sreacademy`), Prometheus at `http://localhost:9090`, Alertmanager at `http://localhost:9093`, and the app at `http://localhost:8080`. These credentials are for local demonstration only; replace them before exposing Grafana beyond your machine.

## Prometheus and alerting

Prometheus scrapes the app every 15 seconds. The rules in `k8s/20-prometheus.yaml` alert when the app is unavailable, the 5xx rate exceeds 5%, or p95 latency exceeds 500ms. Prometheus forwards firing alerts to Alertmanager.

Alertmanager's base configuration uses a `default` receiver and does not send messages externally. To enable the email bonus, create `k8s/alertmanager-email.local.yml` from `k8s/alertmanager-email.example.yml` if the local file does not already exist, then set the SMTP host, sender, SMTP username, provider app password, and recipient. The local file is ignored by Git.

Create/update the Kubernetes Secret from that local file, then switch the Alertmanager Deployment to mount it:

```powershell
kubectl create secret generic alertmanager-email-config --from-file=alertmanager.yml=k8s/alertmanager-email.local.yml -n sre-monitoring --dry-run=client -o yaml | kubectl apply -f -
kubectl patch deployment alertmanager -n sre-monitoring --type=merge --patch-file k8s/alertmanager-email-deployment-patch.yaml
kubectl rollout status deployment/alertmanager -n sre-monitoring
```

The email receiver sends both firing and resolved notifications. Use the provider's SMTP settings and an app-specific password where required; do not paste credentials into chat or commit the local file. Kubernetes Secrets are base64-encoded and are not encrypted by default in a local cluster, so treat this as a development setup and delete the Secret when finished. Alertmanager's SMTP settings and email receiver fields are documented in the [official configuration reference](https://prometheus.io/docs/alerting/latest/configuration/).

**Outlook.com/Hotmail note:** Microsoft documents `smtp-mail.outlook.com:587` with STARTTLS and OAuth2/Modern Auth. Alertmanager's built-in SMTP receiver does not implement OAuth2, so an Outlook.com mailbox is not a reliable direct SMTP sender for this setup. You can still use your Outlook address as the recipient and configure a separate SMTP relay/provider that supports Alertmanager's username/password SMTP authentication. See [Microsoft's Outlook.com settings](https://support.microsoft.com/en-us/outlook/pop-imap-and-smtp-settings-for-outlook-com).

For a Gmail sender, use `smtp.gmail.com:587` with STARTTLS, the full Gmail address as the SMTP username, and a Google App Password. Google requires 2-Step Verification to create an App Password; follow [Google's App Password instructions](https://support.google.com/accounts/answer/185833). On a fresh clone, fill in the local file with the lab's sender and recipient addresses and paste the App Password locally without spaces before creating or updating the Kubernetes Secret.

For local experimentation, generate the error/slow scenarios and inspect Prometheus Alerts and the Alertmanager UI.

## Grafana dashboard

The provisioned **SRE Academy - Orders API** dashboard includes request rate, 5xx error ratio, p95 latency, request volume by status and route, latency percentiles, and orders created. Its JSON and provisioning are in `k8s/40-grafana.yaml`.

## Infrastructure as code and CI/CD

The Kubernetes resources are version-controlled declarative infrastructure. Kustomize composes the namespaces, app, Prometheus rules, Alertmanager, and Grafana from `k8s/kustomization.yaml`; preview or apply them with `kubectl kustomize k8s/` and `kubectl apply -k k8s/`. Kubernetes documents [Kustomize support in kubectl](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/).

GitHub Actions in `.github/workflows/ci.yml` runs CI for pushes and pull requests: it checks JavaScript syntax, runs an API smoke test that creates an order and checks `/metrics`, renders the Kustomize resources, and builds the Docker image. Run the same smoke test locally with `node --test app/server.test.js`. To run the local Minikube CD job, publish this repository to GitHub and set up a self-hosted runner on the same Windows machine as Docker Desktop and Minikube:

1. In the repository, open **Settings → Actions → Runners → New self-hosted runner**. Configure a Windows runner and add the custom label `minikube`.
2. Run the runner in the Windows user session that can access Docker Desktop, Minikube, and the `kubectl` context. Keep Minikube running for deployments.
3. In **Settings → Secrets and variables → Actions → Variables**, create the repository variable `ENABLE_MINIKUBE_CD` with value `true`.
4. Push a change to the repository's default branch. After CI passes, the local runner builds the commit-tagged app image, loads it into Minikube, updates the `sre-demo-app` Deployment, and waits for the rollout.

The CD job is disabled until the repository variable is set and runs only on pushes to the repository's default branch; pull-request validation stays on GitHub-hosted runners. The full stack is provisioned with Kustomize, while the CD job updates only the app image. See GitHub's [self-hosted runner setup](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners) and [deployment environment guidance](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments). Do not run untrusted pull-request workflows on a self-hosted runner.

## Evidence screenshots

The `screenshots/` folder contains evidence captured from the local deployment:

- `01-app-instrumentation-code.png` — custom Prometheus counters, histogram, and process uptime gauge implemented in the app.
- `02-app-metrics-output.png` — live `/metrics` output showing successful `POST /api/orders` requests, created orders, and request duration measurements.
- `03-prometheus-alert-pending.png` — Prometheus evaluated the high error-rate rule and kept it pending during its two-minute hold period.
- `04-alertmanager-firing.png` — Alertmanager received the firing `SREDemoHighErrorRate` alert.
- `05-alertmanager-email-resolved-gmail.png` — Gmail view of Alertmanager's resolved `SREDemoHighErrorRate` email sent to the Outlook recipient.
- `06-alertmanager-email-resolved-outlook.png` — Outlook view confirming receipt of the resolved alert email; Outlook initially classified it as junk.
- `07-kubernetes-pods.png` — app, Prometheus, Grafana, and Alertmanager pods running and ready, with their Kubernetes Services.
- `08-prometheus-alert-rules-resolved.png` — Prometheus alert rules returned to `INACTIVE` after the test traffic stopped.
- `09-grafana-dashboard-last-hour.png` — Grafana dashboard over the last hour, showing generated traffic, 5xx activity, orders, and latency.
- `10-alertmanager-email-firing-gmail.png` — Gmail view of the firing `SREDemoHighErrorRate` notification sent by Alertmanager.
- `11-alertmanager-email-firing-outlook.png` — Outlook view confirming receipt of the firing notification.
- `12-prometheus-target-up.png` — Prometheus target page showing `sre-demo-app` in the `UP` state.

Together, these screenshots document the custom app and metrics, Kubernetes deployment, Prometheus rules and target health, Grafana traffic dashboard, and firing/resolved email notifications.

After pushing the project to GitHub and running the workflows, add `13-github-actions-ci-success.png` and, after enabling the self-hosted runner, `14-github-actions-minikube-deploy.png` as evidence for the CI/CD bonus.

## Cleanup

```powershell
kubectl delete namespace sre-academy sre-monitoring
```

## Repository files

- `app/server.js` — custom instrumented API.
- `Dockerfile` — builds the application image.
- `k8s/` — app and monitoring stack manifests/configuration.
- `LICENSE.md` — MIT license.
- `CONTRIBUTING.md` — contribution workflow and standards.

## License

This project is available under the MIT License. See [LICENSE.md](LICENSE.md).
