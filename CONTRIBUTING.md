# Contributing

Thanks for helping improve the SRE Academy Orders API demo.

## Development workflow

1. Fork the repository and create a focused feature branch.
2. Keep application changes in `app/`, Kubernetes resources in `k8s/`, and documentation in the relevant Markdown file.
3. Run `node --check app/server.js`, `node --test app/server.test.js`, and `kubectl kustomize k8s/`. Build the image with `docker build -t sre-demo-app:dev .` before opening a pull request.
4. Describe the operational reason for the change, its impact on metrics or alerts, and how you verified it.

## Code expectations

- Use the Node.js built-in modules unless a dependency is justified.
- Keep metric names, labels, and alert expressions consistent.
- Do not commit credentials, kubeconfig files, or generated secrets.
- Keep Kubernetes resource requests and limits defined.

## Pull requests

Open a pull request with a clear title, scope, validation notes, and screenshots when a dashboard or deployment view changes. Be respectful and explain requested changes constructively.
