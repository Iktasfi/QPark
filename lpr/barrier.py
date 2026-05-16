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
from datetime import datetime

# ─────────────────────────────────────────────
# КОНФИГУРАЦИЯ — меняйте под каждый шлагбаум
# ─────────────────────────────────────────────
BACKEND_URL   = "http://192.168.1.68:3001"  # IP вашего сервера
SPOT_NUMBER   = "SP-01"                      # Номер места, которое контролирует этот шлагбаум
DIRECTION     = "entry"                      # "entry" или "exit"
CAMERA_INDEX  = 0                            # Индекс камеры (0 — встроенная, 1 — USB)
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

    result = notify_backend(plate, spot_number, direction)
    print(f"    📡 Ответ бэкенда: {result}")

    if result.get("success"):
        print(f"    ✅ ДОСТУП РАЗРЕШЁН — {result.get('message', '')}")
        threading.Thread(target=open_barrier, args=(5.0,), daemon=True).start()
    else:
        print(f"    ❌ ДОСТУП ЗАПРЕЩЁН — {result.get('message', 'No reason')}")


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
def run_camera(spot_number: str, direction: str):
    print(f"\n=== QPark LPR КАМЕРА ===")
    print(f"Место: {spot_number} | Направление: {direction}")
    print("Инициализация EasyOCR (первый запуск занимает ~30 сек.)...")

    reader = easyocr.Reader(["en", "ru"], gpu=False, verbose=False)
    cap    = cv2.VideoCapture(CAMERA_INDEX)

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

        frame_count += 1

        # Пропускаем кадры для снижения нагрузки
        if frame_count % FRAME_SKIP != 0:
            cv2.imshow("QPark LPR", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
            continue

        now = time.time()

        # Пауза после последнего считывания
        if now - last_scan_ts < SCAN_COOLDOWN:
            remaining = SCAN_COOLDOWN - (now - last_scan_ts)
            cv2.putText(frame, f"Cooldown: {remaining:.1f}s", (10, 40),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 165, 255), 2)
            cv2.imshow("QPark LPR", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
            continue

        # Предобработка: серый + усиление контраста
        gray    = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        clahe   = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)

        # OCR
        results = reader.readtext(enhanced, allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz")

        best_plate = ""
        best_conf  = 0.0

        for (bbox, text, confidence) in results:
            plate = clean_plate(text)
            if is_valid_plate(plate) and confidence > MIN_CONFIDENCE:
                if confidence > best_conf:
                    best_plate = plate
                    best_conf  = confidence

                # Отобразить рамку вокруг номера
                pts = [(int(p[0]), int(p[1])) for p in bbox]
                cv2.polylines(frame, [__import__("numpy").array(pts)], True, (0, 255, 0), 2)
                cv2.putText(frame, f"{plate} ({confidence:.0%})",
                            (pts[0][0], pts[0][1] - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

        # Если нашли номер — отправляем на бэкенд
        if best_plate and best_plate != last_plate:
            last_plate   = best_plate
            last_scan_ts = now
            threading.Thread(
                target=process_plate,
                args=(best_plate, spot_number, direction),
                daemon=True,
            ).start()

        # HUD
        cv2.putText(frame, f"Spot: {spot_number} | {direction.upper()}", (10, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        if last_plate:
            cv2.putText(frame, f"Last: {last_plate}", (10, 80),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 200, 255), 2)

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
