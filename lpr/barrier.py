"""
QPark LPR — Камера + ввод номера вручную
=========================================
Запуск:
    C:\Users\User\AppData\Local\Programs\Python\Python311\python.exe barrier.py

Управление:
    ENTER  — ввести госномер вручную
    Q      — выход

Установка (один раз):
    pip install opencv-python requests
"""

import cv2
import requests
import time
import threading
import sys
from datetime import datetime

# ─── НАСТРОЙКИ ──────────────────────────────────
BACKEND_URL   = "https://qpark-production.up.railway.app"
CAMERA_INDEX  = 0      # 0 — встроенная, 1 — внешняя USB
# ────────────────────────────────────────────────

# Состояние отображения на экране
_state = {
    "status":    "IDLE",   # IDLE | CHECKING | OPEN_ENTRY | OPEN_EXIT | DENIED
    "plate":     "",
    "message":   "",
    "spot":      "",
    "until":     0.0,
    "lock":      threading.Lock(),
}

def set_state(status, plate="", message="", spot="", duration=4.0):
    with _state["lock"]:
        _state["status"]  = status
        _state["plate"]   = plate
        _state["message"] = message
        _state["spot"]    = spot
        _state["until"]   = time.time() + duration

def get_state():
    with _state["lock"]:
        return dict(_state)


def scan_plate(car_plate: str) -> dict:
    """Отправить номер — бэкенд сам решает въезд или выезд."""
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
        return {"success": False, "message": "Сервер не отвечает (таймаут)"}
    except Exception as e:
        return {"success": False, "message": str(e)}


def process_in_thread(plate: str):
    """Запрос к бэкенду в отдельном потоке чтобы не замораживать камеру."""
    print(f"\n🔍 Проверяю номер: {plate} ...")
    set_state("CHECKING", plate, "Проверка...", duration=10.0)

    result = scan_plate(plate)
    print(f"📡 Ответ сервера: {result}")

    if result.get("success"):
        direction = result.get("direction", "entry")
        spot      = result.get("spotNumber", "")
        if direction == "entry":
            msg = f"ВЪЕЗД РАЗРЕШЁН ▼  {spot}"
            print(f"✅ {msg}")
            set_state("OPEN_ENTRY", plate, msg, spot, duration=6.0)
        else:
            msg = f"ВЫЕЗД РАЗРЕШЁН ▲  {spot}"
            print(f"✅ {msg}")
            set_state("OPEN_EXIT", plate, msg, spot, duration=6.0)

        # Симуляция шлагбаума
        print("🔓 ШЛАГБАУМ ОТКРЫТ")
        time.sleep(5.0)
        print("🔒 Шлагбаум закрыт\n")
    else:
        msg = result.get("message", "Доступ запрещён")
        print(f"❌ ОТКАЗ: {msg}\n")
        set_state("DENIED", plate, msg, duration=4.0)


