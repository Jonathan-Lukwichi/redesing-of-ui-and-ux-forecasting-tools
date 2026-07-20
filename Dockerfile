# ---------- Stage 1: build the React frontend ----------
FROM node:20-alpine AS frontend
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY vite.config.js index.html ./
COPY public ./public
COPY src ./src
RUN npm run build

# ---------- Stage 2: Python backend serving API + built frontend ----------
FROM python:3.12-slim
WORKDIR /app

COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY api/ .

# The msc-modelling handover artefacts normally arrive as a git submodule.
# If the build context didn't include them (submodules not checked out),
# fetch the pinned branch directly — the repo is public.
RUN if [ ! -f external/msc-modelling/artefacts/handover_to_webapp/task1_daily_arrivals/metrics/headline.json ]; then \
      apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
      && rm -rf /var/lib/apt/lists/* \
      && rm -rf external/msc-modelling \
      && git clone --depth 1 --branch claude/review-dissertation-repos-UQtqT \
           https://github.com/Jonathan-Lukwichi/msc-modelling.git external/msc-modelling ; \
    fi

COPY --from=frontend /build/dist ./static

ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
