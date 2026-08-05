from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import JSONResponse
from .ingest import load_image, extract_exif, image_hash
from .embeddings import load_clip_model, embed_image
from .search import load_or_build_index, search_index

app = FastAPI(title="Seraph Geolocate Service")

# lazy load model/index
model, processor = None, None
index_obj = None

@app.on_event("startup")
async def startup_event():
    global model, processor, index_obj
    model, processor = load_clip_model()
    # index is built on demand or loaded from data/index.faiss
    index_obj = load_or_build_index()

@app.post("/geolocate")
async def geolocate(file: UploadFile = File(None), image_url: str = Form(None), k: int = Form(5)):
    if file is None and image_url is None:
        return JSONResponse({"error": "provide file or image_url"}, status_code=400)
    # load image
    if file:
        contents = await file.read()
        from PIL import Image
        import io
        image = Image.open(io.BytesIO(contents)).convert("RGB")
    else:
        image = load_image(image_url)
    exif = extract_exif(image)
    qhash = image_hash(image)
    vec = embed_image(image, model, processor)
    neighbors = search_index(index_obj, vec, k=k)
    return {
        "query_hash": qhash,
        "candidates": neighbors,
        "metadata": {"exif": exif}
    }
