#!/usr/bin/env python3

import json
import re

WORKER_SENTINEL = "\n\n// CONFIG\n\n"


def parse_config(markdown_contents):
    config = {}
    sections = markdown_contents.split("\n# ")
    for section in sections:
        if not section:
            continue

        lines = section.split("\n")
        section = lines[0]
        lines = [line for line in lines[1:] if line]

        config[section] = lines

    flat_keys = [key for key in config.keys() if key != "searchTerms"]
    for key in flat_keys:
        config[key] = " ".join(config[key])
    if "searchTerms" in config:
        config["searchTerms"] = [
            re.compile(r"^- ").sub("", term) for term in config["searchTerms"]
        ]
    if "avatar" in config:
        matches = re.compile("^.*\((.+)\)$").match(config["avatar"])
        if matches:
            config["avatar"] = matches.group(1)
    if "recordName" in config:
        record_name = config["recordName"]
        record_name = record_name.replace(" ", "").lower()
        record_name = record_name[0:15]
        config["recordName"] = record_name
    if "displayName" in config:
        display_name = config["displayName"]
        display_name = display_name[0:24]
        config["displayName"] = display_name

    return config


def save_json_config(json_path, config):
    with open(json_path, "w") as f:
        json.dump(config, f, indent=2)


def replace_json_config(worker_js_path, config):
    with open(worker_js_path, "r") as f:
        contents = f.read()
    sections = contents.split(WORKER_SENTINEL)
    if len(sections) != 2:
        raise Exception("Expected to find sentinel in worker.js")

    new_contents = "".join(
        [
            sections[0],
            WORKER_SENTINEL,
            "const CONFIG = " + json.dumps(config, indent=2),
            "\n",
        ]
    )

    with open(worker_js_path, "w") as f:
        f.write(new_contents)


def main():
    with open("CONFIG.md", "r") as f:
        config = parse_config(f.read())
    save_json_config("feed-generator/config.json", config)
    replace_json_config("cloudflare-worker/worker.js", config)


main()
