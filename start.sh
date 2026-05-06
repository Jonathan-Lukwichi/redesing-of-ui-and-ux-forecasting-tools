#!/bin/bash
# Install dependencies (first run only)
pip install -r requirements.txt -q

# Start the API
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
