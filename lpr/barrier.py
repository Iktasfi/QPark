"""
QPark — LPR Barrier Controller (единый въезд/выезд)
=====================================================
Запуск:
    python barrier.py              # камера (EasyOCR)
    python barrier.py --demo       # демо-режим (ввод с клавиатуры)
    python barrier.py --cam 1      # другая камера

Установка зависимостей:
    pip install opencv-python easyocr requests numpy
"""

import cv2
import easyocr
import requests
import time
import re
import argparse
import threading
import sys
import platform
import numpy as np
from datetime import datetime

_CAP_BACKEND = cv2.CAP_AVFOUNDATION if platform.system() == "Darwin" else cv2.CAP_ANY

_barrier_state = {
    "status":    "IDLE",   # IDLE | CHECKING | OPEN_ENTRY | OPEN_EXIT | DENIED
    "plate":     "",
    "direction": "",       # "entry" | "exit"
    "spot":      "",
    "until":     0.0,
    "lock":      threading.Lock(),
}

def _set_state(status: str, plate: str = "", direction: str = "", spot: str = "", duration: float = 4.0):
    with _barrier_state["lock"]:
        _barrier_state["status"]    = status
        _barrier_state["plate"]     = plate
        _barrier_state["direction"] = direction
        _barrier_state["spot"]      = spot
        _barrier_state["until"]     = time.time() + duration

def _get_state():
    with _barrier_state["lock"]:
        return dict(_barrier_state)

# ─── КОНФИГУРАЦИЯ ───────────────────────────────
BACKEND_URL    = "https://qpark-production.up.railway.app"
CAMERA_INDEX   = 0        # 0 — встроенная камера, 1 — USB/внешняя
BARRIER_PIN    = 18       # GPIO пин (только Raspberry Pi)
SCAN_COOLDOWN  = 8        # Пауза после считывания (сек)
MIN_CONFIDENCE = 0.5      # Минимальная уверенность EasyOCR
FRAME_SKIP     = 5        # Обрабатывать каждый N-й кадр
# ────────────────────────────────────────────────

GPIO_AVAILABLE = False
try:
    import RPi.GPIO as GPIO
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(BARRIER_PIN, GPIO.OUT, initial=GPIO.LOW)
    GPIO_AVAILABLE = True
    print("✅ GPIO инициализирован")
except ImportError:
    print("ℹ️  RPi.GPIO не найден — симуляция через консоль")


def open_barrier(seconds: float = 5.0):
    if GPIO_AVAILABLE:
        GPIO.output(BARRIER_PIN, GPIO.HIGH)
        print(f"🔓 ШЛАГБАУМ ОТКРЫТ (GPIO {BARRIER_PIN})")
        time.sleep(seconds)
        GPIO.output(BARRIER_PIN, GPIO.LOW)
        print("🔒 Шлагбаум закрыт")
    else:
        print(f"🔓 [СИМ] ШЛАГБАУМ ОТКРЫТ на {seconds:.0f} сек.")
        time.sleep(seconds)
        print("🔒 [СИМ] Шлагбаум закрыт")


def scan_plate(car_plate: str) -> dict:
    """Отправить номер на единый эндпоинт — бэкенд сам решает въезд или выезд."""
    url = BACKEND_URL + "/parking/lpr/scan"
    try:
        resp = requests.post(url, json={"carPlate": car_plate}, timeout=5)
        return resp.json()
    except requests.exceptions.ConnectionError:
        print(f"❌ Нет соединения с бэкендом")
        return {"success": False, "message": "Backend unreachable"}
    except requests.exceptions.Timeout:
        print("❌ Таймаут")
        return {"success": False, "message": "Timeout"}
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        return {"success": False, "message": str(e)}


def clean_plate(raw: str) -> str:
    return re.sub(r"[^A-Z0-9А-ЯЁ]", "", raw.upper())

def is_valid_plate(plate: str) -> bool:
    return 5 <= len(plate) <= 10


