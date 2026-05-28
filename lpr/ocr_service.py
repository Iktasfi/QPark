"""
QPark — OCR Microservice
========================
Запускать на том же маке что и barrier.py.
Принимает base64 фото, возвращает найденные номера.

Установка: pip install flask easyocr opencv-python numpy
Запуск:    python ocr_service.py
Ngrok:     ngrok http 5001
"""

from flask import Flask, request, jsonify
import easyocr
import base64
import numpy as np
import cv2
import re

app = Flask(__name__)
_reader = None

def get_reader():
    global _reader
    if _reader is None:
        print("⏳ Загрузка EasyOCR (первый раз ~30 сек)...")
        _reader = easyocr.Reader(["en", "ru"], gpu=False, verbose=False)
        print("✅ EasyOCR готов")
    return _reader

def clean_plate(text: str) -> str:
    return re.sub(r"[^A-Z0-9А-ЯЁ]", "", text.upper())

@app.route("/health")
def health():
    return jsonify({"status": "ok"})

@app.route("/ocr", methods=["POST"])
def ocr():
    """
    Принимает base64 фото и (опционально) номер места для поиска.
    Возвращает весь распознанный текст + найден ли нужный номер.

    Body: { "image": "data:image/jpeg;base64,...", "spot": "SP-07" }
    """
    data = request.get_json(silent=True)
    if not data or "image" not in data:
        return jsonify({"error": "image required"}), 400

    spot_to_find = data.get("spot", "")  # Например "SP-07"

    # Декодируем base64
    try:
        img_b64 = data["image"]
        if img_b64.startswith("data:"):
            img_b64 = img_b64.split(",", 1)[1]
        img_bytes = base64.b64decode(img_b64)
        arr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            return jsonify({"error": "Не удалось декодировать изображение"}), 400
    except Exception as e:
        return jsonify({"error": f"Ошибка декодирования: {e}"}), 400

    # Улучшаем контраст
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    # OCR — читаем весь текст (буквы + цифры)
    reader = get_reader()
    all_texts = []

    for source in [enhanced, img]:
        try:
            results = reader.readtext(
                source,
                allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -"
            )
            for (_, text, confidence) in results:
                cleaned = re.sub(r"[^A-Z0-9]", "", text.upper())
                if cleaned and confidence > 0.25:
                    all_texts.append({"text": cleaned, "confidence": round(confidence, 3)})
        except Exception:
            pass

    # Убираем дубликаты
    seen = set()
    unique_texts = []
    for t in sorted(all_texts, key=lambda x: -x["confidence"]):
        if t["text"] not in seen:
            seen.add(t["text"])
            unique_texts.append(t)

    # Ищем номер места в распознанном тексте
    # SP-07 → ищем "SP07", "07", "7" и т.д.
    spot_found = False
    matched_text = None
    if spot_to_find:
        spot_norm = re.sub(r"[^A-Z0-9]", "", spot_to_find.upper())       # "SP07"
        spot_digits = re.sub(r"[^0-9]", "", spot_norm).lstrip("0") or "0" # "7"
        spot_digits_padded = re.sub(r"[^0-9]", "", spot_norm)             # "07"

        for t in unique_texts:
            txt = t["text"]
            if (txt == spot_norm or            # точное "SP07"
                txt == spot_digits_padded or   # "07"
                txt == spot_digits or          # "7"
                spot_norm in txt or            # "SP07" внутри длинного текста
                spot_digits_padded in txt):    # "07" внутри
                spot_found = True
                matched_text = txt
                break

    print(f"🔍 OCR тексты: {[t['text'] for t in unique_texts]}")
    print(f"🅿️  Место '{spot_to_find}' → {'НАЙДЕНО (' + matched_text + ')' if spot_found else 'НЕ НАЙДЕНО'}")

    return jsonify({
        "texts": unique_texts,
        "spot_found": spot_found,
        "matched_text": matched_text,
    })


if __name__ == "__main__":
    get_reader()  # Предзагрузка при старте
    print("🚀 OCR сервис запущен на http://0.0.0.0:5001")
    print("   Для публичного доступа: ngrok http 5001")
    app.run(host="0.0.0.0", port=5001, debug=False)
