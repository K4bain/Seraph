#!/usr/bin/env python3
"""Standalone FAISS index builder for the Seraph geolocate service.

Reads a metadata CSV (columns: filename,lat,lon), embeds each image with a
CLIP model, and writes:

  data/index.faiss    FAISS IndexFlatIP(d=512) over normalized embeddings
  data/meta.json      metadata list mirroring index order (lat/lon/filename)
  data/manifest.json  {count, built_at, dim}

Heavy deps (torch, transformers, faiss, PIL) are imported lazily inside
main(), so importing this module never pulls in torch -- safe for CI and
syntax checks. Run on a machine with enough RAM/GPU to host the model.

Usage:
  python scripts/build_index.py --meta data/sample_meta.csv
"""
import argparse
import csv
import datetime
import json
import os
import sys


def read_meta_csv(path):
    rows = []
    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            filename = (row.get("filename") or "").strip()
            if not filename:
                continue
            rows.append({
                "filename": filename,
                "lat": float(row["lat"]),
                "lon": float(row["lon"]),
            })
    return rows


def main():
    parser = argparse.ArgumentParser(
        description="Build a CLIP+FAISS geolocation index from a metadata CSV.")
    parser.add_argument("--meta", required=True,
                        help="metadata CSV with columns: filename,lat,lon")
    parser.add_argument("--index-path", default="data/index.faiss",
                        help="output FAISS index path")
    parser.add_argument("--meta-path", default="data/meta.json",
                        help="output metadata JSON path")
    parser.add_argument("--manifest-path", default="data/manifest.json",
                        help="output manifest JSON path")
    parser.add_argument("--model", default="openai/clip-vit-base-patch32",
                        help="CLIP model checkpoint name")
    parser.add_argument("--dim", type=int, default=512,
                        help="embedding dimension (default 512)")
    args = parser.parse_args()

    meta = read_meta_csv(args.meta)
    if not meta:
        sys.exit("error: metadata CSV is empty or missing filename/lat/lon rows")

    import faiss
    import numpy as np
    import torch
    from PIL import Image
    from transformers import CLIPModel, CLIPProcessor

    model = CLIPModel.from_pretrained(args.model)
    processor = CLIPProcessor.from_pretrained(args.model)
    model.eval()

    os.makedirs(os.path.dirname(args.index_path) or ".", exist_ok=True)

    index = faiss.IndexFlatIP(args.dim)
    vectors = []
    meta_out = []
    total = len(meta)

    for i, m in enumerate(meta):
        img = Image.open(m["filename"]).convert("RGB")
        inputs = processor(images=img, return_tensors="pt")
        with torch.no_grad():
            emb = model.get_image_features(**inputs)
        vec = emb.cpu().numpy().astype("float32")[0]
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm
        vectors.append(vec)
        meta_out.append({"filename": m["filename"], "lat": m["lat"], "lon": m["lon"]})
        if (i + 1) % 50 == 0 or (i + 1) == total:
            print(f"[{i + 1}/{total}] embedded {m['filename']}", flush=True)

    if vectors:
        index.add(np.vstack(vectors).astype("float32"))

    faiss.write_index(index, args.index_path)
    with open(args.meta_path, "w") as f:
        json.dump(meta_out, f)

    manifest = {
        "count": len(vectors),
        "built_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "dim": args.dim,
    }
    with open(args.manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"wrote {args.index_path} ({len(vectors)} vectors, d={args.dim})")
    print(f"wrote {args.meta_path}")
    print(f"wrote {args.manifest_path}")


if __name__ == "__main__":
    main()
