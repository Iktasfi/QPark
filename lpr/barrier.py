# QPark LPR - EasyOCR camera
# Run: python barrier.py
# SPACE = scan plate, Q = quit

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

BACKEND_URL  = "https://qpark-production.up.railway.app"
CAMERA_INDEX = 0

_CAP_BACKEND = cv2.CAP_AVFOUNDATION if platform.system() == "Darwin" else cv2.CAP_ANY

_state = {
    "status":    "IDLE",
    "plate":     "",
    "direction": "",
    "spot":      "",
    "until":     0.0,
    "lock":      threading.Lock(),
}

scanning = [False]  # list so threads can modify it

def set_state(status, plate="", direction="", spot="", duration=5.0):
    with _state["lock"]:
        _state["status"]    = status
        _state["plate"]     = plate
        _state["direction"] = direction
        _state["spot"]      = spot
        _state["until"]     = time.time() + duration

def get_state():
    with _state["lock"]:
        return dict(_state)


def scan_backend(plate):
    try:
        r = requests.post(
            BACKEND_URL + "/parking/lpr/scan",
            json={"carPlate": plate},
            timeout=6
        )
        return r.json()
    except requests.exceptions.ConnectionError:
        return {"success": False, "message": "No connection"}
    except Exception as e:
        return {"success": False, "message": str(e)}


def process_plate(plate):
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Plate: {plate}")
    set_state("SCANNING", plate, duration=10.0)

    result = scan_backend(plate)
    print(f"Server: {result}")

    if result.get("success"):
        direction = result.get("direction", "entry")
        spot      = result.get("spotNumber", "")
        print(f"OK [{direction.upper()}] {spot}")
        set_state("OPEN_ENTRY" if direction == "entry" else "OPEN_EXIT",
                  plate, direction, spot, duration=6.0)
        print("BARRIER OPEN")
        time.sleep(5.0)
        print("BARRIER CLOSED")
        set_state("IDLE")
    else:
        print(f"DENIED: {result.get('message', '')}")
        set_state("DENIED", plate, duration=4.0)

    scanning[0] = False


def do_ocr(reader, crop):
    gray     = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    clahe    = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    results = reader.readtext(
        enhanced,
        allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    )

    best_plate, best_conf = "", 0.0
    for (_, text, conf) in results:
        p = re.sub(r"[^A-Z0-9]", "", text.upper())
        if 4 <= len(p) <= 12 and conf > 0.3 and conf > best_conf:
            best_plate, best_conf = p, conf

    if best_plate:
        print(f"OCR: {best_plate} ({best_conf:.0%})")
        process_plate(best_plate)
    else:
        print("Not recognized - try again")
        set_state("DENIED", "???", duration=2.0)
        scanning[0] = False


