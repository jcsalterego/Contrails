import { fetchGuarded } from "./bsky-fetch-guarded";

export async function loginWithEnv(env) {
  return await login(env.BLUESKY_HANDLE, env.BLUESKY_APP_PASSWORD);
}

async function login(username, password) {
  const url = "https://bsky.social/xrpc/com.atproto.server.createSession";
  const body = {
    identifier: username,
    password: password,
  };
  const init = {
    body: JSON.stringify(body),
    method: "POST",
    headers: {
      "content-type": "application/json;charset=UTF-8",
    },
  };
  let response = await fetchGuarded(url, init);
  if (response !== null) {
    let session = await response.json();
    if (session["error"] === undefined) {
      return session;
    }
  }
  return null;
}
