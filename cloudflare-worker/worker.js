// let's be nice
const MAX_SEARCH_TERMS = 5;
const DEFAULT_LIMIT = 40;

const DID_JSON = {
  "@context": ["https://www.w3.org/ns/did/v1"],
  id: "",
  alsoKnownAs: [],
  authentication: null,
  verificationMethod: [],
  service: [
    {
      id: "#bsky_fg",
      type: "BskyFeedGenerator",
      serviceEndpoint: "",
    },
  ],
};

function cloneObj(obj) {
  return JSON.parse(JSON.stringify(obj));
}

async function wellKnown(request) {
  let host = request.headers.get("Host");
  let didJson = cloneObj(DID_JSON);
  didJson.id = `did:web:${host}`;
  didJson.service[0].serviceEndpoint = `https://${host}`;
  return jsonResponse(didJson);
}

function jsonResponse(obj) {
  let response = new Response(JSON.stringify(obj));
  response.headers.set("Content-Type", "application/json");
  return response;
}

function bucketTerms(allTerms, opts={}) {
  let maxSearchTerms = opts["maxSearchTerms"] || MAX_SEARCH_TERMS;
  let pinnedPosts = [];
  let searchTerms = [];

  for (let term of allTerms) {
    if (term.startsWith("at://")) {
      pinnedPosts.push(term);
    } else {
      searchTerms.push(term);
    }
  }

  return {
    pinnedPosts: pinnedPosts,
    searchTerms: searchTerms.slice(0, maxSearchTerms),
  }
}

async function getFeedSkeleton(request) {
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
  let pinnedPosts = allTerms.pinnedPosts;
  if (!showPins) {
    pinnedPosts = [];
  }
  let responsePromises = [];

  for (let searchTerm of searchTerms) {
    let url =
      "https://search.bsky.social/search/posts?" +
      new URLSearchParams({
        q: searchTerm,
      });
    responsePromises.push(fetch(url));
  }
  let responses = await Promise.all(responsePromises);

  let allItems = [];
  for (let response of responses) {
    let items = await response.json();
    allItems = allItems.concat(items);
  }

  let timestampURLs = [];
  for (let item of allItems) {
    let did = item.user.did;
    let rkey = item.tid.split("/").slice(-1)[0];
    let timestamp = item.post.createdAt;
    let atURL = `at://${did}/app.bsky.feed.post/${rkey}`;
    timestampURLs.push([timestamp, atURL]);
  }

  timestampURLs = timestampURLs.toSorted((b, a) =>
    a === b ? 0 : a < b ? -1 : 1
  );
  var feed = [];
  for (let pinnedPost of pinnedPosts) {
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

function feedJsonResponse(items) {
  return jsonResponse({ feed: items });
}

export default {
  async fetch(request, env, ctx) {
    console.clear();
    // lame-o routing
    if (request.url.endsWith("/.well-known/did.json")) {
      return await wellKnown(request);
    }
    if (request.url.indexOf("/xrpc/app.bsky.feed.getFeedSkeleton") > -1) {
      return await getFeedSkeleton(request);
    }
    return new Response(`{}`);
  },
};

// CONFIGS

const CONFIGS = {
  "emotional-suppo": {
    "recordName": "emotional-suppo",
    "displayName": "Emotional Support Pets",
    "description": "Cute animals feed",
    "searchTerms": [
      "cats",
      "at://did:plc:ozppa2bsq6bdnajyweoir2i2/app.bsky.feed.post/3jxju2wwap22e",
      "dogs",
      "penguins",
      "red pandas",
      "quokkas"
    ],
    "avatar": "avatar.png",
    "isEnabled": true
  },
  "science-emojis": {
    "recordName": "science-emojis",
    "isEnabled": false,
    "displayName": "Science Emojis",
    "description": "Posts with \ud83e\uddea\ud83e\udd7c\ud83d\udd2d",
    "searchTerms": [
      "\ud83e\uddea",
      "\ud83e\udd7c",
      "\ud83d\udd2d"
    ],
    "avatar": "configs/avatar2.png"
  },
  "gaming-emojis": {
    "recordName": "gaming-emojis",
    "isEnabled": false,
    "displayName": "Gaming Emojis",
    "description": "Posts with \ud83d\udc7e\ud83c\udfae\ud83d\udd79\ufe0f",
    "searchTerms": [
      "\ud83d\udc7e",
      "\ud83c\udfae",
      "\ud83d\udd79\ufe0f"
    ],
    "avatar": "configs/avatar2.png"
  },
  "basketball-emoj": {
    "recordName": "basketball-emoj",
    "isEnabled": false,
    "displayName": "Basketball Emojis",
    "description": "Posts with \ud83c\udfc0",
    "searchTerms": [
      "\ud83c\udfc0"
    ],
    "avatar": "configs/avatar2.png"
  }
}