def draw_ui(frame, is_scanning):
    h, w = frame.shape[:2]
    now   = time.time()
    state = get_state()
    active = now < state["until"]
    status = state["status"] if active else "IDLE"

    COLORS = {
        "IDLE":       (60,  60,  60),
        "SCANNING":   (0,  200, 255),
        "OPEN_ENTRY": (0,  200,  60),
        "OPEN_EXIT":  (0,  160, 255),
        "DENIED":     (40,  40, 220),
    }
    col = COLORS.get(status, (60, 60, 60))

    # Top bar
    cv2.rectangle(frame, (0, 0), (w, 48), (10, 15, 25), -1)
    cv2.putText(frame, "QPARK LPR SYSTEM",
                (14, 32), cv2.FONT_HERSHEY_DUPLEX, 0.8, (200, 200, 200), 1, cv2.LINE_AA)
    cv2.putText(frame, datetime.now().strftime("%H:%M:%S"),
                (w - 110, 32), cv2.FONT_HERSHEY_DUPLEX, 0.65, (130, 130, 130), 1, cv2.LINE_AA)

    # Aim box
    bw = int(w * 0.65)
    bh = int(h * 0.28)
    cx = w // 2
    cy = int(h * 0.52)
    x1, y1 = cx - bw // 2, cy - bh // 2
    x2, y2 = cx + bw // 2, cy + bh // 2
    c = 32

    frame_col = (0, 255, 180) if is_scanning else col if (active and status != "IDLE") else (200, 200, 0)

    for (px, py, dx, dy) in [(x1,y1,1,1),(x2,y1,-1,1),(x1,y2,1,-1),(x2,y2,-1,-1)]:
        cv2.line(frame, (px, py), (px + dx*c, py), frame_col, 3, cv2.LINE_AA)
        cv2.line(frame, (px, py), (px, py + dy*c), frame_col, 3, cv2.LINE_AA)

    roi  = frame[y1:y2, x1:x2].copy()
    fill = np.zeros_like(roi); fill[:] = frame_col
    frame[y1:y2, x1:x2] = cv2.addWeighted(fill, 0.06, roi, 0.94, 0)

    # Bottom bar
    cv2.rectangle(frame, (0, h - 40), (w, h), (10, 15, 25), -1)
    if is_scanning:
        hint = "SCANNING..."
        hint_col = (0, 220, 255)
    else:
        hint = "SPACE = scan  |  Q = quit"
        hint_col = (160, 160, 160)
    tw = cv2.getTextSize(hint, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 1)[0][0]
    cv2.putText(frame, hint, (w // 2 - tw // 2, h - 12),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, hint_col, 1, cv2.LINE_AA)

    # Result banner
    if active and status != "IDLE":
        bh2 = 130
        by1 = h // 2 - bh2 // 2
        by2 = h // 2 + bh2 // 2

        ov = frame.copy()
        cv2.rectangle(ov, (0, by1), (w, by2), col, -1)
        cv2.addWeighted(ov, 0.88, frame, 0.12, 0, frame)

        plate_txt = state["plate"]
        tw2 = cv2.getTextSize(plate_txt, cv2.FONT_HERSHEY_DUPLEX, 2.4, 4)[0][0]
        cv2.putText(frame, plate_txt, (w // 2 - tw2 // 2, by1 + 78),
                    cv2.FONT_HERSHEY_DUPLEX, 2.4, (255, 255, 255), 4, cv2.LINE_AA)

        d = state["direction"].upper()
        s = state["spot"]
        label = ("ВЪЕЗД ▼" if d == "ENTRY" else "ВЫЕЗД ▲" if d == "EXIT" else "ОТКАЗ")
        info  = f"{label}   {s}"
        tw3   = cv2.getTextSize(info, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)[0][0]
        cv2.putText(frame, info, (w // 2 - tw3 // 2, by2 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)


def main():
    print("=== QPark LPR ===")
    print("Loading EasyOCR (first time ~30 sec)...")

    reader = easyocr.Reader(["en", "ru"], gpu=False, verbose=False)
    print("EasyOCR ready")

    cap = cv2.VideoCapture(CAMERA_INDEX, _CAP_BACKEND)
    if not cap.isOpened():
        cap = cv2.VideoCapture(1, _CAP_BACKEND)
    if not cap.isOpened():
        print("Camera not found!")
        sys.exit(1)

    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    print("Camera ready. Press SPACE to scan.\n")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        h, w = frame.shape[:2]
        draw_ui(frame, scanning[0])
        cv2.imshow("QPark LPR", frame)

        key = cv2.waitKey(30) & 0xFF

        if key == ord(" ") and not scanning[0]:
            scanning[0] = True
            bw = int(w * 0.65)
            bh = int(h * 0.28)
            cx, cy = w // 2, int(h * 0.52)
            x1 = max(0, cx - bw // 2)
            y1 = max(0, cy - bh // 2)
            x2 = min(w, cx + bw // 2)
            y2 = min(h, cy + bh // 2)
            crop = frame[y1:y2, x1:x2].copy()
            threading.Thread(target=do_ocr, args=(reader, crop), daemon=True).start()

        elif key in (ord("q"), ord("Q"), 27):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
