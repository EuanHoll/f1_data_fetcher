#!/bin/bash

set -e

COMPOSE_FILE="docker/convex/docker-compose.yml"
ENV_FILE="docker/convex/.env"

if [ "$1" = "--dev" ]; then
    echo "Starting Convex stack in development mode..."
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up
elif [ "$1" = "--prod" ]; then
    echo "Starting Convex stack in production mode (detached)..."
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d
    echo "Containers started in background."
    echo "View logs: docker compose --env-file $ENV_FILE -f $COMPOSE_FILE logs -f"
    echo "Stop containers: docker compose --env-file $ENV_FILE -f $COMPOSE_FILE down"
else
    echo "Usage: $0 {--dev | --prod}"
    exit 1
fi
