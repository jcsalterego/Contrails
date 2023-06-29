import { fetchGuarded } from "./bsky-fetch-guarded";

export async function appBskyFeedGetAuthorFeed(session, did, cursor = null) {
  if (session === null) {
    return null;
  }
  let params = {
    actor: did,
    limit: 30,
  };
  if (cursor !== undefined && cursor !== null) {
    params.cursor = cursor;
  }
  const url =
    "https://bsky.social/xrpc/app.bsky.feed.getAuthorFeed?" +
    new URLSearchParams(params);
  return await fetchGuarded(url, {
    headers: {
      Authorization: `Bearer ${session.accessJwt}`,
    },
  });
}
