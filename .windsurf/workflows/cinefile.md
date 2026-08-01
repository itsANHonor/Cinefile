---
description: Cinefile development workflow - rebuild container and test changes
---

# Cinefile Development Workflow

This workflow is the required verification path for Cinefile. After any frontend, backend, API, database, asset, or Docker change, rebuild and verify the local Docker container before considering the work tested. Standalone npm builds do not replace this workflow.

## Prerequisites

- Docker and Docker Compose installed
- TMDb API key configured in environment
- Sufficient permissions to run Docker commands

## Workflow Steps

### 1. Stop and Remove Existing Container
```bash
# Stop the running container
docker compose down

# Remove the container completely
docker compose rm -f
```

### 2. Rebuild the Docker Image
```bash
# Build the new image with latest changes
docker compose build --no-cache
```

### 3. Start the Container
```bash
# Start the container in detached mode
docker compose up -d
```

### 4. Wait for Container to be Ready
```bash
# Wait for health check to pass (max 60 seconds)
sleep 30

# Check if container is running and healthy
docker compose ps
```

### 5. Verify Services are Accessible
```bash
# Check read-only service (port 3005)
curl -f http://localhost:3005/api/health || exit 1

# Check admin service (port 3001) 
curl -f http://localhost:3001/api/health || exit 1
```

### 6. Open Browser Preview
- Public interface: http://localhost:3005
- Admin interface: http://localhost:3001

## Usage

Run this workflow after making any code changes to:

1. **Frontend changes** (client/ directory): React components, styles, UI
2. **Backend changes** (server/ directory): API endpoints, database logic
3. **Docker configuration**: Dockerfile, docker-compose.yml
4. **Environment variables**: .env files

## Troubleshooting

### Container fails to start
```bash
# Check container logs
docker compose logs cinefile

# Check if ports are available
netstat -tulpn | grep :3005
netstat -tulpn | grep :3001
```

### Build fails
```bash
# Clean build artifacts
docker system prune -f

# Rebuild without cache
docker compose build --no-cache --pull
```

### Services not accessible
```bash
# Check container status
docker compose ps

# Inspect container
docker compose exec cinefile ps aux
```

## Development Notes

- The application uses a two-port architecture:
  - Port 3005: Read-only public interface
  - Port 3001: Full admin interface
- Database persists in `/opt/cinefile` on the host
- Container runs as user 1000:1000 for security
- Health checks ensure the service is properly started

## File Monitoring

Key directories to monitor for changes:
- `client/` - React frontend code
- `server/` - Node.js backend code  
- `Dockerfile` - Container build configuration
- `docker-compose.yml` - Service configuration
- `.env*` - Environment configuration
