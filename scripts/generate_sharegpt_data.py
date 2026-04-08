#!/usr/bin/env python3
"""
Download ShareGPT data and generate curated benchmark prompts.

Targets: 1K / 4K / 16K / 64K / 256K tokens (3 prompts each)
- 1K, 4K, 16K: sampled from real ShareGPT first-turn messages
- 64K, 256K: assembled by concatenating multiple real messages

Usage:
  pip install tiktoken
  python3 scripts/generate_sharegpt_data.py

Output:
  frontend/src/data/sharegpt-prompts.json
"""

import json
import os
import random
import urllib.request

import tiktoken

DOWNLOAD_URL = (
    "https://huggingface.co/datasets/anon8231489123/ShareGPT_Vicuna_unfiltered"
    "/resolve/main/ShareGPT_V3_unfiltered_cleaned_split.json"
)
CACHE_PATH = "/tmp/sharegpt_v3.json"
OUTPUT_PATH = os.path.join(
    os.path.dirname(__file__), "../frontend/src/data/sharegpt-prompts.json"
)

# (target_tokens, label, lo, hi)
# For assembled buckets lo/hi are None — built by concatenation
BUCKETS = [
    ("1k",   "1K",   950,  1050),
    ("4k",   "4K",   3800,  4200),
    ("16k",  "16K",  None,  None),   # assembled
    ("64k",  "64K",  None,  None),   # assembled
    ("256k", "256K", None,  None),   # assembled
]

TARGET_TOKENS = {"16k": 16_000, "64k": 64_000, "256k": 256_000}
PROMPTS_PER_BUCKET = 1
random.seed(42)


def download(url: str, dest: str) -> None:
    print(f"Downloading {url} ...")
    urllib.request.urlretrieve(url, dest)
    size_mb = os.path.getsize(dest) / 1024 / 1024
    print(f"Saved to {dest} ({size_mb:.1f} MB)")


def extract_first_turn(conversation: list) -> str | None:
    for turn in conversation:
        if turn.get("from") in ("human", "user"):
            text = turn.get("value", "").strip()
            if text:
                return text
    return None


def is_english(text: str) -> bool:
    if not text:
        return False
    ascii_count = sum(1 for c in text if ord(c) < 128 and c.isprintable())
    return ascii_count / len(text) > 0.85


def assemble_prompt(pool: list[dict], target: int, enc: tiktoken.Encoding) -> dict:
    """Concatenate random pool items into a multi-document analysis prompt."""
    prefix = "You are given multiple documents. Read all of them carefully and provide a comprehensive analysis.\n\n"
    shuffled = pool[:]
    random.shuffle(shuffled)
    parts: list[str] = []
    total = len(enc.encode(prefix))
    for i, item in enumerate(shuffled):
        if total >= target:
            break
        parts.append(f"[Document {i + 1}]\n{item['text']}")
        total += item["tokens"]
    text = prefix + "\n\n".join(parts)
    actual = len(enc.encode(text))
    return {"text": text, "tokens": actual}


def main() -> None:
    if not os.path.exists(CACHE_PATH):
        download(DOWNLOAD_URL, CACHE_PATH)
    else:
        print(f"Using cached file: {CACHE_PATH}")

    print("Loading JSON ...")
    with open(CACHE_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    print(f"Total conversations: {len(data):,}")

    enc = tiktoken.get_encoding("cl100k_base")
    print("Extracting and tokenising first-turn prompts ...")

    all_prompts: list[dict] = []
    for item in data:
        conversations = item.get("conversations") or item.get("conversation") or []
        text = extract_first_turn(conversations)
        if not text or not is_english(text):
            continue
        token_count = len(enc.encode(text))
        all_prompts.append({"text": text, "tokens": token_count})

    print(f"Valid English prompts: {len(all_prompts):,}")

    # Build sampled buckets
    result_buckets: dict[str, list] = {}

    for key, label, lo, hi in BUCKETS:
        if lo is not None:
            candidates = [p for p in all_prompts if lo <= p["tokens"] <= hi]
            print(f"  {key:6s} [{lo:>6,}-{hi:>6,} tok]: {len(candidates):,} candidates")
            if len(candidates) < PROMPTS_PER_BUCKET:
                raise RuntimeError(f"Not enough candidates for bucket '{key}': {len(candidates)}")
            sampled = random.sample(candidates, PROMPTS_PER_BUCKET)
            result_buckets[key] = [
                {"id": f"{key}_{i+1:02d}", "text": p["text"], "tokens": p["tokens"]}
                for i, p in enumerate(sampled)
            ]
        else:
            # Assembled from a pool of medium-length prompts (500-3000 tok)
            pool = [p for p in all_prompts if 500 <= p["tokens"] <= 3000]
            target = TARGET_TOKENS[key]
            print(f"  {key:6s} [assembled ~{target//1000}K tok from pool of {len(pool):,}]")
            prompt = assemble_prompt(pool, target, enc)
            result_buckets[key] = [{"id": f"{key}_01", "text": prompt["text"], "tokens": prompt["tokens"]}]

    total = sum(len(v) for v in result_buckets.values())
    output = {
        "meta": {
            "encoding": "cl100k_base",
            "source": "ShareGPT_V3_unfiltered_cleaned_split",
            "description": "Curated prompts for LLM API performance benchmarking",
            "totalPrompts": total,
        },
        "buckets": result_buckets,
    }

    outdir = os.path.dirname(OUTPUT_PATH)
    os.makedirs(outdir, exist_ok=True)

    # Light file: 1k/4k/16k — bundled with the app
    light_keys = ["1k", "4k", "16k"]
    light = {
        "meta": {**output["meta"], "totalPrompts": len(light_keys)},
        "buckets": {k: result_buckets[k] for k in light_keys},
    }
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(light, f, ensure_ascii=False, indent=2)
    print(f"\nWrote {OUTPUT_PATH} ({os.path.getsize(OUTPUT_PATH)/1024:.1f} KB)")

    # Heavy files: 64k/256k — loaded on demand
    for key in ["64k", "256k"]:
        path = os.path.join(outdir, f"sharegpt-{key}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"buckets": {key: result_buckets[key]}}, f, ensure_ascii=False, indent=2)
        print(f"Wrote {path} ({os.path.getsize(path)/1024:.1f} KB)")

    print()
    for key, _, _, _ in BUCKETS:
        p = result_buckets[key][0]
        print(f"  {p['id']}: {p['tokens']:,} tokens")


if __name__ == "__main__":
    main()
