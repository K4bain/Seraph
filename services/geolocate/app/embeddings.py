import numpy as np
import torch
from PIL import Image
from transformers import CLIPProcessor, CLIPModel

_model = None
_processor = None

def load_clip_model():
    global _model, _processor
    if _model is None or _processor is None:
        _model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
        _processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
        _model.eval()
    return _model, _processor


def embed_image(image, model, processor):
    # image: PIL Image
    device = "cpu"
    inputs = processor(images=image, return_tensors="pt")
    with torch.no_grad():
        outputs = model.get_image_features(**{k: v.to(device) for k, v in inputs.items()})
    emb = outputs.cpu().numpy()
    # normalize
    norm = np.linalg.norm(emb, axis=1, keepdims=True)
    emb = emb / (norm + 1e-10)
    return emb.astype('float32')[0]
