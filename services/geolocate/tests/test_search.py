import numpy as np
from PIL import Image
from app.embeddings import load_clip_model, embed_image
from app.search import build_index, search_index


def test_search_roundtrip():
    model, processor = load_clip_model()
    imgs = []
    metas = []
    vecs = []
    # create 3 synthetic images with different colors and lat/lon
    specs = [((255,0,0), (10.0, 20.0)), ((0,255,0), (11.0, 21.0)), ((0,0,255), (12.0, 22.0))]
    for i, (color, (lat,lon)) in enumerate(specs):
        img = Image.new('RGB', (224,224), color=color)
        v = embed_image(img, model, processor)
        vecs.append(v)
        metas.append({'filename': f'gen_{i}.jpg', 'lat': lat, 'lon': lon})
    vectors = np.vstack(vecs).astype('float32')
    idx = build_index(vectors, metas, out_index_path='data/test_index.faiss', out_meta_path='data/test_meta.json')
    index_obj = {'index': idx, 'meta': metas}
    q = vecs[0]
    res = search_index(index_obj, q, k=2)
    assert len(res) >= 1
    # top result should be near (10,20)
    top = res[0]
    assert abs(top['lat'] - 10.0) < 1.0
