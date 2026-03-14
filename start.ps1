# Start local Convex stack in development or production mode.

param(
    [string]$Mode = ""
)

$composeFile = "docker/convex/docker-compose.yml"
$envFile = "docker/convex/.env"

if ($Mode -eq "--dev") {
    Write-Host "Starting Convex stack in development mode..."
    docker compose --env-file $envFile -f $composeFile up -d
}
elseif ($Mode -eq "--prod") {
    Write-Host "Starting Convex stack in production mode (detached)..."
    docker compose --env-file $envFile -f $composeFile up -d
    Write-Host "Containers started in background."
    Write-Host "View logs: docker compose --env-file $envFile -f $composeFile logs -f"
    Write-Host "Stop containers: docker compose --env-file $envFile -f $composeFile down"
}
else {
    Write-Host "Usage: .\start.ps1 --dev or .\start.ps1 --prod"
    exit 1
}
