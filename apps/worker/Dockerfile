FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY apps/worker/pyproject.toml /app/pyproject.toml
COPY apps/worker/uv.lock /app/uv.lock
RUN uv sync --frozen --no-dev

COPY apps/worker /app

RUN mkdir -p /data/fastf1-cache

EXPOSE 8080

CMD ["/usr/local/bin/uv", "run", "uvicorn", "worker_api:app", "--host", "0.0.0.0", "--port", "8080"]
