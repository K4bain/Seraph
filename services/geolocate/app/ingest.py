from PIL import Image
import requests
import io
import imagehash

def load_image(path_or_url):
    if isinstance(path_or_url, str) and (path_or_url.startswith("http://") or path_or_url.startswith("https://")):
        resp = requests.get(path_or_url, timeout=10)
        resp.raise_for_status()
        return Image.open(io.BytesIO(resp.content)).convert("RGB")
    else:
        return Image.open(path_or_url).convert("RGB")

def extract_exif(image):
    try:
        exif = image._getexif() or {}
        return {str(k): str(v) for k, v in exif.items()} if isinstance(exif, dict) else {}
    except Exception:
        return {}

def image_hash(image):
    try:
        h = imagehash.phash(image)
        return str(h)
    except Exception:
        return None
