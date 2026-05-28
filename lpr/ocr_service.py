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
    data = request.get_json(silent=True)
    if not data or "image" not in data:
        return jsonify({"error": "image required"}), 400

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

    # Улучшаем контраст для лучшего OCR
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    # Запускаем OCR на улучшенном и оригинальном изображении
    reader = get_reader()
    plates = []

    for source in [enhanced, img]:
        try:
            results = reader.readtext(
                source,
                allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
            )
            for (_, text, confidence) in results:
                plate = clean_plate(text)
                if 5 <= len(plate) <= 10 and confidence > 0.3:
                    plates.append({"plate": plate, "confidence": round(confidence, 3)})
        except Exception:
            pass

    # Убираем дубликаты, сортируем по уверенности
    seen = set()
    unique = []
    for p in sorted(plates, key=lambda x: -x["confidence"]):
        if p["plate"] not in seen:
            seen.add(p["plate"])
            unique.append(p)

    best = unique[0]["plate"] if unique else None
    print(f"🔍 OCR результат: {unique} | лучший: {best}")

    return jsonify({"plates": unique, "best": best})


if __name__ == "__main__":
    get_reader()  # Предзагрузка при старте
    print("🚀 OCR сервис запущен на http://0.0.0.0:5001")
    print("   Для публичного доступа: ngrok http 5001")
    app.run(host="0.0.0.0", port=5001, debug=False)
