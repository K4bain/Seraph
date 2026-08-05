#!/usr/bin/env python3
"""Build FAISS index from a metadata CSV or precomputed vectors.
Usage:
  python app/index_build.py --meta metadata.csv --out data/index.faiss
"""
import argparse
import csv
import numpy as np
from .embeddings import load_clip_model, embed_image
from .search import build_index
from PIL import Image


def read_meta_csv(path):
    rows = []
    with open(path) as f:
        r = csv.DictReader(f)
        for row in r:
            rows.append(row)
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--meta', required=True, help='metadata csv with columns: filename,lat,lon')
    parser.add_argument('--out-index', default='data/index.faiss')
    parser.add_argument('--out-meta', default='data/meta.json')
    args = parser.parse_args()
    meta = read_meta_csv(args.meta)
    model, processor = load_clip_model()
    vecs = []
    meta_out = []
    for m in meta:
        img = Image.open(m['filename']).convert('RGB')
        v = embed_image(img, model, processor)
        vecs.append(v)
        meta_out.append({'filename': m['filename'], 'lat': float(m['lat']), 'lon': float(m['lon'])})
    vectors = np.vstack(vecs).astype('float32')
    build_index(vectors, meta_out, args.out_index, args.out_meta)

if __name__ == '__main__':
    main()
