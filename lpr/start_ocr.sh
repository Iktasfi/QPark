#!/bin/bash
cd "$(dirname "$0")"
source venv/bin/activate

# Start OCR server in background
echo "🚀 Starting OCR server on port 5000..."
python ocr_server.py &
OCR_PID=$!
sleep 2

# Start ngrok with fixed domain
echo "🌐 Starting ngrok tunnel..."
ngrok http --domain=caring-moonlit-raven.ngrok-free.dev 5000

# Cleanup on exit
kill $OCR_PID 2>/dev/null
