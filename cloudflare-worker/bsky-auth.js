const MAX_FETCHES = 7;
let fetchCount = 0;

export async function fetchWithCounter() {
  fetchCount++;
  if (fetchCount > MAX_FETCHES) {
    console.log(`NOT fetching ${fetchCount}`);
    return null;
  } else {
    console.log(`fetch ${fetchCount}`);
    return await fetch(...arguments);
  }
}

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
  let response = await fetchWithCounter(url, init);
  if (response !== null) {
    let session = await response.json();
    if (session["error"] === undefined) {
      return session;
    }
  }
  return null;
}
