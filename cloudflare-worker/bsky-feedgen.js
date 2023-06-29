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
    feed: [{ post: value }],
  };
}

function fromPost(response) {
  let docs = [];
  if (Array.isArray(response.feed)) {
    for (let item of response.feed) {
      docs.push({
        pin: true,
        atURL: item.post,
      });
    }
  } else {
    console.warn("Unexpected (static) post response", response);
  }
  return docs;
}

function fromUser(queryIdx, response, params) {
  let docs = [];
  let feed = response.feed;
  if (Array.isArray(feed)) {
    // filter out replies and reposts
    let filteredFeed = [];
    for (let itemIdx = 0; itemIdx < feed.length; itemIdx++) {
      let feedItem = feed[itemIdx];
      if (feedItem.post !== undefined && feedItem.post.record !== undefined) {
        // TODO allow replies
        if (feedItem.reply !== undefined) {
          continue;
        }
        // TODO allow reposts
        if (feedItem.reason !== undefined) {
          continue;
        }
        filteredFeed.push(feedItem);
      }
    }
    feed = filteredFeed;

    let cursor = params.cursor;
    let nextCursor = response.cursor;
    for (let itemIdx = 0; itemIdx < feed.length; itemIdx++) {
      let feedItem = feed[itemIdx];
      if (feedItem.post !== undefined && feedItem.post.record !== undefined) {
        let timestampStr = feedItem.post.record.createdAt;
        let timestamp = new Date(timestampStr).valueOf() * 1000000;
        let atURL = feedItem.post.uri;

        docs.push({
          type: "user",
          queryIdx: queryIdx,
          timestamp: timestamp,
          atURL: atURL,
          itemIdx: itemIdx,
          total: feed.length,
          cursor: cursor,
          nextCursor: nextCursor,
        });
      }
    }
  }
  return docs;
}

function fromSearch(queryIdx, response, searchParams) {
  let docs = [];
  if (Array.isArray(response)) {
    for (let itemIdx = 0; itemIdx < response.length; itemIdx++) {
      let searchResult = response[itemIdx];
      let did = searchResult.user.did;
      let rkey = searchResult.tid.split("/").slice(-1)[0];
      let timestamp = searchResult.post.createdAt;
      let atURL = `at://${did}/app.bsky.feed.post/${rkey}`;
      docs.push({
        type: "search",
        queryIdx: queryIdx,
        timestamp: timestamp,
        atURL: atURL,
        itemIdx: itemIdx,
        total: response.length,
        count: searchParams.count,
        offset: searchParams.offset,
      });
    }
  }
  return docs;
}

function saveCursor(items, numQueries) {
  // console.log("JSON.stringify(items, null, 2)", JSON.stringify(items, null, 2));
  let subcursors = {};
  for (let i = 0; i < numQueries; i++) {
    subcursors[i] = { maxItemIdx: 0, empty: true };
  }

  const copyFields = [
    "count",
    "cursor",
    "nextCursor",
    "offset",
    "total",
    "type",
  ];
  for (let item of items) {
    if (item.pin === true) {
      continue;
    }
    let queryIdx = item.queryIdx;
    let itemIdx = item.itemIdx;
    subcursors[queryIdx].empty = false;
    for (let field of copyFields) {
      subcursors[queryIdx][field] = item[field];
    }
    subcursors[queryIdx].maxItemIdx = Math.max(
      subcursors[queryIdx].maxItemIdx,
      itemIdx
    );
  }

  let cursors = [];
  for (let i = 0; i < numQueries; i++) {
    let subcursor = subcursors[i];
    let nextCursor = null;
    if (subcursor.empty === true) {
      nextCursor = { type: "empty" };
    } else if (subcursor.type === "search") {
      nextCursor = {
        type: "search",
        offset: subcursor.offset + subcursor.maxItemIdx + 1,
      };
    } else if (subcursor.type === "user") {
      let userNextCursor = null;
      if (subcursor.maxItemIdx + 1 < subcursor.total) {
        userNextCursor = subcursor.cursor;
      } else {
        userNextCursor = subcursor.nextCursor;
      }
      nextCursor = {
        type: "user",
        cursor: userNextCursor,
      };
    }
    cursors.push(nextCursor);
  }
  console.log("subcursors", JSON.stringify(subcursors, null, 2));
  console.log("cursors", JSON.stringify(cursors, null, 2));

  let allTuples = [];
  for (let cursor of cursors) {
    let tuple = [];
    switch (cursor["type"]) {
      case "empty":
        tuple = ["e"];
        break;
      case "search":
        tuple = ["s", cursor["offset"]];
        break;
      case "user":
        tuple = ["u", cursor["cursor"]];
        break;
      default:
        console.warn(`Unknown cursor type ${cursor["type"]}`);
        break;
    }
    allTuples.push(tuple);
  }
  let flatCursor = JSON.stringify(allTuples, null, 0);
  console.log("flatCursor", flatCursor);

  return flatCursor;
}

