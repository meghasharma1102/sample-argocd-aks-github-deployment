# sample-argocd-aks-github-deployment

This repo shows a simple GitOps deployment flow for an app running on AKS with Argo CD.

The idea is:

1. You change the app code in GitHub.
2. GitHub Actions builds a Docker image and pushes it to ACR.
3. The same workflow updates the image tag in `argocd/values-argocd.yaml`.
4. Argo CD sees that Git change and deploys the new version to AKS.