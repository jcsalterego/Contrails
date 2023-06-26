import { CONFIGS } from "./configs";
import { appBskyFeedGetAuthorFeed } from "./bsky-api";
import { jsonResponse } from "./utils";
import { searchPost } from "./bsky-search";
import { resetFetchCount, setSafeMode } from "./bsky-fetch-guarded";
import { loginWithEnv } from "./bsky-auth";

// let's be nice
const DEFAULT_LIMIT = 40;

export async function feedGeneratorWellKnown(request) {
  let host = request.headers.get("Host");
  let didJson = {
    "@context": ["https://www.w3.org/ns/did/v1"],
    id: `did:web:${host}`,
    alsoKnownAs: [],
    authentication: null,
    verificationMethod: [],
    service: [
      {
        id: "#bsky_fg",
        type: "BskyFeedGenerator",
        serviceEndpoint: `https://${host}`,
      },
    ],
  };
  return jsonResponse(didJson);
}

async function staticPost(value) {
  return {
    type: "post",
    response: {
      feed: [{ post: value }],
    },
  };
}

function fromPost(response) {
  let docs = [];
  if (Array.isArray(response.feed)) {
    for (let item of response.feed) {
      docs.push({
        pinned: true,
        atURL: item.post,
      });
    }
  } else {
    console.log("wtf post response", response);
  }
  return docs;
}

function fromUser(response) {
  let docs = [];
  let feed = response.feed;
  if (Array.isArray(feed)) {
    for (let idx = 0; idx < feed.length; idx++) {
      let feedItem = feed[idx];
      if (feedItem.post !== undefined && feedItem.post.record !== undefined) {
        // TODO allow replies
        if (feedItem.reply !== undefined) {
          continue;
        }
        // TODO allow reposts
        if (feedItem.reason !== undefined) {
          continue;
        }
        let timestampStr = feedItem.post.record.createdAt;
        let timestamp = new Date(timestampStr).valueOf() * 1000000;
        let atURL = feedItem.post.uri;

        docs.push({
          timestamp: timestamp,
          atURL: atURL,
          idx: idx,
          total: feed.length,
        });
      }
    }
  }
  return docs;
}

function fromSearch(response) {
  let docs = [];
  if (Array.isArray(response)) {
    for (let idx = 0; idx < response.length; idx++) {
      let searchResult = response[idx];
      let did = searchResult.user.did;
      let rkey = searchResult.tid.split("/").slice(-1)[0];
      let timestamp = searchResult.post.createdAt;
      let atURL = `at://${did}/app.bsky.feed.post/${rkey}`;
      docs.push({
        timestamp: timestamp,
        atURL: atURL,
        idx: idx,
        total: response.length,
      });
    }
  }
  return docs;
}

function saveCursor(items) {
  return "";
}

export async function getFeedSkeleton(request, env) {
  const url = new URL(request.url);
  const feedAtUrl = url.searchParams.get("feed");
  if (feedAtUrl === null) {
    console.warn(`feed parameter missing from query string`);
    return feedJsonResponse([]);
  }
  let cursorParam = url.searchParams.get("cursor");
  if (
    cursorParam === undefined ||
    cursorParam === null ||
    cursorParam.trim().length == 0
  ) {
    cursorParam = null;
  }
  const showPins = cursorParam === null;
  let words = feedAtUrl.split("/");
  let feedId = words[words.length - 1];
  let config = CONFIGS[feedId];

  if (config === undefined) {
    console.warn(`Could not find Feed ID ${feedId}`);
    return feedJsonResponse([]);
  }
  if (config.isEnabled !== true) {
    console.warn(`Feed ID ${feedId} is not enabled`);
    return feedJsonResponse([]);
  }
  if (config.safeMode === undefined) {
    // this should never be the case
    console.warn(`Feed ID ${feedId} has no safeMode`);
    config.safeMode = true;
  }
  resetFetchCount(); // for long-lived processes (local)
  setSafeMode(config.safeMode);

  let limit = parseInt(url.searchParams.get("limit"));
  if (limit === null || limit === undefined || limit < 1) {
    limit = DEFAULT_LIMIT;
  }

  let allQueries = buildQueries(config.searchTerms, cursorParam);
  let session = null;
  if (allQueries.find((query) => query.type === "user") !== undefined) {
    session = await loginWithEnv(env);
  }

  let items = [];
  for (let query of allQueries) {
    console.log(`query: ${JSON.stringify(query)}`);
    if (query.type === "search") {
      let response = await searchPost(query.value);
      if (response !== null) {
        items.push(...fromSearch(response));
      }
    } else if (query.type === "user") {
      let response = await fetchUser(session, query.value);
      if (response !== null) {
        items.push(...fromUser(response));
      }
    } else if (query.type === "post" && showPins) {
      let response = await staticPost(query.value);
      if (response !== null) {
        items.push(...fromPost(response));
      }
    } else {
      console.warn(`Unknown item type ${typedResponse.type}`);
    }
  }

  console.log("items.length", items.length);
  items = items.toSorted((b, a) =>
    a.timestamp === b.timestamp ? 0 : a.timestamp < b.timestamp ? -1 : 1
  );

  // TODO apply this after adding pagination support
  // items = items.slice(0, limit);

  let feed = [];
  for (let item of items) {
    feed.push({ post: item.atURL });
  }
  console.log("feed.length", feed.length);

  let cursor = saveCursor(items);
  return jsonResponse({ feed: feed, cursor: cursor });
}

function loadCursor(cursorParam) {
  let cursors = [];
  if (cursorParam !== null) {
    let words = cursorParam.split(",");
    for (let word of words) {
      if (word === "_") {
        // pinned post. continue
      } else {
        let parts = word.split(",");
        if (parts.length === 2) {
          let page = parts[0];
          let offset = parts[1];
          cursors.push({
            page: page,
            offset: offset,
          });
        } else {
          // bail
          return [];
        }
      }
    }
  }
  return cursors;
}

function buildQueries(allTerms, cursorParam = null) {
  let pinnedPosts = [];
  let queries = [];
  let cursors = loadCursor(cursorParam);

  for (let i = 0; i < allTerms.length; i++) {
    let term = allTerms[i];
    let cursor = { page: 1, offset: 0 };
    if (i < cursors.length) {
      cursor = cursors[i];
    }
    if (term.startsWith("at://")) {
      if (term.indexOf("/app.bsky.feed.post/") > -1) {
        pinnedPosts.push({
          type: "post",
          value: term,
        });
      } else {
        let userDid = term.replace("at://", "");
        queries.push({
          type: "user",
          value: userDid,
          cursor: cursor,
        });
      }
    } else {
      queries.push({
        type: "search",
        value: term,
        cursor: cursor,
      });
    }
  }

  let orderedQueries = [];
  orderedQueries.push(...pinnedPosts);
  orderedQueries.push(...queries);
  return orderedQueries;
}

async function fetchUser(session, user) {
  console.log("user", user);
  let response = await appBskyFeedGetAuthorFeed(session, user);
  if (response !== null) {
    return await response.json();
  } else {
    return null;
  }
}

function feedJsonResponse(items, cursor = null) {
  let response = { feed: items };
  if (cursor !== null) {
    response.cursor = cursor;
  }
  return jsonResponse(response);
}
