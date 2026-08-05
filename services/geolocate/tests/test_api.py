import io

import numpy as np
import pytest

# Patch the CLIP stack BEFORE importing the app so that importing the FastAPI
# module never touches torch/transformers.
import app.embeddings as embeddings_mod


class _DummyOut:
    def cpu(self):
        return self

    def numpy(self):
        return np.zeros((1, 512), dtype="float32")


class _DummyModel:
    def get_image_features(self, **kwargs):
        return _DummyOut()

    def eval(self):
        return self


class _DummyProcessor:
    def __call__(self, images=None, return_tensors=None):
        return {"pixel_values": np.zeros((1, 3, 224, 224), dtype="float32")}


def _dummy_load():
    return _DummyModel(), _DummyProcessor()


def _dummy_embed(image, model, processor):
    return np.zeros(512, dtype="float32")


embeddings_mod.load_clip_model = _dummy_load
embeddings_mod.embed_image = _dummy_embed

from fastapi.testclient import TestClient  # noqa: E402

from app import api  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(api.app) as c:
        yield c


def test_health_returns_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "model_loaded" in body
    assert "index_entries" in body
    assert isinstance(body["index_entries"], int)


def test_geolocate_no_input_returns_400(client):
    r = client.post("/geolocate")
    assert r.status_code == 400


def test_geolocate_oversized_file_returns_413(client, monkeypatch):
    monkeypatch.setattr(api, "MAX_IMAGE_BYTES", 64)
    data = b"x" * 128
    r = client.post("/geolocate", files={"file": ("big.jpg", data, "image/jpeg")})
    assert r.status_code == 413


def test_geolocate_empty_index_returns_hint(client):
    from PIL import Image

    img = Image.new("RGB", (64, 64), color=(255, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    r = client.post("/geolocate", files={"file": ("img.jpg", buf.getvalue(), "image/jpeg")})
    assert r.status_code == 200
    body = r.json()
    assert body["candidates"] == []
    assert "hint" in body
