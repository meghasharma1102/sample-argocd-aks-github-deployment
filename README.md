# sample-argocd-aks-github-deployment

This repo shows a simple GitOps flow for a sample app on AKS with Argo CD.

## Deployment Flow

1. You change code in `app/`.
2. GitHub Actions runs on the self-hosted Windows runner.
3. The workflow signs in to Azure with OIDC.
4. The workflow runs `az acr build` to build the image in ACR.
5. The workflow updates `argocd/values-argocd.yaml` with the new image tag.
6. Argo CD sees the Git change and syncs the app to AKS.