def process_plate(plate: str):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"\n[{ts}] 🚗 Номер: {plate}")

    _set_state("CHECKING", plate, duration=2.0)
    result = scan_plate(plate)
    print(f"    📡 Ответ: {result}")

    if result.get("success"):
        direction = result.get("direction", "entry")
        spot      = result.get("spotNumber", "")
        msg       = result.get("message", "")
        status    = "OPEN_ENTRY" if direction == "entry" else "OPEN_EXIT"
        print(f"    ✅ ДОСТУП РАЗРЕШЁН [{direction.upper()}] — {msg}")
        _set_state(status, plate, direction, spot, duration=5.5)
        threading.Thread(target=open_barrier, args=(5.0,), daemon=True).start()
    else:
        print(f"    ❌ ОТКАЗ — {result.get('message', '')}")
        _set_state("DENIED", plate, duration=4.0)


# ─── ДЕМО-РЕЖИМ ─────────────────────────────────
def run_demo():
    print("\n=== QPark LPR ДЕМО-РЕЖИМ ===")
    print("Введите госномер (или 'q' для выхода):\n")
    while True:
        try:
            raw = input("Номер >> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nВыход.")
            break
        if raw.lower() == "q":
            break
        plate = clean_plate(raw)
        if not plate:
            print("  ⚠️  Пустой номер")
            continue
        process_plate(plate)


