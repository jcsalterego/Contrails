# Full Installation Guide

⚠️  70% complete - WORK IN PROGRESS ⚠️

## Steps

### 1. Fork this repository

1. Log into GitHub.

2. Navigate to the [main Contrails page](https://github.com/jcsalterego/contrails) and click the Fork button.

![](docs/github-fork.png)

3. Proceed with instructions until your GitHub user has a fork of Contrails.

### 2. Create Cloudflare API Token

_These instructions are an excerpt from [Running Wrangler in CI/CD](https://developers.cloudflare.com/workers/wrangler/ci-cd/)._

1. Log in to the [Cloudflare dashboard](https://dash.cloudflare.com/).
At the top-right, navigate to [My Profile](https://dash.cloudflare.com/profile), and then [API Tokens](https://dash.cloudflare.com/profile/api-tokens). Click on **Create Token**.

2. Select **Use template** next to **Edit Cloudflare Workers**.

![](docs/cloudflare-api-tokens-edit-cloudflare-workers.png)

3. Set the Account Resources. If this Cloudflare account is only for this project, you can choose "All accounts" and "All zones."

![](docs/cloudflare-api-tokens-edit-cloudflare-workers-all-accounts-all-zones.png)

4. Click on **Continue to summary**.

![](docs/cloudflare-api-tokens-continue-to-summary.png)

5. Click on **Create Token**.

![](docs/cloudflare-api-tokens-summary.png)

6. Copy and save the token, as you will need it in the next step.

![](docs/cloudflare-api-tokens-final.png)

### 3. Save Cloudflare API Token to Repository Secrets

In your GitHub repository, go to `Settings > Secrets and variables > Actions`.

![](docs/github-settings-secrets.png)

Click on **New repository secret**, and add `CLOUDFLARE_API_TOKEN`.

![](docs/github-settings-secrets-cloudflare-api-token.png)

### 4. Create Cloudflare Application

1. Go to `Cloudflare Dashboard > Workers & Pages`.

![](docs/cloudflare-workers.png)

2. Click on **Create Application**.

![](docs/cloudflare-create-an-application.png)

![](docs/cloudflare-create-hello-world-script.png)

Click Deploy

3. set `CLOUDFLARE_WORKER_NAME`

![](docs/github-settings-variables-set-cloudflare-worker-name.png)

4. set CLOUDFLARE_ACCOUNT_ID

![](docs/cloudflare-workers-account-id.png)

![](docs/github-settings-variables-set-cloudflare-account-id.png)

