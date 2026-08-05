# Geolocate microservice

CLIP + FAISS image geolocation microservice: given an image, return the
closest geo-tagged images in the index and their coordinates.

## Architecture

- **FastAPI** (`app/api.py`) exposes `POST /geolocate` (multipart `file` or `image_url`).
- **CLIP** (`app/embeddings.py`) embeds images to normalized 512-d vectors via `transformers`.
- **FAISS** (`app/search.py`) stores vectors in an `IndexFlatIP(d=512)` and returns
  nearest neighbors with lat/lon from `data/meta.json`.

## Build an index (on a machine with torch + RAM for the model)

1. Collect geo-tagged images and a metadata CSV:

   ```csv
   filename,lat,lon
   data/sample/eiffel.jpg,48.8584,2.2945
   ```

2. Run the standalone builder (imports `transformers`/`faiss` only inside `main`):

   ```bash
   python scripts/build_index.py --meta sample_meta.csv
   ```

   Writes `data/index.faiss`, `data/meta.json`, and `data/manifest.json`
   (progress every 50 images; empty input is rejected). The FAISS index is
   built at runtime on the big box / CI and excluded from the image via
   `.dockerignore`.

No sample data yet? `bash scripts/build_data.sh` downloads ~5 public
Wikimedia Commons landmark images and emits `data/sample_meta.csv`
(Eiffel Tower, Statue of Liberty, Colosseum, Big Ben, Taj Mahal).

## Run locally

```bash
pip install -r requirements.txt
uvicorn app.api:app --reload
```

Config comes from `.env` (see `.env.example`) or environment variables.
Without an existing index the service starts with an empty placeholder.

## Docker

```bash
docker build -t seraph-geolocate services/geolocate
docker run --rm -p 8000:8000 seraph-geolocate
```

Mount or copy a built `data/index.faiss` + `data/meta.json` into the
container for real results.

## Config

| Env var | Default | Purpose |
| --- | --- | --- |
| `CLIP_MODEL` | `openai/clip-vit-base-patch32` | CLIP checkpoint |
| `INDEX_PATH` | `data/index.faiss` | FAISS index path |
| `META_PATH` | `data/meta.json` | lat/lon metadata JSON |
| `PORT` | `8000` | Uvicorn port |
| `REVERSE_GEO_KEY` | — | Optional reverse-geocoding API key |

## Integration

Point the Next.js app at this service via `GEOLOCATE_URL` (e.g.
`http://localhost:8000`). IMINT and image entry points live in the Next app.
