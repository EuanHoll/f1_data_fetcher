#!/bin/bash

set -e

COMPOSE_FILE="docker/convex/docker-compose.yml"
ENV_FILE="docker/convex/.env"
WORKER_CONCURRENCY="${WORKER_CONCURRENCY:-5}"

if [ "$1" = "--dev" ]; then
    echo "Starting Convex stack in development mode..."
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" --profile dev --profile tools up -d
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" --profile bootstrap run --rm worker-bootstrap
elif [ "$1" = "--prod" ]; then
    echo "Starting Convex stack in production mode (detached)..."
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" --profile bootstrap run --rm worker-bootstrap
    echo "Containers started in background."
    echo "Worker concurrency: $WORKER_CONCURRENCY"
    echo "View logs: docker compose --env-file $ENV_FILE -f $COMPOSE_FILE logs -f"
    echo "Stop containers: docker compose --env-file $ENV_FILE -f $COMPOSE_FILE down"
else
    echo "Usage: $0 {--dev | --prod}"
    exit 1
fi
