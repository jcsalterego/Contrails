import { CONFIGS } from "./configs";
import { appBskyFeedGetAuthorFeed } from "./bsky-api";
import { jsonResponse } from "./utils";
import { loginWithEnv } from "./bsky-auth";
import { searchPosts } from "./bsky-search";

// let's be nice
const MAX_SEARCH_TERMS = 5;
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

export async function getFeedSkeleton(request, env) {
  const url = new URL(request.url);
  const feedAtUrl = url.searchParams.get("feed");
  if (feedAtUrl === null) {
    console.warn(`feed parameter missing from query string`);
    return feedJsonResponse([]);
  }
  const cursorParam = url.searchParams.get("cursor");
  const showPins = cursorParam === null;
  let words = feedAtUrl.split("/");
  let feedId = words[words.length - 1];
  let config = CONFIGS[feedId];

  if (config === undefined) {
    console.warn(`Could not find Feed ID ${feedId}`);
    return feedJsonResponse([]);
  }

  let limit = parseInt(url.searchParams.get("limit"));
  if (limit === null || limit === undefined || limit < 1) {
    limit = DEFAULT_LIMIT;
  }

  let allTerms = bucketTerms(config.searchTerms, {
    maxSearchTerms: MAX_SEARCH_TERMS,
  });
  let searchTerms = allTerms.searchTerms;
  let posts = allTerms.posts;
  let users = allTerms.users;
  if (!showPins) {
    posts = [];
  }
  let typedResponses = [];
  let urls = [];

  typedResponses.push(...(await searchPosts(searchTerms)));

  let session = null;
  if (users.length > 0) {
    session = await loginWithEnv(env);
    typedResponses.push(...(await fetchUsers(session, users)));
  }

  let allItems = [];
  for (let typedResponse of typedResponses) {
    if (typedResponse !== null) {
      let response = typedResponse.response;
      if (response !== null) {
        let jsonResponse = await response.json();
        allItems.push({
          type: typedResponse.type,
          json: jsonResponse,
        });
      }
    }
  }

  let timestampURLs = [];
  for (let item of allItems) {
    if (item.type === "search" && Array.isArray(item.json)) {
      for (let searchResult of item.json) {
        let did = searchResult.user.did;
        let rkey = searchResult.tid.split("/").slice(-1)[0];
        let timestamp = searchResult.post.createdAt;
        let atURL = `at://${did}/app.bsky.feed.post/${rkey}`;
        timestampURLs.push([timestamp, atURL]);
      }
    } else if (item.type === "user") {
      if (item.json.feed !== undefined) {
        for (let feedItem of item.json.feed) {
          if (
            feedItem.post !== undefined &&
            feedItem.post.record !== undefined
          ) {
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
            timestampURLs.push([timestamp, atURL]);
          }
        }
      }
    } else {
      console.warn(`Unknown item type ${item.type}`);
    }
  }

  timestampURLs = timestampURLs.toSorted((b, a) =>
    a === b ? 0 : a < b ? -1 : 1
  );
  var feed = [];
  for (let pinnedPost of posts) {
    feed.push({ post: pinnedPost });
  }
  for (let timestampUrl of timestampURLs) {
    let atUrl = timestampUrl[1];
    feed.push({ post: atUrl });
  }
  // TODO apply this after adding pagination support
  // feed = feed.slice(0, limit);
  return feedJsonResponse(feed);
}

function bucketTerms(allTerms, opts = {}) {
  let maxSearchTerms = opts["maxSearchTerms"] || MAX_SEARCH_TERMS;
  let posts = [];
  let users = [];
  let searchTerms = [];

  for (let term of allTerms) {
    if (term.startsWith("at://")) {
      if (term.indexOf("/app.bsky.feed.post/") > -1) {
        posts.push(term);
      } else {
        let user = term.replace(/^at:\/\//, "");
        users.push(user);
      }
    } else {
      searchTerms.push(term);
    }
  }

  return {
    posts: posts,
    users: users,
    searchTerms: searchTerms.slice(0, maxSearchTerms),
  };
}

async function fetchUsers(session, users) {
  let responses = [];
  let urls = [];
  for (let user of users) {
    responses.push(await appBskyFeedGetAuthorFeed(session, user));
  }
  return responses.map((response) => {
    return { type: "user", response: response };
  });
}

function feedJsonResponse(items) {
  return jsonResponse({ feed: items });
}
