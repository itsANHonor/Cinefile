#!/bin/bash

# Cinefile Development Workflow Script
# This script rebuilds the Docker container and tests changes via browser preview

set -e  # Exit on any error

echo "🎬 Cinefile Development Workflow Started"
echo "======================================"

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        echo "❌ Docker is not running. Please start Docker first."
        exit 1
    fi
    echo "✅ Docker is running"
}

# Function to stop and remove existing container
stop_container() {
    echo "🛑 Stopping existing container..."
    docker compose down 2>/dev/null || true
    docker compose rm -f 2>/dev/null || true
    echo "✅ Container stopped and removed"
}

# Function to rebuild the Docker image
rebuild_image() {
    echo "🔨 Rebuilding Docker image..."
    docker compose build --no-cache
    echo "✅ Docker image rebuilt"
}

# Function to start the container
start_container() {
    echo "🚀 Starting container..."
    docker compose up -d
    echo "✅ Container started"
}

# Function to wait for container health
wait_for_health() {
    echo "⏳ Waiting for container to be healthy..."
    
    # Wait up to 60 seconds for health check
    for i in {1..12}; do
        sleep 5
        if docker compose ps | grep -q "healthy\|Up"; then
            echo "✅ Container is healthy"
            return 0
        fi
        echo "⏳ Waiting... ($i/12)"
    done
    
    echo "❌ Container failed to become healthy"
    docker compose logs cinefile
    exit 1
}

# Function to verify services
verify_services() {
    echo "🔍 Verifying services..."
    
    # Check read-only service (port 3005 - mapped from container 3000)
    if curl -f -s http://localhost:3005/api/health > /dev/null; then
        echo "✅ Read-only service (port 3005) is accessible"
    else
        echo "❌ Read-only service (port 3005) is not accessible"
        exit 1
    fi
    
    # Check admin service (port 3001)
    if curl -f -s http://localhost:3001/api/health > /dev/null; then
        echo "✅ Admin service (port 3001) is accessible"
    else
        echo "❌ Admin service (port 3001) is not accessible"
        exit 1
    fi
}

# Function to show access URLs
show_urls() {
    echo ""
    echo "🌐 Services are ready!"
    echo "======================"
    echo "Public Interface: http://localhost:3005"
    echo "Admin Interface:  http://localhost:3001"
    echo ""
}

# Function to show troubleshooting info
show_troubleshooting() {
    echo "🔧 Troubleshooting Commands:"
    echo "============================"
    echo "Check container logs: docker compose logs cinefile"
    echo "Check container status: docker compose ps"
    echo "Stop container: docker compose down"
    echo "Restart container: docker compose restart"
    echo ""
}

# Main execution
main() {
    check_docker
    stop_container
    rebuild_image
    start_container
    wait_for_health
    verify_services
    show_urls
    show_troubleshooting
    
    echo "🎉 Cinefile development workflow completed successfully!"
}

# Run main function
main "$@"
