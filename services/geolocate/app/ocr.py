# OCR wrapper: try EasyOCR first, fallback to pytesseract

def extract_text(image):
    try:
        import easyocr
        reader = easyocr.Reader(['en'], gpu=False)  # limited to english for speed
        res = reader.readtext(image)
        # res: list of [bbox, text, conf]
        return [{"text": r[1], "bbox": r[0], "conf": float(r[2])} for r in res]
    except Exception:
        try:
            import pytesseract
            text = pytesseract.image_to_string(image)
            clean = [t.strip() for t in text.splitlines() if t.strip()]
            return [{"text": t, "bbox": None, "conf": None} for t in clean]
        except Exception:
            return []
