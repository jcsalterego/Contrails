
# Contrails

Contrails is an [ATProto Feed Generator](https://github.com/bluesky-social/feed-generator) backed by
[Cloudflare Workers](https://workers.cloudflare.com) and Bluesky Search.

Edit `CONFIG.md` to define your feed generator.

Deploy right from [GitHub Actions](https://github.com/features/actions).

## A Post

![](docs/thecloud.png)

## Requirements

- Bluesky Social account
- GitHub account ([Sign up](https://github.com/signup) or [Login](https://github.com/login))
- Cloudflare account ([Sign up](https://dash.cloudflare.com/sign-up) or [Login](https://dash.cloudflare.com/login/))
- A moderate-to-high tolerance for adventure

## Installation & Configuration: The Short Version

1. Create a Cloudflare Worker
2. Create a Cloudflare API Token (the Edit Workers template is fine)
3. Create a Bluesky App Password
4. Fork this repository
5. Set the following in your fork:
  * Variables: `BLUESKY_HANDLE`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_WORKER_NAME`
  * Secrets: `BLUESKY_APP_PASSWORD`, `CLOUDFLARE_API_TOKEN`
6. Edit [CONFIG.md](CONFIG.md) in your fork
7. Run **Check Requirements** GitHub Action in your fork
8. Run **Deploy to Cloudflare** GitHub Action in your fork
9. Run **Publish Feed Generator** GitHub Action in your fork

## Installation & Configuration: Director's Cut

[INSTALL.md](INSTALL.md) `under-construction.gif`

## LICENSE

[2-Clause BSD](LICENSE)
