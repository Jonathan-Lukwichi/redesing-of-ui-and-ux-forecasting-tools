#!/bin/bash
pip install --no-cache-dir -r requirements.txt -q

exec python -m uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1
