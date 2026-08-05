from PIL import Image
from app.embeddings import load_clip_model, embed_image


def test_embed_shape_and_norm():
    model, processor = load_clip_model()
    img = Image.new('RGB', (224,224), color=(10,20,30))
    v = embed_image(img, model, processor)
    assert v.shape[0] > 0
    import numpy as np
    norm = np.linalg.norm(v)
    assert abs(norm - 1.0) < 1e-3
