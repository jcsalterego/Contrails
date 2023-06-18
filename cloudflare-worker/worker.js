// let's be nice
const MAX_SEARCH_TERMS = 5;
const MAX_FETCHES = 7;
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

let fetchCount = 0;

async function fetchWithCounter() {
  fetchCount++;
  if (fetchCount > MAX_FETCHES) {
    console.log(`NOT fetching ${fetchCount}`);
    return null;
  } else {
    console.log(`fetch ${fetchCount}`);
    return await fetch(...arguments);
  }
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

async function loginWithEnv(env) {
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

async function appBskyFeedGetAuthorFeed(session, did) {
  if (session === null) {
    return null;
  }
  const url =
    "https://bsky.social/xrpc/app.bsky.feed.getAuthorFeed?" +
    new URLSearchParams({
      actor: did,
      limit: 30,
    });
  return await fetchWithCounter(url, {
    headers: {
      Authorization: `Bearer ${session.accessJwt}`,
    },
  });
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

async function fetchSearchTerms(searchTerms) {
  let responses = [];
  let urls = [];
  for (let searchTerm of searchTerms) {
    let url =
      "https://search.bsky.social/search/posts?" +
      new URLSearchParams({
        q: searchTerm,
      });
    urls.push(url);
  }
  for (let url of urls) {
    responses.push(await fetchWithCounter(url));
  }
  return responses.map((response) => {
    return { type: "search", response: response };
  });
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

async function getFeedSkeleton(request, env) {
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

  typedResponses.push(...(await fetchSearchTerms(searchTerms)));

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
    if (item.type === "search") {
      let did = item.user.did;
      let rkey = item.tid.split("/").slice(-1)[0];
      let timestamp = item.post.createdAt;
      let atURL = `at://${did}/app.bsky.feed.post/${rkey}`;
      timestampURLs.push([timestamp, atURL]);
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
            let timestamp = feedItem.post.record.createdAt;
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
      return await getFeedSkeleton(request, env);
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
