#!/bin/bash
cd "$(dirname "$0")"

# Activate virtual environment
source venv/bin/activate

# Start EasyOCR server (port 5001)
echo "🚀 Starting EasyOCR server on port 5001..."
python ocr_service.py &
OCR_PID=$!

echo "⏳ Waiting for EasyOCR to load models (~30 sec first time)..."
sleep 5

# Check it started
if ! curl -sf http://localhost:5001/health > /dev/null 2>&1; then
  echo "⏳ Still loading EasyOCR..."
  sleep 20
fi

if curl -sf http://localhost:5001/health > /dev/null 2>&1; then
  echo "✅ EasyOCR ready!"
else
  echo "❌ EasyOCR failed to start. Check logs above."
  kill $OCR_PID 2>/dev/null
  exit 1
fi

# Start ngrok tunnel (fixed domain)
echo "🌐 Starting ngrok tunnel → caring-moonlit-raven.ngrok-free.dev"
/opt/homebrew/bin/ngrok http --domain=caring-moonlit-raven.ngrok-free.dev 5001

# Cleanup when ngrok stops (Ctrl+C)
echo "🛑 Stopping OCR server..."
kill $OCR_PID 2>/dev/null
