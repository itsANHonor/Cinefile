---
description: Quick Cinefile rebuild and test workflow
---

# /cinefile-rebuild

Quick workflow to rebuild Cinefile container and test changes after code modifications.

## Steps

1. **Stop existing container**
```bash
docker compose down && docker compose rm -f
```

2. **Rebuild image**
```bash
docker compose build --no-cache
```

3. **Start container**
```bash
docker compose up -d
```

4. **Wait and verify**
```bash
sleep 30 && curl -f http://localhost:3005/api/health && curl -f http://localhost:3001/api/health
```

5. **Browser preview available**
- Public: http://localhost:3005
- Admin: http://localhost:3001 (password: peckpeck)

Use this after making any frontend, backend, or Docker changes.
