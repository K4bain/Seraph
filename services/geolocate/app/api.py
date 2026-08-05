from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse
import io
import requests
from PIL import Image

from .ingest import extract_exif, image_hash
from .embeddings import load_clip_model, embed_image
from .search import load_or_build_index, search_index

app = FastAPI(title="Seraph Geolocate Service")

MAX_IMAGE_BYTES = 10 * 1024 * 1024  # ~10MB cap
EXIF_MAX_ITEMS = 16
EXIF_MAX_VALUE_LEN = 120

# lazy load model/index — nothing heavy happens at import time
model, processor = None, None
index_obj = None


def get_model():
    global model, processor
    if model is None or processor is None:
        model, processor = load_clip_model()
    return model, processor


def get_index():
    global index_obj
    if index_obj is None:
        index_obj = load_or_build_index()
    return index_obj


def _truncate_exif(exif: dict):
    out = {}
    for i, (k, v) in enumerate(exif.items()):
        if i >= EXIF_MAX_ITEMS:
            break
        s = str(v)
        out[str(k)] = s if len(s) <= EXIF_MAX_VALUE_LEN else s[:EXIF_MAX_VALUE_LEN] + "..."
    return out


def _image_from_url(image_url: str) -> Image.Image:
    try:
        resp = requests.get(image_url, timeout=10)
    except requests.RequestException as exc:
        raise HTTPException(status_code=400, detail=f"could not fetch image_url: {exc}")
    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail=f"image_url returned HTTP {resp.status_code}")
    if len(resp.content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="image_url too large (max 10MB)")
    try:
        return Image.open(io.BytesIO(resp.content)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="image_url does not point to a valid image")


@app.get("/health")
def health():
    entries = 0
    if index_obj is not None and index_obj.get("index") is not None:
        entries = int(index_obj["index"].ntotal)
    return {"status": "ok", "model_loaded": model is not None, "index_entries": entries}


@app.post("/geolocate")
async def geolocate(file: UploadFile = File(None), image_url: str = Form(None), k: int = Form(5)):
    if file is None and image_url is None:
        return JSONResponse({"error": "provide file or image_url"}, status_code=400)
    if image_url:
        image = _image_from_url(image_url)
    else:
        contents = await file.read()
        if len(contents) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="file too large (max 10MB)")
        image = Image.open(io.BytesIO(contents)).convert("RGB")
    exif = _truncate_exif(extract_exif(image))
    qhash = image_hash(image)
    m, p = get_model()
    vec = embed_image(image, m, p)
    idx_obj = get_index()
    neighbors = search_index(idx_obj, vec, k=k)
    entries = 0
    if idx_obj is not None and idx_obj.get("index") is not None:
        entries = int(idx_obj["index"].ntotal)
    result = {
        "query_hash": qhash,
        "candidates": neighbors,
        "metadata": {"exif": exif},
    }
    if entries == 0:
        result["hint"] = "no index is seeded; build data/index.faiss + data/meta.json to enable search"
    return result
