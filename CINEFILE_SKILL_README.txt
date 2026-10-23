Cinefile Development Skill
==========================

This skill provides a complete automated workflow for developing and testing Cinefile on your homelab.

Overview
--------
The Cinefile skill automates the entire development cycle:
1. Stops and removes existing containers
2. Rebuilds the Docker image with latest changes
3. Starts the container with proper configuration
4. Verifies both services are healthy and accessible
5. Provides browser preview URLs for testing

Usage
-----
Run the workflow script after making any code changes:

    ./cinefile-skill.sh

This script handles:
- Frontend changes (client/ directory)
- Backend changes (server/ directory)
- Docker configuration changes
- Environment variable updates

Services
--------
- Public Interface: http://localhost:3005 (read-only access)
- Admin Interface:  http://localhost:3001 (full access)
- Admin Password: peckpeck

Browser Preview
---------------
The skill automatically opens browser previews for both interfaces, allowing you to:
- Test the public gallery view
- Access the admin panel for management
- Verify all functionality works correctly

File Structure
--------------
Key directories monitored for changes:
- client/          - React frontend components
- server/          - Node.js backend API
- Dockerfile       - Container build configuration
- docker-compose.yml - Service orchestration
- .env*            - Environment configuration

Troubleshooting
---------------
If issues occur, the script provides helpful commands:
- Check logs: docker compose logs cinefile
- Check status: docker compose ps
- Stop container: docker compose down
- Restart container: docker compose restart

Two-Port Architecture
---------------------
Cinefile uses a secure two-port design:
- Port 3005: Read-only public interface (safe for internet exposure)
- Port 3001: Full admin interface (keep internal/VPN only)

Database Persistence
--------------------
Data persists in /opt/cinefile on the host machine, including:
- SQLite database file
- Uploaded images and media
- Configuration data

Development Notes
-----------------
- Container runs as non-root user (UID 1000) for security
- Health checks ensure proper startup
- Automatic database migrations on startup
- Built-in backup system for data safety

Workflow Testing
----------------
The skill has been tested end-to-end with:
- Code changes in frontend
- Code changes in backend  
- Docker configuration updates
- Complete rebuild cycles

Browser Access
--------------
Click the browser preview buttons to access:
- Cinefile Public Interface - View your media collection
- Cinefile Admin Interface - Manage your collection

The workflow ensures your changes are immediately available for testing.
