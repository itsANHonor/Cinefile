---
name: cinefile-verify
description: Rebuild the Cinefile Docker container and open browser previews to verify changes. MUST be invoked after ANY code change (client/, server/, Dockerfile, docker-compose.yml, .env) before considering the work tested. Standalone npm builds/typechecks do not replace this workflow.
---

# Cinefile Verification Workflow

This is the required verification path for Cinefile. Run it after any frontend, backend, API, database, asset, or Docker change.

## Steps

1. Run the workflow script from the repo root:

   ```bash
   ./cinefile-skill.sh
   ```

   This stops/removes the existing container, rebuilds the image with `--no-cache`, starts it, waits for health, and verifies both services. If it fails, read the output, check `docker compose logs cinefile`, fix the issue, and re-run.

2. Once the script succeeds, the container is reachable on the local network at `192.168.1.28`.
   Open the following URLs directly in a browser on the same network:
   - Admin interface: http://192.168.1.28:3001 — full access, where forms and editing live
   - Public interface: http://192.168.1.28:3005 — read-only gallery

3. Tell the user the local URLs are ready, summarize what changed, and ask them to share what they see if anything looks wrong.

## Notes

- Two-port architecture: 3005 = read-only public, 3001 = admin (keep internal/VPN only).
- Data persists in /opt/cinefile on the host (SQLite DB, uploads) — rebuilds do not lose data.
- Container runs as UID 1000; migrations run automatically on startup.
- Troubleshooting: `docker compose logs cinefile`, `docker compose ps`, `docker compose restart`.
