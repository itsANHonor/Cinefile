#!/bin/sh
set -e

# Permission fix: If running as root, fix permissions and drop to nodejs user
if [ "$(id -u)" = "0" ]; then
  echo "🔧 Running as root - fixing permissions on /data..."
  
  # Ensure data directories exist
  mkdir -p /data
  DB_DIR="$(dirname "${DATABASE_PATH:-/data/database.sqlite}")"
  mkdir -p "$DB_DIR"
  mkdir -p /data/uploads
  
  # Fix ownership to nodejs user (UID 1001, GID 1001)
  chown -R 1001:1001 /data 2>/dev/null || true
  
  # Ensure directories are writable
  chmod -R 755 /data 2>/dev/null || true
  
  echo "✅ Permissions fixed. Dropping to nodejs user..."
  
  # Re-exec this script as nodejs user
  exec su-exec nodejs "$0" "$@"
fi

# Rest of the script continues here (now running as nodejs user)
echo "🎬 Cinefile - Starting..."
echo "==========================="

# Diagnostic: Log current user and environment
echo "🔍 Diagnostic Information:"
echo "   Current User ID: $(id -u)"
echo "   Current Group ID: $(id -g)"
echo "   Current User: $(id -un)"
echo "   Current Group: $(id -gn)"
echo "   DATABASE_PATH: ${DATABASE_PATH:-<not set>}"
echo "   UPLOAD_DIR: ${UPLOAD_DIR:-<not set>}"
echo ""

# Ensure data directories exist
echo "📁 Creating data directories..."
# Ensure /data base directory exists
mkdir -p /data
# Ensure database directory exists (extract directory from DATABASE_PATH)
DB_DIR="$(dirname "$DATABASE_PATH")"
mkdir -p "$DB_DIR"
# Ensure uploads directory exists
mkdir -p /data/uploads

# Diagnostic: Check and log directory permissions
echo "🔍 Directory Permissions Check:"
echo "   /data directory exists: $([ -d /data ] && echo 'yes' || echo 'no')"
echo "   /data is writable: $([ -w /data ] && echo 'yes' || echo 'no')"
if [ -d /data ]; then
  echo "   /data ownership: $(ls -ld /data | awk '{print $3":"$4}')"
  echo "   /data permissions: $(ls -ld /data | awk '{print $1}')"
fi

echo "   Database directory ($DB_DIR) exists: $([ -d "$DB_DIR" ] && echo 'yes' || echo 'no')"
echo "   Database directory is writable: $([ -w "$DB_DIR" ] && echo 'yes' || echo 'no')"
if [ -d "$DB_DIR" ]; then
  echo "   Database directory ownership: $(ls -ld "$DB_DIR" | awk '{print $3":"$4}')"
  echo "   Database directory permissions: $(ls -ld "$DB_DIR" | awk '{print $1}')"
fi

echo "   /data/uploads exists: $([ -d /data/uploads ] && echo 'yes' || echo 'no')"
echo "   /data/uploads is writable: $([ -w /data/uploads ] && echo 'yes' || echo 'no')"
echo ""

# Verify write permissions before proceeding
if [ ! -w "$DB_DIR" ]; then
  echo "❌ ERROR: Cannot write to database directory: $DB_DIR"
  echo "   Current user: $(id -un) ($(id -u):$(id -g))"
  if [ -d "$DB_DIR" ]; then
    echo "   Directory owner: $(ls -ld "$DB_DIR" | awk '{print $3":"$4}')"
    echo "   Directory permissions: $(ls -ld "$DB_DIR" | awk '{print $1}')"
  fi
  echo "   Please ensure the host volume directory is writable by user $(id -u):$(id -g)"
  echo "   For example: sudo chown -R $(id -u):$(id -g) /opt/cinefile"
  exit 1
fi

echo "✅ Data directories ready"

# Check for required environment variables
if [ -z "$TMDB_API_KEY" ]; then
    echo "⚠️  WARNING: TMDB_API_KEY is not set!"
    echo "   Movie search will not work without a TMDb API key."
