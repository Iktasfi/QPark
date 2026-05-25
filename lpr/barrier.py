"""
QPark — LPR Barrier Controller
================================
Запускается на каждом шлагбауме (Raspberry Pi или обычный ПК с камерой).
Читает номера через OpenCV + EasyOCR, отправляет на бэкенд, открывает шлагбаум.

Установка зависимостей:
    pip install opencv-python easyocr requests numpy

Для Raspberry Pi (управление GPIO реле):
    pip install RPi.GPIO

Запуск:
    python barrier.py                      # интерактивный (камера)
    python barrier.py --demo               # демо-режим (ввод номера с клавиатуры)
    python barrier.py --spot SP-05 --dir entry
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

# На macOS используем AVFoundation для доступа к камере
_CAP_BACKEND = cv2.CAP_AVFOUNDATION if platform.system() == "Darwin" else cv2.CAP_ANY

# Общее состояние шлагбаума (обновляется из потока process_plate)
_barrier_state = {
    "status": "IDLE",       # IDLE | OPENING | OPEN | DENIED
    "plate":  "",
    "until":  0.0,          # time.time() до которого показывать баннер
    "lock":   threading.Lock(),
}

def _set_barrier_state(status: str, plate: str = "", duration: float = 4.0):
    with _barrier_state["lock"]:
        _barrier_state["status"] = status
        _barrier_state["plate"]  = plate
        _barrier_state["until"]  = time.time() + duration

def _get_barrier_state():
    with _barrier_state["lock"]:
        return dict(_barrier_state)

# ─────────────────────────────────────────────
# КОНФИГУРАЦИЯ — меняйте под каждый шлагбаум
# ─────────────────────────────────────────────
BACKEND_URL   = "https://qpark-production.up.railway.app"  # Railway бэкенд
SPOT_NUMBER   = "SP-01"                      # Номер места, которое контролирует этот шлагбаум
DIRECTION     = "entry"                      # "entry" или "exit"
CAMERA_INDEX  = 1                            # Индекс камеры (0 — встроенная, 1 — USB/внешняя)
BARRIER_PIN   = 18                           # GPIO пин реле (Raspberry Pi)
SCAN_COOLDOWN = 8                            # Сек. паузы после успешного считывания
MIN_CONFIDENCE = 0.5                         # Минимальная уверенность EasyOCR (0–1)
FRAME_SKIP    = 5                            # Обрабатывать каждый N-й кадр

# ─────────────────────────────────────────────
# GPIO (только Raspberry Pi)
# ─────────────────────────────────────────────
GPIO_AVAILABLE = False
try:
    import RPi.GPIO as GPIO
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(BARRIER_PIN, GPIO.OUT, initial=GPIO.LOW)
    GPIO_AVAILABLE = True
    print("✅ GPIO инициализирован")
except ImportError:
    print("ℹ️  RPi.GPIO не найден — симуляция шлагбаума через консоль")


def open_barrier(seconds: float = 5.0):
    """Открыть шлагбаум на заданное время."""
    if GPIO_AVAILABLE:
        GPIO.output(BARRIER_PIN, GPIO.HIGH)
        print(f"🔓 ШЛАГБАУМ ОТКРЫТ (GPIO pin {BARRIER_PIN})")
        time.sleep(seconds)
        GPIO.output(BARRIER_PIN, GPIO.LOW)
        print("🔒 Шлагбаум закрыт")
    else:
        print(f"🔓 [СИМУЛЯЦИЯ] ШЛАГБАУМ ОТКРЫТ на {seconds:.0f} сек.")
        time.sleep(seconds)
        print("🔒 [СИМУЛЯЦИЯ] Шлагбаум закрыт")


# ─────────────────────────────────────────────
# API — отправить номер на бэкенд
# ─────────────────────────────────────────────
def notify_backend(car_plate: str, spot_number: str, direction: str) -> dict:
    """Отправить данные на бэкенд и получить решение об открытии."""
    endpoint = "/parking/lpr/entry" if direction == "entry" else "/parking/lpr/exit-lpr"
    url = BACKEND_URL + endpoint
    payload = {"carPlate": car_plate, "spotNumber": spot_number}

    try:
        resp = requests.post(url, json=payload, timeout=5)
        return resp.json()
    except requests.exceptions.ConnectionError:
        print(f"❌ Нет соединения с бэкендом ({url})")
        return {"success": False, "message": "Backend unreachable"}
    except requests.exceptions.Timeout:
        print("❌ Таймаут запроса к бэкенду")
        return {"success": False, "message": "Timeout"}
    except Exception as e:
        print(f"❌ Ошибка запроса: {e}")
        return {"success": False, "message": str(e)}


# ─────────────────────────────────────────────
# Очистка и валидация номера
# ─────────────────────────────────────────────
def clean_plate(raw: str) -> str:
    """Убрать лишние символы, привести к верхнему регистру."""
    cleaned = re.sub(r"[^A-Z0-9А-ЯЁ]", "", raw.upper())
    return cleaned


def is_valid_plate(plate: str) -> bool:
    """Простая проверка: от 5 до 10 символов."""
    return 5 <= len(plate) <= 10


# ─────────────────────────────────────────────
# Обработка одного считанного номера
# ─────────────────────────────────────────────
def process_plate(plate: str, spot_number: str, direction: str):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"\n[{ts}] 🚗 Номер: {plate} | Место: {spot_number} | Направление: {direction}")

    _set_barrier_state("OPENING", plate, duration=1.5)
    result = notify_backend(plate, spot_number, direction)
    print(f"    📡 Ответ бэкенда: {result}")

    if result.get("success"):
        print(f"    ✅ ДОСТУП РАЗРЕШЁН — {result.get('message', '')}")
        _set_barrier_state("OPEN", plate, duration=5.5)
        threading.Thread(target=open_barrier, args=(5.0,), daemon=True).start()
    else:
        print(f"    ❌ ДОСТУП ЗАПРЕЩЁН — {result.get('message', 'No reason')}")
        _set_barrier_state("DENIED", plate, duration=4.0)


# ─────────────────────────────────────────────
# ДЕМО-РЕЖИМ — ввод номера вручную
# ─────────────────────────────────────────────
def run_demo(spot_number: str, direction: str):
    print(f"\n=== QPark LPR ДЕМО-РЕЖИМ ===")
    print(f"Место: {spot_number} | Направление: {direction}")
    print("Введите номер автомобиля (или 'q' для выхода):\n")

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
            print("  ⚠️  Пустой номер, пропускаем")
            continue

        process_plate(plate, spot_number, direction)


# ─────────────────────────────────────────────
# ОСНОВНОЙ РЕЖИМ — реальная камера + EasyOCR
# ─────────────────────────────────────────────
def _draw_hud(frame: np.ndarray, spot_number: str, direction: str,
              last_plate: str, last_scan_ts: float, frame_w: int, frame_h: int):
    """Рисует весь интерфейс поверх кадра камеры."""
    now = time.time()
    state = _get_barrier_state()
    status  = state["status"]
    s_plate = state["plate"]
    active  = now < state["until"]

    # ── Цвета по статусу ─────────────────────────────
    COLOR = {
        "IDLE":    (180, 180, 180),
        "OPENING": (0, 200, 255),
        "OPEN":    (0, 220, 80),
        "DENIED":  (0, 60, 240),
    }
    col = COLOR.get(status if active else "IDLE", (180, 180, 180))

    # ── Тёмная полоска-шапка ─────────────────────────
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (frame_w, 56), (20, 25, 40), -1)
    cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)

    dir_label = "ВЪЕЗД ▼" if direction == "entry" else "ВЫЕЗД ▲"
    cv2.putText(frame, f"QPark LPR  |  {spot_number}  |  {dir_label}",
                (14, 36), cv2.FONT_HERSHEY_DUPLEX, 0.75, (220, 220, 220), 1, cv2.LINE_AA)
    ts_str = datetime.now().strftime("%H:%M:%S")
    cv2.putText(frame, ts_str, (frame_w - 120, 36),
                cv2.FONT_HERSHEY_DUPLEX, 0.65, (140, 140, 140), 1, cv2.LINE_AA)

    # ── Прицельный квадрат по центру ─────────────────
    box_w, box_h = int(frame_w * 0.55), int(frame_h * 0.22)
    cx, cy = frame_w // 2, int(frame_h * 0.58)
    x1, y1 = cx - box_w // 2, cy - box_h // 2
    x2, y2 = cx + box_w // 2, cy + box_h // 2
    corner = 28   # длина уголка

    box_col = col if (active and status in ("OPENING", "OPEN", "DENIED")) else (80, 200, 255)

    # Полупрозрачная заливка прицела
    roi = frame[y1:y2, x1:x2]
    fill = np.zeros_like(roi)
    fill[:] = box_col
    frame[y1:y2, x1:x2] = cv2.addWeighted(fill, 0.07, roi, 0.93, 0)

    # Уголки прицела
    thick = 3
    for (px, py, dx, dy) in [
        (x1, y1,  1,  1), (x2, y1, -1,  1),
        (x1, y2,  1, -1), (x2, y2, -1, -1),
    ]:
        cv2.line(frame, (px, py), (px + dx * corner, py), box_col, thick, cv2.LINE_AA)
        cv2.line(frame, (px, py), (px, py + dy * corner), box_col, thick, cv2.LINE_AA)

    # Подпись под прицелом
    hint = "Наведите номерной знак сюда"
    tw = cv2.getTextSize(hint, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)[0][0]
    cv2.putText(frame, hint, (cx - tw // 2, y2 + 22),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, box_col, 1, cv2.LINE_AA)

    # ── Cooldown полоска ──────────────────────────────
    elapsed = now - last_scan_ts
    if elapsed < SCAN_COOLDOWN and last_scan_ts > 0:
        remaining = SCAN_COOLDOWN - elapsed
        ratio = remaining / SCAN_COOLDOWN
        bar_y = frame_h - 10
        cv2.rectangle(frame, (0, bar_y - 6), (frame_w, bar_y), (40, 40, 60), -1)
        cv2.rectangle(frame, (0, bar_y - 6), (int(frame_w * (1 - ratio)), bar_y), (0, 180, 220), -1)
        cv2.putText(frame, f"Пауза: {remaining:.1f}с", (10, bar_y - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 180, 220), 1, cv2.LINE_AA)

    # ── Большой статусный баннер ──────────────────────
    if active and status != "IDLE":
        labels = {
            "OPENING": "ПРОВЕРКА...",
            "OPEN":    "ШЛАГБАУМ ОТКРЫТ",
            "DENIED":  "ДОСТУП ЗАПРЕЩЁН",
        }
        banner_text  = labels.get(status, status)
        banner_h = 110
        by1, by2 = frame_h // 2 - banner_h // 2, frame_h // 2 + banner_h // 2

        overlay2 = frame.copy()
        cv2.rectangle(overlay2, (0, by1), (frame_w, by2), col, -1)
        cv2.addWeighted(overlay2, 0.82, frame, 0.18, 0, frame)

        # Номер крупно
        font_scale = 2.4
        thick_main = 4
        tw2 = cv2.getTextSize(s_plate, cv2.FONT_HERSHEY_DUPLEX, font_scale, thick_main)[0][0]
        cv2.putText(frame, s_plate,
                    (cx - tw2 // 2, by1 + 70),
                    cv2.FONT_HERSHEY_DUPLEX, font_scale, (255, 255, 255), thick_main, cv2.LINE_AA)

        # Статус подпись
        tw3 = cv2.getTextSize(banner_text, cv2.FONT_HERSHEY_SIMPLEX, 0.75, 2)[0][0]
        cv2.putText(frame, banner_text,
                    (cx - tw3 // 2, by2 - 12),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2, cv2.LINE_AA)

    # ── Последний номер внизу слева ───────────────────
    if last_plate and (not active or status == "IDLE"):
        cv2.putText(frame, f"Последний: {last_plate}",
                    (14, frame_h - 18),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (160, 220, 255), 1, cv2.LINE_AA)


def run_camera(spot_number: str, direction: str):
    print(f"\n=== QPark LPR КАМЕРА ===")
    print(f"Место: {spot_number} | Направление: {direction}")
    print("Инициализация EasyOCR (первый запуск занимает ~30 сек.)...")

    reader = easyocr.Reader(["en", "ru"], gpu=False, verbose=False)
    cap    = cv2.VideoCapture(CAMERA_INDEX, _CAP_BACKEND)

    if not cap.isOpened():
        print(f"❌ Не удаётся открыть камеру {CAMERA_INDEX}")
        sys.exit(1)

    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    print("✅ Камера готова. Нажмите 'q' для выхода.\n")

    last_plate   = ""
    last_scan_ts = 0.0
    frame_count  = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            print("❌ Ошибка чтения кадра")
            break

        frame_h, frame_w = frame.shape[:2]
        frame_count += 1

        in_cooldown = (time.time() - last_scan_ts) < SCAN_COOLDOWN and last_scan_ts > 0

        # OCR только на каждый N-й кадр и вне cooldown
        if frame_count % FRAME_SKIP == 0 and not in_cooldown:
            gray     = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            clahe    = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            enhanced = clahe.apply(gray)

            results = reader.readtext(
                enhanced,
                allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz"
            )

            best_plate = ""
            best_conf  = 0.0

            for (bbox, text, confidence) in results:
                plate = clean_plate(text)
                if is_valid_plate(plate) and confidence > MIN_CONFIDENCE:
                    if confidence > best_conf:
                        best_plate = plate
                        best_conf  = confidence
                    # Зелёная рамка вокруг найденного текста
                    pts = np.array([(int(p[0]), int(p[1])) for p in bbox])
                    cv2.polylines(frame, [pts], True, (0, 230, 80), 2, cv2.LINE_AA)
                    cv2.putText(frame, f"{plate}  {confidence:.0%}",
                                (pts[0][0], pts[0][1] - 8),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 230, 80), 2, cv2.LINE_AA)

            if best_plate and best_plate != last_plate:
                last_plate   = best_plate
                last_scan_ts = time.time()
                threading.Thread(
                    target=process_plate,
                    args=(best_plate, spot_number, direction),
                    daemon=True,
                ).start()

        _draw_hud(frame, spot_number, direction, last_plate, last_scan_ts, frame_w, frame_h)

        cv2.imshow("QPark LPR", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
    if GPIO_AVAILABLE:
        GPIO.cleanup()


# ─────────────────────────────────────────────
# ТОЧКА ВХОДА
# ─────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="QPark LPR Barrier Controller")
    parser.add_argument("--spot",  default=SPOT_NUMBER, help="Номер места (напр. SP-01)")
    parser.add_argument("--dir",   default=DIRECTION,   choices=["entry", "exit"], help="Направление")
    parser.add_argument("--demo",  action="store_true",  help="Демо-режим (без камеры)")
    parser.add_argument("--cam",   type=int, default=CAMERA_INDEX, help="Индекс камеры")
    args = parser.parse_args()

    CAMERA_INDEX = args.cam

    if args.demo:
        run_demo(args.spot, args.dir)
    else:
        run_camera(args.spot, args.dir)
