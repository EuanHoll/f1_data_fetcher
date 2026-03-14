FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY apps/worker/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY apps/worker /app

RUN mkdir -p /data/fastf1-cache

EXPOSE 8080

CMD ["python", "ingest_control_api.py"]
