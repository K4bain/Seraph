import numpy as np
from PIL import Image


class LazyLoader:
    """Proxy that imports a module only on first attribute access.

    Importing this module does NOT import torch/transformers, so the FastAPI
    app can boot and serve /health without pulling in the heavy ML stack.
    """
    def __init__(self, local_name, parent_module_globals, name):
        self._local_name = local_name
        self._parent_module_globals = parent_module_globals
        self._name = name
        self._module = None

    def _load(self):
        import importlib
        self._module = importlib.import_module(self._name)
        self._parent_module_globals[self._local_name] = self._module
        return self._module

    def __getattr__(self, item):
        module = self._module
        if module is None:
            module = self._load()
        return getattr(module, item)


_torch = LazyLoader("torch", globals(), "torch")

_model = None
_processor = None


def load_clip_model():
    global _model, _processor
    import torch
    from transformers import CLIPProcessor, CLIPModel
    if _model is None or _processor is None:
        _model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
        _processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
        _model.eval()
    return _model, _processor


def embed_image(image, model, processor):
    # image: PIL Image
    import torch
    device = "cpu"
    inputs = processor(images=image, return_tensors="pt")
    with torch.no_grad():
        outputs = model.get_image_features(**{k: v.to(device) for k, v in inputs.items()})
    emb = outputs.cpu().numpy()
    # normalize
    norm = np.linalg.norm(emb, axis=1, keepdims=True)
    emb = emb / (norm + 1e-10)
    return emb.astype('float32')[0]