fi

if [ -z "$ADMIN_PASSWORD" ]; then
    echo "⚠️  WARNING: ADMIN_PASSWORD is not set!"
    echo "   Admin panel will not be accessible."
fi

if [ -z "$SESSION_SECRET" ]; then
    echo "⚠️  WARNING: SESSION_SECRET is not set!"
    echo "   The full admin API will exit on startup without it."
fi

# Run database migrations with safety checks
echo ""
echo "🗄️  Running database migrations..."

# Diagnostic: Pre-migration checks
echo "🔍 Pre-migration Diagnostics:"
echo "   Database path: $DATABASE_PATH"
echo "   Database directory exists: $([ -d "$(dirname "$DATABASE_PATH")" ] && echo 'yes' || echo 'no')"
echo "   Database directory is writable: $([ -w "$(dirname "$DATABASE_PATH")" ] && echo 'yes' || echo 'no')"
echo "   Database file exists: $([ -f "$DATABASE_PATH" ] && echo 'yes' || echo 'no')"
if [ -f "$DATABASE_PATH" ]; then
  echo "   Database file size: $(du -h "$DATABASE_PATH" | cut -f1)"
  echo "   Database file permissions: $(ls -l "$DATABASE_PATH" | awk '{print $1}')"
  echo "   Database file ownership: $(ls -l "$DATABASE_PATH" | awk '{print $3":"$4}')"
fi
echo ""

# Check data integrity before migrations
if [ -f "$DATABASE_PATH" ]; then
  echo "🔍 Pre-migration data check..."
  PHYSICAL_ITEMS=$(node -e "const db = require('better-sqlite3')('$DATABASE_PATH'); try { const rows = db.prepare('SELECT COUNT(*) as count FROM physical_items').get(); console.log(rows.count); } catch(e) { console.log('0'); }" 2>/dev/null || echo "0")
  LINKS=$(node -e "const db = require('better-sqlite3')('$DATABASE_PATH'); try { const rows = db.prepare('SELECT COUNT(*) as count FROM physical_item_media').get(); console.log(rows.count); } catch(e) { console.log('0'); }" 2>/dev/null || echo "0")
  
  if [ "$PHYSICAL_ITEMS" -gt 0 ] && [ "$LINKS" -gt 0 ]; then
    echo "   Found $PHYSICAL_ITEMS physical items with $LINKS links"
    echo "💾 Creating backup before migration..."
    BACKUP_PATH="${DATABASE_PATH}.backup.$(date +%Y%m%d_%H%M%S)"
    cp "$DATABASE_PATH" "$BACKUP_PATH" 2>/dev/null || true
    echo "✅ Backup created: $(basename $BACKUP_PATH)"
  fi
fi

# Run migrations with error capture
echo "🔄 Executing database migrations..."
MIGRATION_OUTPUT=$(npx knex migrate:latest 2>&1)
MIGRATION_EXIT_CODE=$?

if [ $MIGRATION_EXIT_CODE -eq 0 ]; then
  echo "✅ Database migrations completed successfully"
  
  # Verify data integrity after migrations
  if [ -f "$DATABASE_PATH" ]; then
    echo "🔍 Post-migration data check..."
    NEW_LINKS=$(node -e "const db = require('better-sqlite3')('$DATABASE_PATH'); try { const rows = db.prepare('SELECT COUNT(*) as count FROM physical_item_media').get(); console.log(rows.count); } catch(e) { console.log('0'); }" 2>/dev/null || echo "0")
    
    if [ "$PHYSICAL_ITEMS" -gt 0 ] && [ "$NEW_LINKS" -eq 0 ] && [ "$LINKS" -gt 0 ]; then
      echo "⚠️  WARNING: Links were lost during migration!"
      echo "   Before: $LINKS links, After: $NEW_LINKS links"
      echo "   Check backup: $BACKUP_PATH"
    else
      echo "✅ Data integrity verified"
    fi
  fi
