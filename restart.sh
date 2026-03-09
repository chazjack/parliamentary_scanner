#!/bin/bash
# Restart the ParliScan dev server on port 8000

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Stopping server..."
pkill -f "python run.py" 2>/dev/null
pkill -f "uvicorn backend.main:app" 2>/dev/null
sleep 1

echo "Starting server..."
cd "$PROJECT_DIR"
source .venv/bin/activate
nohup python run.py > server.log 2>&1 &

echo "Server restarted (PID $!). Logs: $PROJECT_DIR/server.log"
