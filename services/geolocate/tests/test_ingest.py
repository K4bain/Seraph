# tests use generated images to avoid committing assets
from PIL import Image
from app.ingest import image_hash, extract_exif

def test_image_hash_and_exif():
    img = Image.new('RGB', (64,64), color=(123,222,111))
    h = image_hash(img)
    assert h is not None
    exif = extract_exif(img)
    assert isinstance(exif, dict)
