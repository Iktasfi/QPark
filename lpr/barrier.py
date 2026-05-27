"""
QPark LPR — EasyOCR камера
===========================
Запуск:
    C:\Users\User\AppData\Local\Programs\Python\Python311\python.exe barrier.py

Управление:
    SPACE  — сканировать номер с камеры
    Q      — выход

Установка (один раз):
    pip install opencv-python easyocr requests numpy
"""

import cv2
import easyocr
import requests
import time
import threading
import sys
import re
import platform
import numpy as np
from datetime import datetime

# ─── НАСТРОЙКИ ──────────────────────────────────
BACKEND_URL   = "https://qpark-production.up.railway.app"
CAMERA_INDEX  = 0      # 0 — встроенная, 1 — внешняя USB
# ────────────────────────────────────────────────

_CAP_BACKEND = cv2.CAP_AVFOUNDATION if platform.system() == "Darwin" else cv2.CAP_ANY

_state = {
    "status":    "IDLE",
    "plate":     "",
    "direction": "",
    "spot":      "",
    "message":   "",
    "until":     0.0,
    "lock":      threading.Lock(),
}

def set_state(status, plate="", direction="", spot="", message="", duration=5.0):
    with _state["lock"]:
        _state["status"]    = status
        _state["plate"]     = plate
        _state["direction"] = direction
        _state["spot"]      = spot
        _state["message"]   = message
        _state["until"]     = time.time() + duration

def get_state():
    with _state["lock"]:
        return dict(_state)


def scan_backend(car_plate: str) -> dict:
    try:
        resp = requests.post(
            BACKEND_URL + "/parking/lpr/scan",
            json={"carPlate": car_plate},
            timeout=6
        )
        return resp.json()
    except requests.exceptions.ConnectionError:
        return {"success": False, "message": "Нет соединения с сервером"}
    except requests.exceptions.Timeout:
        return {"success": False, "message": "Сервер не отвечает"}
    except Exception as e:
        return {"success": False, "message": str(e)}


def process_plate(plate: str):
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] 🚗 Номер: {plate}")
    set_state("SCANNING", plate, message="Проверка...", duration=10.0)

    result = scan_backend(plate)
    print(f"📡 Ответ: {result}")

    if result.get("success"):
        direction = result.get("direction", "entry")
        spot      = result.get("spotNumber", "")
        msg       = result.get("message", "")
        print(f"✅ {msg}")
        set_state(
            "OPEN_ENTRY" if direction == "entry" else "OPEN_EXIT",
            plate, direction, spot, msg, duration=6.0
        )
        print("🔓 ШЛАГБАУМ ОТКРЫТ")
        time.sleep(5.0)
        print("🔒 Шлагбаум закрыт\n")
        set_state("IDLE")
    else:
        msg = result.get("message", "Доступ запрещён")
        print(f"❌ ОТКАЗ: {msg}\n")
        set_state("DENIED", plate, message=msg, duration=4.0)


def clean_plate(raw: str) -> str:
    return re.sub(r"[^A-Z0-9А-ЯЁ]", "", raw.upper())

def is_valid(plate: str) -> bool:
    return 4 <= len(plate) <= 12