# ─── HUD (экран камеры) ──────────────────────────
def _draw_hud(frame, last_plate, last_scan_ts, frame_w, frame_h):
    now   = time.time()
    state = _get_state()
    status    = state["status"]
    s_plate   = state["plate"]
    direction = state["direction"]
    spot      = state["spot"]
    active    = now < state["until"]

    COLORS = {
        "IDLE":       (180, 180, 180),
        "CHECKING":   (0, 200, 255),
        "OPEN_ENTRY": (0, 220, 80),
        "OPEN_EXIT":  (0, 180, 255),
        "DENIED":     (0, 60, 240),
    }
    col = COLORS.get(status if active else "IDLE", (180, 180, 180))

    # Шапка
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (frame_w, 56), (20, 25, 40), -1)
    cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)
    cv2.putText(frame, "QPark LPR  |  Въезд / Выезд",
                (14, 36), cv2.FONT_HERSHEY_DUPLEX, 0.75, (220, 220, 220), 1, cv2.LINE_AA)
    cv2.putText(frame, datetime.now().strftime("%H:%M:%S"),
                (frame_w - 120, 36), cv2.FONT_HERSHEY_DUPLEX, 0.65, (140, 140, 140), 1, cv2.LINE_AA)

    # Прицел
    box_w, box_h = int(frame_w * 0.55), int(frame_h * 0.22)
    cx, cy = frame_w // 2, int(frame_h * 0.58)
    x1, y1 = cx - box_w // 2, cy - box_h // 2
    x2, y2 = cx + box_w // 2, cy + box_h // 2
    corner  = 28
    box_col = col if (active and status != "IDLE") else (80, 200, 255)

    roi  = frame[y1:y2, x1:x2]
    fill = np.zeros_like(roi); fill[:] = box_col
    frame[y1:y2, x1:x2] = cv2.addWeighted(fill, 0.07, roi, 0.93, 0)

    for (px, py, dx, dy) in [(x1,y1,1,1),(x2,y1,-1,1),(x1,y2,1,-1),(x2,y2,-1,-1)]:
        cv2.line(frame, (px, py), (px + dx*corner, py), box_col, 3, cv2.LINE_AA)
        cv2.line(frame, (px, py), (px, py + dy*corner), box_col, 3, cv2.LINE_AA)

    hint = "Наведите номерной знак сюда"
    tw = cv2.getTextSize(hint, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)[0][0]
    cv2.putText(frame, hint, (cx - tw//2, y2 + 22),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, box_col, 1, cv2.LINE_AA)

    # Cooldown полоска
    elapsed = now - last_scan_ts
    if elapsed < SCAN_COOLDOWN and last_scan_ts > 0:
        remaining = SCAN_COOLDOWN - elapsed
        bar_y = frame_h - 10
        cv2.rectangle(frame, (0, bar_y-6), (frame_w, bar_y), (40,40,60), -1)
        cv2.rectangle(frame, (0, bar_y-6), (int(frame_w*(1-remaining/SCAN_COOLDOWN)), bar_y), (0,180,220), -1)
        cv2.putText(frame, f"Пауза: {remaining:.1f}с", (10, bar_y-10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0,180,220), 1, cv2.LINE_AA)

    # Статусный баннер
    if active and status != "IDLE":
        labels = {
            "CHECKING":   "ПРОВЕРКА...",
            "OPEN_ENTRY": f"ВЪЕЗД РАЗРЕШЁН  ▼  {spot}",
            "OPEN_EXIT":  f"ВЫЕЗД РАЗРЕШЁН  ▲  {spot}",
            "DENIED":     "ДОСТУП ЗАПРЕЩЁН",
        }
        banner_text = labels.get(status, status)
        banner_h = 110
        by1, by2 = frame_h//2 - banner_h//2, frame_h//2 + banner_h//2

        ov2 = frame.copy()
        cv2.rectangle(ov2, (0, by1), (frame_w, by2), col, -1)
        cv2.addWeighted(ov2, 0.82, frame, 0.18, 0, frame)

        font_scale, thick_main = 2.4, 4
        tw2 = cv2.getTextSize(s_plate, cv2.FONT_HERSHEY_DUPLEX, font_scale, thick_main)[0][0]
        cv2.putText(frame, s_plate, (cx - tw2//2, by1+70),
                    cv2.FONT_HERSHEY_DUPLEX, font_scale, (255,255,255), thick_main, cv2.LINE_AA)

        tw3 = cv2.getTextSize(banner_text, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)[0][0]
        cv2.putText(frame, banner_text, (cx - tw3//2, by2-12),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255,255,255), 2, cv2.LINE_AA)

    if last_plate and (not active or status == "IDLE"):
        cv2.putText(frame, f"Последний: {last_plate}", (14, frame_h-18),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (160,220,255), 1, cv2.LINE_AA)


# ─── РЕЖИМ КАМЕРЫ ───────────────────────────────
def run_camera():
    print("\n=== QPark LPR КАМЕРА ===")
    print("Инициализация EasyOCR (~30 сек. первый раз)...")

    reader = easyocr.Reader(["en", "ru"], gpu=False, verbose=False)
    cap    = cv2.VideoCapture(CAMERA_INDEX, _CAP_BACKEND)

    if not cap.isOpened():
        print(f"❌ Камера {CAMERA_INDEX} недоступна")
        sys.exit(1)

    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    print("✅ Камера готова. 'q' — выход.\n")

    last_plate   = ""
    last_scan_ts = 0.0
    frame_count  = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            print("❌ Ошибка кадра")
            break

        frame_h, frame_w = frame.shape[:2]
        frame_count += 1
        in_cooldown = (time.time() - last_scan_ts) < SCAN_COOLDOWN and last_scan_ts > 0

        if frame_count % FRAME_SKIP == 0 and not in_cooldown:
            gray     = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            clahe    = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
            enhanced = clahe.apply(gray)

            results = reader.readtext(
                enhanced,
                allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz"
            )

            best_plate, best_conf = "", 0.0
            for (bbox, text, confidence) in results:
                plate = clean_plate(text)
                if is_valid_plate(plate) and confidence > MIN_CONFIDENCE:
                    if confidence > best_conf:
                        best_plate, best_conf = plate, confidence
                    pts = np.array([(int(p[0]), int(p[1])) for p in bbox])
                    cv2.polylines(frame, [pts], True, (0,230,80), 2, cv2.LINE_AA)
                    cv2.putText(frame, f"{plate} {confidence:.0%}",
                                (pts[0][0], pts[0][1]-8),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,230,80), 2, cv2.LINE_AA)

            if best_plate and best_plate != last_plate:
                last_plate   = best_plate
                last_scan_ts = time.time()
                threading.Thread(target=process_plate, args=(best_plate,), daemon=True).start()

        _draw_hud(frame, last_plate, last_scan_ts, frame_w, frame_h)
        cv2.imshow("QPark LPR", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
    if GPIO_AVAILABLE:
        GPIO.cleanup()


# ─── ТОЧКА ВХОДА ────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="QPark LPR — единый въезд/выезд")
    parser.add_argument("--demo", action="store_true", help="Демо-режим (ввод с клавиатуры)")
    parser.add_argument("--cam",  type=int, default=CAMERA_INDEX, help="Индекс камеры")
    args = parser.parse_args()

    CAMERA_INDEX = args.cam

    if args.demo:
        run_demo()
    else:
        run_camera()
