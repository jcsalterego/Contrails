#!/usr/bin/env python3
import glob
import json
import os
import re
import sys

import requests

LIST_ITEM_REGEX = re.compile(r"^- ")
POST_REGEX = re.compile(r"^.*[\./]bsky\.app/profile/(.+?)/post/([a-z0-9]+)")
PROFILE_REGEX = re.compile(r"^.*[\./]bsky\.app/profile/([^/ ]+)( .+)?$")

LIST_KEYS = [
    "searchTerms",
    "denyList",
]


def resolve_handles(handles):
    dids = {}
    for handle in handles:
        url = f"https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle={handle}"
        response = requests.get(url)
        if response.status_code == 200:
            did = response.json()["did"]
            dids[handle] = did
    return dids


def render_search_terms(search_terms):
    handles = set()
    rendered_terms = []

    # strip out list item markers
    terms = [re.compile(LIST_ITEM_REGEX).sub("", term) for term in search_terms]

    all_handles = {}

    # collect handles and pins
    for term in terms:
        post_matches = POST_REGEX.match(term)
        profile_matches = PROFILE_REGEX.match(term)
        if post_matches:
            handle = post_matches.group(1).lower()
            handles.add(handle)
        if profile_matches:
            handle = profile_matches.group(1).lower()
            handles.add(handle)
            if handle not in all_handles:
                all_handles[handle] = {
                    "handle": handle,
                    "replies": False,
                    "reposts": False,
                }
            flags = profile_matches.group(2)
            if flags is not None:
                words = flags.split(" ")
                for word in words:
                    word = word.strip().lower()
                    if word:
                        if word == "+replies":
                            all_handles[handle]["replies"] = True
                        elif word == "+reposts":
                            all_handles[handle]["reposts"] = True
                        else:
                            print(f"WARN: Unknown flag {word}", file=sys.stderr)

    # resolve handles
    dids = resolve_handles(handles)

    # replace handles with DIDs
    for term in terms:
        post_matches = POST_REGEX.match(term)
        profile_matches = PROFILE_REGEX.match(term)
        if post_matches:
            handle = post_matches.group(1)
            rkey = post_matches.group(2)
            did = dids[handle]
            if did:
                at_url = f"at://{did}/app.bsky.feed.post/{rkey}"
                rendered_terms.append(at_url)
            else:
                print(f"WARN: Failed to resolve handle {handle}", file=sys.stderr)
        elif profile_matches:
            handle = profile_matches.group(1)
            did = dids[handle]
            if did:
                at_url = f"at://{did}"
                words = [at_url]
                flags = all_handles[handle]
                if flags["replies"]:
                    words.append("+replies")
                if flags["reposts"]:
                    words.append("+reposts")
                flat = " ".join(words)
                rendered_terms.append(flat)
            else:
                print(f"WARN: Failed to resolve handle {handle}", file=sys.stderr)
        else:
            rendered_terms.append(term)

    return rendered_terms


def render_dids_list(user_list):
    dids = set()
    handles = set()
    dids_or_users = [
        re.compile(LIST_ITEM_REGEX).sub("", term)
        for term in user_list
    ]
    for did_or_user in dids_or_users:
        if did_or_user.startswith("did:"):
            dids.add(did_or_user)
        else:
            if did_or_user.startswith("@"):
                did_or_user = did_or_user[1:]
            handles.add(did_or_user)
    if len(handles) > 0:
        handle_lookup = resolve_handles(handles)
        dids.update(handle_lookup.values())
    return list(dids)

def parse_config(dirname, markdown_contents):
    config = {}
    sections = markdown_contents.split("\n# ")
    for section in sections:
        if not section:
            continue

        lines = section.split("\n")
        section = lines[0]

        # starting with the second line,
        # - ignore empty lines
        # - ignore blockquotes
        lines = [line for line in lines[1:] if line and not line.startswith(">")]

        config[section] = lines

    flat_keys = [key for key in config.keys() if key not in LIST_KEYS]
    for key in flat_keys:
        config[key] = " ".join(config[key])
    if "searchTerms" in config:
        config["searchTerms"] = render_search_terms(config["searchTerms"])
    if "avatar" in config:
        matches = re.compile(r"^.*\((.+)\)$").match(config["avatar"])
        if matches:
            config["avatar"] = os.path.join(dirname, matches.group(1))
    if "recordName" in config:
        record_name = config["recordName"]
        record_name = record_name.replace(" ", "").lower()
        record_name = record_name[0:15]
        config["recordName"] = record_name
    if "displayName" in config:
        display_name = config["displayName"]
        display_name = display_name[0:24]
        config["displayName"] = display_name

    if "isEnabled" in config:
        config["isEnabled"] = config["isEnabled"].lower() == "true"
    else:
        # for legacy support, if the section is missing, set to True
        config["isEnabled"] = True

    if "safeMode" in config:
        config["safeMode"] = config["safeMode"].lower() == "true"
    else:
        # for legacy support, if the section is missing, set to True
        config["safeMode"] = True
    if "denyList" in config:
        config["denyList"] = render_dids_list(config["denyList"])

    return config


def save_json_configs(json_path, configs):
    with open(json_path, "w") as f:
        json.dump(configs, f, indent=2)


def replace_json_configs(configs_js_path, configs):
    new_contents = "".join(
        [
            "export const CONFIGS = " + json.dumps(configs, indent=2),
            "\n",
        ]
    )
    with open(configs_js_path, "w") as f:
        f.write(new_contents)


def main():
    configs = {}
    paths = ["CONFIG.md"] + glob.glob("configs/*.md")
    for path in paths:
        if os.path.exists(path):
            with open(path, "r") as f:
                config = parse_config(os.path.dirname(path), f.read())
                configs[config["recordName"]] = config

    save_json_configs("feed-generator/configs.json", configs)
    replace_json_configs("cloudflare-worker/configs.js", configs)


main()