else
  echo "❌ Database migrations failed!"
  echo ""
  echo "🔍 Error Details:"
  echo "   Exit code: $MIGRATION_EXIT_CODE"
  echo "   Current User: $(id -un) ($(id -u):$(id -g))"
  echo "   Database Path: $DATABASE_PATH"
  echo "   Database Directory: $(dirname "$DATABASE_PATH")"
  echo "   Database Directory Exists: $([ -d "$(dirname "$DATABASE_PATH")" ] && echo 'yes' || echo 'no')"
  echo "   Database Directory Writable: $([ -w "$(dirname "$DATABASE_PATH")" ] && echo 'yes' || echo 'no')"
  if [ -d "$(dirname "$DATABASE_PATH")" ]; then
    echo "   Database Directory Ownership: $(ls -ld "$(dirname "$DATABASE_PATH")" | awk '{print $3":"$4}')"
    echo "   Database Directory Permissions: $(ls -ld "$(dirname "$DATABASE_PATH")" | awk '{print $1}')"
  fi
  if [ -f "$DATABASE_PATH" ]; then
    echo "   Database File Exists: yes"
    echo "   Database File Ownership: $(ls -l "$DATABASE_PATH" | awk '{print $3":"$4}')"
    echo "   Database File Permissions: $(ls -l "$DATABASE_PATH" | awk '{print $1}')"
  else
    echo "   Database File Exists: no"
  fi
  echo ""
  echo "📋 Full Error Output:"
  echo "----------------------------------------"
  echo "$MIGRATION_OUTPUT"
  echo "----------------------------------------"
  echo ""
  echo "💡 Troubleshooting Tips:"
  echo "   1. Ensure the host volume directory is writable by user $(id -u):$(id -g)"
  echo "   2. Check that the database directory exists and has correct permissions"
  echo "   3. Verify DATABASE_PATH environment variable is set correctly"
  echo "   4. If using a volume mount, ensure the host directory exists and is accessible"
  exit 1
fi

# Check database
if [ -f "$DATABASE_PATH" ]; then
    DB_SIZE=$(du -h "$DATABASE_PATH" | cut -f1)
    echo "✅ Database found: $DATABASE_PATH ($DB_SIZE)"
else
    echo "📝 Database will be created at: $DATABASE_PATH"
fi

echo ""
echo "🚀 Starting Cinefile servers..."
echo "=================================="
echo "📡 Read-Only Server (Public):"
echo "   - Container port: 3000"
echo "   - Host port: ${READ_ONLY_PORT:-3000} (configured via READ_ONLY_PORT env var)"
echo "   - Access: http://localhost:${READ_ONLY_PORT:-3000}"
echo ""
echo "📡 Full API Server (Admin):"
echo "   - Container port: 3001"
echo "   - Host port: ${ADMIN_PORT:-3001} (configured via ADMIN_PORT env var)"
echo "   - Access: http://localhost:${ADMIN_PORT:-3001}"
echo "=================================="
echo ""

# Start read-only server in background
# Server always listens on port 3000 inside container
# Host port mapping is configured in docker-compose.yml
echo "🔒 Starting read-only server on port 3000..."
PORT=3000 node dist/index-readonly.js &
READONLY_PID=$!
echo "✅ Read-only server started (PID: $READONLY_PID)"

# Start full API server in background
# Server always listens on port 3001 inside container
# Host port mapping is configured in docker-compose.yml
echo "🔓 Starting full API server on port 3001..."
PORT=3001 node dist/index-full.js &
FULL_PID=$!
echo "✅ Full API server started (PID: $FULL_PID)"
echo ""

# Cleanup function to handle shutdown
cleanup() {
    echo ""
    echo "🛑 Shutting down servers..."
    kill $READONLY_PID $FULL_PID 2>/dev/null || true
    wait $READONLY_PID $FULL_PID 2>/dev/null || true
    echo "✅ Servers stopped"
    exit 0
}

# Trap signals for graceful shutdown
trap cleanup SIGTERM SIGINT

# Wait for both processes
wait $READONLY_PID $FULL_PID

