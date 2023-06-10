#!/usr/bin/env python
import glob
import json
import os
import re

WORKER_SENTINEL = "\n\n// CONFIGS\n\n"
LIST_ITEM_REGEX = re.compile(r"^- ")


def render_search_terms(search_terms):
    rv = []
    for term in search_terms:
        term = re.compile(LIST_ITEM_REGEX).sub("", term)
        rv.append(term)
    return rv


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

    flat_keys = [key for key in config.keys() if key != "searchTerms"]
    for key in flat_keys:
        config[key] = " ".join(config[key])
    if "searchTerms" in config:
        config["searchTerms"] = render_search_terms(config["searchTerms"])
    if "avatar" in config:
        matches = re.compile("^.*\((.+)\)$").match(config["avatar"])
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

    return config


def save_json_configs(json_path, configs):
    with open(json_path, "w") as f:
        json.dump(configs, f, indent=2)


def replace_json_configs(worker_js_path, configs):
    with open(worker_js_path, "r") as f:
        contents = f.read()
    sections = contents.split(WORKER_SENTINEL)
    if len(sections) != 2:
        raise Exception("Expected to find sentinel in worker.js")

    new_contents = "".join(
        [
            sections[0],
            WORKER_SENTINEL,
            "const CONFIGS = " + json.dumps(configs, indent=2),
            "\n",
        ]
    )

    with open(worker_js_path, "w") as f:
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
    replace_json_configs("cloudflare-worker/worker.js", configs)


main()