function objSafeGet(doc, field, defaultValue) {
  let value = defaultValue;
  if (doc !== undefined && doc !== null && doc[field] !== undefined) {
    value = doc[field];
  }
  return value;
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

  const numQueries = allQueries.length;
  let origCursor = loadCursor(cursorParam);
  console.log("origCursor", JSON.stringify(origCursor, null, 2));
  if (origCursor.length === 0) {
    origCursor = null;
  } else if (origCursor.length !== numQueries) {
    console.warn("Dropping cursor because it has the wrong number of queries");
    origCursor = null;
  }

  let items = [];
  for (let queryIdx = 0; queryIdx < numQueries; queryIdx++) {
    let query = allQueries[queryIdx];
    let queryCursor = null;
    if (origCursor !== null) {
      queryCursor = origCursor[queryIdx];
    }
    console.log(`query: ${JSON.stringify(query)}`);
    if (query.type === "search") {
      let offset = objSafeGet(queryCursor, "offset", 0);
      let searchParams = {
        offset: offset,
        count: 30,
      };
      let response = await searchPost(query.value, searchParams);
      if (response !== null) {
        items.push(...fromSearch(queryIdx, response, searchParams));
      }
    } else if (query.type === "user") {
      let cursor = objSafeGet(queryCursor, "cursor", null);
      let response = await fetchUser(session, query.value, cursor);
      if (response !== null) {
        items.push(...fromUser(queryIdx, response, { cursor: cursor }));
      }
    } else if (query.type === "post") {
      if (showPins) {
        let response = await staticPost(query.value);
        if (response !== null) {
          items.push(...fromPost(response));
        }
      }
    } else {
      console.warn(`Unknown item type ${query.type}`);
    }
  }

  console.log("items.length", items.length);
  items = items.toSorted((b, a) =>
    a.timestamp === b.timestamp ? 0 : a.timestamp < b.timestamp ? -1 : 1
  );

  items = items.slice(0, limit);

  let feed = [];
  for (let item of items) {
    feed.push({ post: item.atURL });
  }
  console.log("feed.length", feed.length);

  let cursor = saveCursor(items, numQueries);
  return jsonResponse({ feed: feed, cursor: cursor });
}

function loadCursor(cursorParam) {
  let cursors = [];
  if (cursorParam !== undefined && cursorParam !== null) {
    let tuples = null;
    try {
      tuples = JSON.parse(cursorParam);
    } catch (e) {}
    if (Array.isArray(tuples)) {
      for (let tuple of tuples) {
        let cursor = null;
        if (Array.isArray(tuple)) {
          let type = tuple[0];
          if (type === "s") {
            cursor = { type: "search", offset: tuple[1] };
          } else if (type === "u") {
            cursor = { type: "user", cursor: tuple[1] };
          } else if (type === "e") {
            cursor = { type: "empty" };
          } else {
            console.warn(`Unknown cursor type ${type}`);
          }
        }
        cursors.push(cursor);
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

async function fetchUser(session, user, cursor = null) {
  console.log("user", user);
  let response = await appBskyFeedGetAuthorFeed(session, user, cursor);
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