def draw_ui(frame, scanning: bool):
    h, w = frame.shape[:2]
    now   = time.time()
    state = get_state()
    active = now < state["until"]
    status = state["status"] if active else "IDLE"

    # Цвета по статусу
    COLORS = {
        "IDLE":       (60, 60, 60),
        "SCANNING":   (0, 200, 255),
        "OPEN_ENTRY": (0, 200, 60),
        "OPEN_EXIT":  (0, 160, 255),
        "DENIED":     (40, 40, 220),
    }
    col = COLORS.get(status, (60, 60, 60))

    # ── Верхняя полоса ────────────────────────────
    cv2.rectangle(frame, (0, 0), (w, 48), (10, 15, 25), -1)
    cv2.putText(frame, "QPARK LPR SYSTEM",
                (14, 32), cv2.FONT_HERSHEY_DUPLEX, 0.8, (200, 200, 200), 1, cv2.LINE_AA)
    ts = datetime.now().strftime("%H:%M:%S")
    cv2.putText(frame, ts, (w - 110, 32),
                cv2.FONT_HERSHEY_DUPLEX, 0.65, (130, 130, 130), 1, cv2.LINE_AA)

    # ── Прицельная рамка ─────────────────────────
    bw = int(w * 0.65)
    bh = int(h * 0.25)
    cx, cy = w // 2, int(h * 0.55)
    x1, y1 = cx - bw // 2, cy - bh // 2
    x2, y2 = cx + bw // 2, cy + bh // 2
    c = 30  # длина уголка

    frame_col = (0, 255, 200) if scanning else col if (active and status != "IDLE") else (200, 200, 0)
    thick = 3

    for (px, py, dx, dy) in [(x1,y1,1,1),(x2,y1,-1,1),(x1,y2,1,-1),(x2,y2,-1,-1)]:
        cv2.line(frame, (px, py), (px+dx*c, py), frame_col, thick, cv2.LINE_AA)
        cv2.line(frame, (px, py), (px, py+dy*c), frame_col, thick, cv2.LINE_AA)

    # Подсвечиваем зону
    roi  = frame[y1:y2, x1:x2].copy()
    fill = np.zeros_like(roi)
    fill[:] = frame_col
    frame[y1:y2, x1:x2] = cv2.addWeighted(fill, 0.06, roi, 0.94, 0)

    # ── Нижняя подсказка ─────────────────────────
    cv2.rectangle(frame, (0, h-40), (w, h), (10, 15, 25), -1)
    hint = "SCANNING..." if scanning else "SPACE = сканировать  |  Q = выход"
    hint_col = (0, 220, 255) if scanning else (160, 160, 160)
    tw = cv2.getTextSize(hint, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 1)[0][0]
    cv2.putText(frame, hint, (w//2 - tw//2, h-12),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, hint_col, 1, cv2.LINE_AA)

    # ── Статусный баннер ─────────────────────────
    if active and status != "IDLE":
        baner_h = 130
        by1 = h//2 - baner_h//2
        by2 = h//2 + baner_h//2

        ov = frame.copy()
        cv2.rectangle(ov, (0, by1), (w, by2), col, -1)
        cv2.addWeighted(ov, 0.88, frame, 0.12, 0, frame)

        plate_txt = state["plate"]
        fs = 2.4
        tw2 = cv2.getTextSize(plate_txt, cv2.FONT_HERSHEY_DUPLEX, fs, 4)[0][0]
        cv2.putText(frame, plate_txt, (w//2 - tw2//2, by1 + 75),
                    cv2.FONT_HERSHEY_DUPLEX, fs, (255,255,255), 4, cv2.LINE_AA)

        # Направление + место
        direction = state["direction"].upper() if state["direction"] else ""
        spot      = state["spot"]
        dir_label = f"{'▼ ВЪЕЗД' if direction == 'ENTRY' else '▲ ВЫЕЗД' if direction == 'EXIT' else ''}"
        info = f"{dir_label}  {spot}  {datetime.now().strftime('%H:%M:%S')}"
        tw3  = cv2.getTextSize(info, cv2.FONT_HERSHEY_SIMPLEX, 0.65, 2)[0][0]
        cv2.putText(frame, info, (w//2 - tw3//2, by2 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255,255,255), 2, cv2.LINE_AA)

    elif scanning:
        # "SCANNING..." анимация
        txt = "SCANNING..."
        tw4 = cv2.getTextSize(txt, cv2.FONT_HERSHEY_DUPLEX, 1.2, 2)[0][0]
        cv2.putText(frame, txt, (w//2 - tw4//2, cy + bh//2 + 50),
                    cv2.FONT_HERSHEY_DUPLEX, 1.2, (0, 220, 255), 2, cv2.LINE_AA)


def main():
    print("=== QPark LPR ===")
    print("Инициализация EasyOCR (первый раз ~30 сек.)...")

    reader = easyocr.Reader(["en", "ru"], gpu=False, verbose=False)
    print("✅ EasyOCR готов\n")

    cap = cv2.VideoCapture(CAMERA_INDEX, _CAP_BACKEND)
    if not cap.isOpened():
        cap = cv2.VideoCapture(1, _CAP_BACKEND)
        if not cap.isOpened():
            print("❌ Камера не найдена!")
            sys.exit(1)

    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    print("✅ Камера готова")
    print("👉 Нажмите SPACE чтобы сканировать номер\n")

    scanning = False

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        h, w = frame.shape[:2]
        draw_ui(frame, scanning)
        cv2.imshow("QPark LPR", frame)

        key = cv2.waitKey(30) & 0xFF

        if key == ord(" ") and not scanning:
            scanning = True
            state = get_state()
            if state["status"] in ("OPEN_ENTRY", "OPEN_EXIT", "DENIED", "IDLE"):
                # Берём зону прицела и запускаем OCR
                bw = int(w * 0.65)
                bh = int(h * 0.25)
                cx, cy = w // 2, int(h * 0.55)
                x1 = max(0, cx - bw//2)
                y1 = max(0, cy - bh//2)
                x2 = min(w, cx + bw//2)
                y2 = min(h, cy + bh//2)
                crop = frame[y1:y2, x1:x2].copy()

                def do_scan(img):
                    global scanning
                    gray     = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                    clahe    = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8,8))
                    enhanced = clahe.apply(gray)

                    results = reader.readtext(
                        enhanced,
                        allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
                    )

                    best_plate, best_conf = "", 0.0
                    for (_, text, conf) in results:
                        p = clean_plate(text)
                        if is_valid(p) and conf > 0.3 and conf > best_conf:
                            best_plate, best_conf = p, conf

                    scanning = False

                    if best_plate:
                        print(f"🔎 OCR: {best_plate}  ({best_conf:.0%})")
                        process_plate(best_plate)
                    else:
                        print("⚠️  Номер не распознан — попробуйте ещё раз")
                        set_state("DENIED", message="Номер не распознан", duration=2.5)

                threading.Thread(target=do_scan, args=(crop,), daemon=True).start()

        elif key == ord("q") or key == ord("Q") or key == 27:
            break

    cap.release()
    cv2.destroyAllWindows()
    print("Выход.")


if __name__ == "__main__":
    main()
