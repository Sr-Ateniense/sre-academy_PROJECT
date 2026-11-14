# Deployment evidence

These screenshots were captured from the local Minikube deployment. Email account addresses are redacted in the public copies; alert contents and delivery states remain visible.

1. `01-app-instrumentation-code.png` — app code exposing custom counters, a request-duration histogram, and process uptime.
2. `02-app-metrics-output.png` — live metrics for created orders and successful API requests.
3. `03-prometheus-alert-pending.png` — high error-rate rule in its pending period.
4. `04-alertmanager-firing.png` — firing `SREDemoHighErrorRate` alert received by Alertmanager.
5. `05-alertmanager-email-resolved-gmail.png` — resolved alert email in Gmail's sent view.
6. `06-alertmanager-email-resolved-outlook.png` — resolved alert received by Outlook.
7. `07-kubernetes-pods.png` — app and monitoring pods ready, with their Kubernetes Services.
8. `08-prometheus-alert-rules-resolved.png` — Prometheus alert rules inactive after the test condition cleared.
9. `09-grafana-dashboard-last-hour.png` — Grafana dashboard showing the last hour of generated traffic and service metrics.
10. `10-alertmanager-email-firing-gmail.png` — firing alert notification in Gmail, the sending account.
11. `11-alertmanager-email-firing-outlook.png` — firing alert notification received in Outlook.
12. `12-prometheus-target-up.png` — Prometheus target page showing `sre-demo-app` in the `UP` state.

Only include screenshots of the deployment you actually ran. Keep SMTP passwords and other credentials out of screenshots.

After enabling GitHub Actions, add `13-github-actions-ci-success.png` for a successful validation/build run and `14-github-actions-minikube-deploy.png` for a successful deployment to the local Minikube cluster.
