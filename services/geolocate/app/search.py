import faiss
import numpy as np
import os
import json

_INDEX_PATH = os.environ.get('INDEX_PATH', 'data/index.faiss')
_META_PATH = os.environ.get('META_PATH', 'data/meta.json')


def build_index(vectors: np.ndarray, meta: list, out_index_path=_INDEX_PATH, out_meta_path=_META_PATH):
    # vectors: Nxd float32 numpy
    d = vectors.shape[1]
    index = faiss.IndexFlatIP(d)
    index.add(vectors)
    os.makedirs(os.path.dirname(out_index_path) or '.', exist_ok=True)
    faiss.write_index(index, out_index_path)
    with open(out_meta_path, 'w') as f:
        json.dump(meta, f)
    return index


def load_index(index_path=_INDEX_PATH):
    if not os.path.exists(index_path):
        return None
    idx = faiss.read_index(index_path)
    return idx


def load_meta(meta_path=_META_PATH):
    if not os.path.exists(meta_path):
        return None
    import json
    with open(meta_path) as f:
        return json.load(f)


def load_or_build_index():
    idx = load_index()
    meta = load_meta()
    if idx is None or meta is None:
        # no index available; build an empty placeholder index
        # create tiny index so searches don't crash
        d = 512
        idx = faiss.IndexFlatIP(d)
        meta = []
    return {"index": idx, "meta": meta}


def search_index(index_obj, query_vec, k=5):
    idx = index_obj.get('index') if isinstance(index_obj, dict) else index_obj
    meta = index_obj.get('meta', []) if isinstance(index_obj, dict) else []
    if idx is None or idx.ntotal == 0:
        return []
    q = np.expand_dims(query_vec, axis=0).astype('float32')
    scores, ids = idx.search(q, k)
    results = []
    for s, i in zip(scores[0], ids[0]):
        if i < 0 or i >= len(meta):
            continue
        results.append({"lat": meta[i].get('lat'), "lon": meta[i].get('lon'), "score": float(s), "provenance": {"type": "faiss", "id": i}})
    return results