def draw_overlay(frame, input_mode: bool, typed: str):
    """Рисует интерфейс поверх кадра."""
    h, w = frame.shape[:2]
    now   = time.time()
    state = get_state()
    active = now < state["until"]
    status = state["status"] if active else "IDLE"

    # Цвета
    COLORS = {
        "IDLE":       (100, 100, 100),
        "CHECKING":   (0, 200, 255),
        "OPEN_ENTRY": (0, 220, 80),
        "OPEN_EXIT":  (255, 180, 0),
        "DENIED":     (0, 50, 220),
    }
    col = COLORS.get(status, (100, 100, 100))

    # Верхняя полоска
    cv2.rectangle(frame, (0, 0), (w, 52), (15, 20, 35), -1)
    cv2.putText(frame, "QPark LPR  |  ВЪЕЗД / ВЫЕЗД",
                (12, 34), cv2.FONT_HERSHEY_DUPLEX, 0.8, (200, 200, 200), 1, cv2.LINE_AA)
    cv2.putText(frame, datetime.now().strftime("%H:%M:%S"),
                (w - 115, 34), cv2.FONT_HERSHEY_DUPLEX, 0.65, (130, 130, 130), 1, cv2.LINE_AA)

    # Нижняя подсказка
    if not input_mode:
        hint = "Нажмите ENTER чтобы ввести номер  |  Q — выход"
        tw = cv2.getTextSize(hint, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)[0][0]
        cv2.rectangle(frame, (0, h-38), (w, h), (15, 20, 35), -1)
        cv2.putText(frame, hint, (w//2 - tw//2, h-12),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (180, 180, 180), 1, cv2.LINE_AA)

    # Режим ввода номера
    if input_mode:
        cv2.rectangle(frame, (0, h//2 - 70), (w, h//2 + 70), (15, 20, 35), -1)
        label = "Введите госномер:"
        tw = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 1)[0][0]
        cv2.putText(frame, label, (w//2 - tw//2, h//2 - 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (180, 180, 255), 1, cv2.LINE_AA)

        display = typed + "|"
        tw2 = cv2.getTextSize(display, cv2.FONT_HERSHEY_DUPLEX, 1.8, 3)[0][0]
        cv2.putText(frame, display, (w//2 - tw2//2, h//2 + 30),
                    cv2.FONT_HERSHEY_DUPLEX, 1.8, (255, 255, 255), 3, cv2.LINE_AA)

        hint2 = "ENTER — отправить    ESC — отмена"
        tw3 = cv2.getTextSize(hint2, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)[0][0]
        cv2.putText(frame, hint2, (w//2 - tw3//2, h//2 + 60),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (130, 130, 130), 1, cv2.LINE_AA)

    # Статусный баннер (после ответа сервера)
    if active and status != "IDLE":
        banner_h = 120
        by1 = h//2 - banner_h//2
        by2 = h//2 + banner_h//2

        overlay = frame.copy()
        cv2.rectangle(overlay, (0, by1), (w, by2), col, -1)
        cv2.addWeighted(overlay, 0.85, frame, 0.15, 0, frame)

        plate_text = state["plate"]
        tw4 = cv2.getTextSize(plate_text, cv2.FONT_HERSHEY_DUPLEX, 2.2, 4)[0][0]
        cv2.putText(frame, plate_text, (w//2 - tw4//2, by1 + 72),
                    cv2.FONT_HERSHEY_DUPLEX, 2.2, (255, 255, 255), 4, cv2.LINE_AA)

        msg = state["message"]
        tw5 = cv2.getTextSize(msg, cv2.FONT_HERSHEY_SIMPLEX, 0.65, 2)[0][0]
        cv2.putText(frame, msg, (w//2 - tw5//2, by2 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2, cv2.LINE_AA)


def main():
    print("=== QPark LPR ===")
    print(f"Сервер: {BACKEND_URL}")
    print("Нажмите ENTER в окне камеры чтобы ввести номер\n")

    cap = cv2.VideoCapture(CAMERA_INDEX)
    if not cap.isOpened():
        # Попробуем камеру 1
        cap = cv2.VideoCapture(1)
        if not cap.isOpened():
            print("❌ Камера не найдена! Проверьте подключение.")
            sys.exit(1)

    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    input_mode = False
    typed      = ""

    while True:
        ret, frame = cap.read()
        if not ret:
            print("❌ Ошибка чтения кадра")
            break

        draw_overlay(frame, input_mode, typed)
        cv2.imshow("QPark LPR", frame)

        key = cv2.waitKey(30) & 0xFF

        if not input_mode:
            if key == 13:              # ENTER — начать ввод
                input_mode = True
                typed = ""
            elif key == ord("q") or key == ord("Q") or key == 27:
                break

        else:
            if key == 27:              # ESC — отмена
                input_mode = False
                typed = ""
            elif key == 13:            # ENTER — отправить
                plate = typed.strip().upper().replace(" ", "")
                if len(plate) >= 4:
                    input_mode = False
                    typed = ""
                    threading.Thread(
                        target=process_in_thread,
                        args=(plate,),
                        daemon=True
                    ).start()
                else:
                    typed = ""        # слишком короткий — сбросить
            elif key == 8:             # BACKSPACE
                typed = typed[:-1]
            elif 32 <= key <= 126:     # Обычные символы
                typed += chr(key).upper()

    cap.release()
    cv2.destroyAllWindows()
    print("Выход.")


if __name__ == "__main__":
    main()
