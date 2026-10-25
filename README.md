# Cinefile 🎬

A clean, modern self-hosted web application for cataloging, organizing, and exploring your personal collection of physical video media (4K UHDs, Blu-rays, 3D Blu-rays, DVDs, LaserDiscs, VHS, and Digital copies) — complete with physical shelf mapping, collection analytics, and a built-in Model Context Protocol (MCP) server for AI assistants.

You can see a live read-only version at https://cinefile.itsanhonor.me/ (my own personal collection!).

## Features

- **Movies & TV Seasons**: Catalog single films, multi-film box sets, and TV seasons with automatic TMDb metadata, cast/director credits, genres, and cover art — or create manual entries for rare/unlisted releases
- **Poster Selection & Spine Color Extraction**: Choose from all available TMDb posters and automatically extract dominant spine colors for virtual shelf rendering
- **Multi-Format & Edition Tagging**: Track multiple formats per release (e.g., `4K UHD + Blu-ray + Digital-UHD`) and normalized edition tags (`Criterion`, `Steelbook`, `Arrow Video`, `Limited Edition`, `Slipcover`, etc.)
- **Physical Library & Virtual Shelves**: Organize your real-world media cabinets into Shelf Groups and Shelves, track capacity in standard case thickness units (and linear millimeters), and visually arrange or locate discs on virtual spines
- **Collection Statistics & Insights**: Interactive analytics dashboard featuring format breakdowns, decade distributions, top directors and cast (with TMDb portraits), franchise counts, format "double-dips," spine color palettes, shelf utilization, and acquisition timelines
- **Rich Filtering & URL-Synced Gallery**: Filter by format, genre, decade, media type, edition tags, series, or physical shelf with live facet counts, infinite scroll, toggleable poster format badges, and shareable URL query parameters
- **Archiving & Bulk Tools**: Archive sold or upgraded items with a reason instead of losing collection history, bulk-add releases, and run bulk metadata operations
- **CSV Import/Export**: Backup, migrate, and restore your collection with full metadata
- **Flexible Deployment (Docker or Native Desktop App)**: Run as a self-hosted Docker container with a two-port security architecture (public read-only gallery on `3000`/`3005` + internal admin port on `3001`) or install as a standalone **Electron Desktop Application** for Windows (`.exe`), macOS (`.dmg`), and Linux (`.AppImage`)
- **Built-in MCP Server**: Connect AI assistants (Claude, Cursor, Windsurf, Devin, etc.) via Streamable HTTP to search your library, get mood-based movie night recommendations, analyze franchise gaps, and locate discs on your physical shelves

### Gallery View

![Display Panel](screenshots/display_panel.png)

The main gallery displays your collection with cover art, multi-facet filtering, sorting, and search functionality across desktop and mobile.

### Admin Panel

![Admin Panel](screenshots/admin_panel.png)

Manage your entire collection from the admin interface — add, edit, archive, bulk-update, and organize series and shelves.

### Editor Panel

![Editor Panel](screenshots/editor_panel.png)

Edit entries with TMDb integration for automatic movie and TV season metadata fetching, poster selection, store links, and edition tags.

## Data Concepts

Cinefile models your collection around a separation between the **physical package** you own and the **artistic works** inside it:

### Physical Items

A **Physical Item** is the actual case, box set, steelbook, tape, or disc package on your shelf. Each physical item can have:
- One or more **Physical Formats** (`4K UHD`, `3D Blu-ray`, `Blu-ray`, `DVD`, `Digital-UHD`, `Digital-HD`, `Digital-SD`, `LaserDisc`, `VHS`)
- Linked **Media** entries (a single film, multiple films in a box set/double feature, or TV seasons across multiple discs)
- **Edition Tags** (normalized tags such as `Criterion`, `Steelbook`, `Limited Edition`, `Arrow Video`, `Vinegar Syndrome`)
- **Physical Dimensions & Appearance**: Case thickness in standard Blu-ray units (`thickness_units`), width in millimeters, custom photos, and spine color
- **Shelf Placement**: Assignment to a specific physical shelf and position from the left
- **Acquisition Metadata**: Purchase date, store/retailer links, personal notes (with public/private visibility toggle), and archive status (`archived` + `archive_reason`)

### Media (Movies & TV Seasons)

A **Media** record represents the film or TV season itself — independent of its physical format. Multiple physical items can reference the same work (for example, owning both a standard Blu-ray and a 4K UHD Steelbook of the same film, tracked in Statistics as a "double-dip").

### Series & Franchises

A **Series** groups related films or releases (such as the *Marvel Cinematic Universe*, *The Lord of the Rings*, or the *Wes Anderson Collection*) and can optionally link to a canonical TMDb Collection ID for franchise completeness checks.

When editing a physical item, you have two series-related options:
- **Primary Series**: Automatically associates all movies in the physical item with the selected series.
- **Sort Series**: Controls how the physical item is grouped when sorting the collection by series (helpful for multi-film crossover sets).

### Physical Library (Shelf Groups & Shelves)

Your physical storage is modeled as:
- **Shelf Groups**: A bookcase, media cabinet, or rack (e.g., *Living Room Billy Bookcase*).
- **Shelves**: Individual rows within a group, configured with a capacity in standard case units. Placing items on a shelf tracks capacity utilization and lets you see the exact position and neighboring titles for any disc.

### Supported Formats

- **4K UHD**: Ultra HD Blu-ray discs
- **3D Blu-ray**: Blu-ray discs encoded for 3D playback
- **Blu-ray**: Standard high-definition Blu-ray discs
- **DVD**: Standard definition DVDs
- **Digital-UHD**: Digital copies in 4K Ultra HD
- **Digital-HD**: Digital copies in high definition
- **Digital-SD**: Digital copies in standard definition
- **LaserDisc**: Legacy LaserDisc format
- **VHS**: VHS tapes

## Quick Start with Docker

### Prerequisites

- Docker and Docker Compose
- TMDb API key (free at https://www.themoviedb.org/settings/api)

### Setup Steps

1. **Create a `docker-compose.yml` file** (see `docker-compose.example.yml`):

```yaml
version: '3.8'

services:
  cinefile:
    image: ghcr.io/itsanhonor/cinefile:latest
    container_name: cinefile
    restart: unless-stopped
    # User: Defaults to nodejs (UID 1001) from Dockerfile
    # To override, uncomment and set to your user ID:
    # user: "1000:1000"
    ports:
      # Read-Only Port (Public-facing)
      # Maps host port to container port 3000 (read-only server)
      - "3000:3000"
      # Admin Port (Full API + MCP Server - Internal/VPN only)
      # Maps host port to container port 3001 (full API server)
      # WARNING: Do not expose this port to the public internet!
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - TMDB_API_KEY=${TMDB_API_KEY}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
      - SESSION_SECRET=${SESSION_SECRET}
      # Optional: Set an API key to enable the MCP server endpoint (/api/mcp) on port 3001
      - MCP_API_KEY=${MCP_API_KEY:-}
      # Optional: Restrict CORS to your public origin
      - ALLOWED_ORIGIN=${ALLOWED_ORIGIN:-http://localhost:3000}
      - DATABASE_PATH=/data/database.sqlite
      - UPLOAD_DIR=/data/uploads
    volumes:
      # Ensure the host directory is writable by the container user
      - /opt/cinefile:/data
```

2. **Configure your environment:**

Create a `.env` file in the same directory:

```env
TMDB_API_KEY=your_tmdb_api_key_here
ADMIN_PASSWORD=your_secure_password
SESSION_SECRET=use_a_long_random_string_distinct_from_the_password
MCP_API_KEY=optional_long_random_mcp_api_key
```

`SESSION_SECRET` signs admin JWTs; use a long random value and keep it private. JWTs expire after `JWT_EXPIRES_IN` (default **8 hours**).

3. **Start the container:**

```bash
docker compose up -d
```

4. **Access the application:**
   - **Read-only (public)**: `http://localhost:3000` (or `http://localhost:3005` when using the repo's local `docker-compose.yml`)
   - **Admin (internal)**: `http://localhost:3001`
   - **MCP Endpoint (internal)**: `http://localhost:3001/api/mcp`

### Two-Port Architecture

Cinefile runs two Express servers in a single container:

- **Read-Only Port** (container port `3000`): Public-facing server exposing only `GET` routes for browsing the collection, statistics, series, and shelf layouts. Cannot modify data by design.
- **Admin Port** (container port `3001`): Full CRUD API, admin UI, CSV import/export, TMDb sync, and the MCP server endpoint. Keep this port restricted to your local network or VPN.

## Desktop Application (Electron)

If you prefer a standalone desktop app over running a Docker container, Cinefile can be installed or built as a native **Electron** application for **Windows**, **macOS**, and **Linux**.

### Installing a Pre-Built Release

1. Download the installer for your operating system from the [GitHub Releases](https://github.com/itsANHonor/Cinefile/releases) page:
   - **Windows**: `Cinefile Setup <version>.exe`
   - **macOS (Apple Silicon)**: `Cinefile-<version>-arm64.dmg` (or `.zip`)
   - **Linux**: `Cinefile-<version>.AppImage` (make executable with `chmod +x Cinefile-*.AppImage`)
2. Launch **Cinefile**.
3. Open **Settings** (gear icon in the left sidebar) → **General** → **TMDb Metadata Integration**, paste your free [TMDb v3 API key](https://www.themoviedb.org/settings/api), and click **Save API Key** to enable movie and TV show metadata search.

### Desktop-Specific Adjustments & Behavior

The desktop app shares 100% of its frontend and backend codebase with the Docker version, with a few automatic adjustments when `DESKTOP_MODE=true` is active:

- **Embedded Single-Server Architecture**: Instead of running separate Read-Only and Admin servers, the Electron main process (`electron/main.ts`) starts the Full Express server in-process bound strictly to loopback (`127.0.0.1`) on an ephemeral port (`DESKTOP_PORT`, default `0` for OS-assigned) and opens a native `BrowserWindow`.
- **Automatic Local Authentication**: Because the desktop server only listens on `127.0.0.1` for local single-user use, `ADMIN_PASSWORD` and `SESSION_SECRET` are not required. The app automatically signs you in as admin and hides server-only controls such as the **Sign Out** button and the **Make collection public** visibility toggle.
- **In-App TMDb API Key Configuration**: Desktop users do not need a `.env` file. The TMDb API key can be configured at any time under **Settings → General → TMDb Metadata Integration** and is stored in the local SQLite `settings` table (`tmdb_api_key`), taking precedence over any `TMDB_API_KEY` environment variable. (This in-app setting also works in Docker deployments!)
- **OS-Standard Data Storage & Automatic Backups**: Your SQLite database (`database.sqlite`), automatic pre-migration `.backup` files, and uploaded cover art (`uploads/`) are stored in your operating system's standard user data directory so upgrading the app never overwrites your collection:
  - **Windows**: `%APPDATA%\Cinefile\`
  - **macOS**: `~/Library/Application Support/Cinefile/`
  - **Linux**: `~/.config/Cinefile/`

### Building & Running the Desktop App from Source

#### Prerequisites
- Node.js 20+ and npm
- Build tools for native Node addons (`better-sqlite3`):
  - **Linux**: `python3`, `make`, `g++`
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Windows**: Visual Studio Build Tools (Desktop development with C++)

#### Commands

1. **Install dependencies across root, server, and client:**
   ```bash
   npm run install:all
   ```

2. **Run the Electron desktop app locally:**
   ```bash
   npm run desktop:start
   ```
   *(Compiles `client/`, `server/`, and `electron/`, rebuilds `better-sqlite3` against the Electron ABI, and launches the desktop window).*

3. **Package an unpacked desktop build for testing (`dist-desktop/`):**
   ```bash
   npm run desktop:pack
   ```

4. **Build distributable installers (`.AppImage`, `.dmg`, or `.exe`) into `dist-desktop/`:**
   ```bash
   npm run desktop:dist
   ```

## Model Context Protocol (MCP) Server

Cinefile includes a built-in **stateless Streamable HTTP MCP server** mounted at `/api/mcp` (and `/mcp`) on the **Admin Port (`3001`)**. This lets AI agents and MCP clients (Claude Desktop, Claude Code, Cursor, Windsurf, Devin, OpenWebUI, etc.) query, analyze, and manage your physical media collection directly.

### Security & Authentication

- **Admin Port Only**: The MCP routes are registered exclusively on the full admin server (`3001`). The public read-only server (`3000`/`3005`) never mounts `/api/mcp`.
- **Fail-Closed Configuration**: If `MCP_API_KEY` is unset or empty, all requests to `/api/mcp` return `503 Service Unavailable`.
- **Supported Auth Headers**: Authenticate requests using either:
  - `Authorization: Bearer <MCP_API_KEY>` (or a valid admin session JWT)
  - `X-MCP-API-Key: <MCP_API_KEY>`
- **Timing-Safe Verification**: API keys are verified using constant-time comparison (`crypto.timingSafeEqual`).

### Client Configuration

Connect any Streamable HTTP-compatible MCP client to `http://<your-host>:3001/api/mcp`:

```json
{
  "mcpServers": {
    "cinefile": {
      "type": "streamable-http",
      "url": "http://localhost:3001/api/mcp",
      "headers": {
        "Authorization": "Bearer your_long_random_mcp_api_key"
      }
    }
  }
}
```

If your client uses `x-mcp-api-key` or `serverUrl`, you can pass `"X-MCP-API-Key": "your_long_random_mcp_api_key"` in `headers`.

### MCP Tools Reference (15 Tools)

#### 1. Collection Search, Browse & Mood Discovery (Read-Only)
| Tool | Description |
| :--- | :--- |
| `search_collection` | Search and filter items by keyword, physical formats, genres (name or ID), decades, release year range, director, actor, edition tag, media type (`movie`, `tv_season`, `all`), or archive status. Supports sorting, pagination, and token-compact `minimal` mode. |
| `get_item_details` | Fetch complete details for a `physical_item_id` or `media_id`, including all linked discs, full cast, synopsis, edition tags, store links, series membership, and shelf placement. |
| `recommend_for_mood` | Sample movies or TV seasons from your collection matching desired genres, excluded genres, decades, year range, playback formats, director/actor, or theme keywords — complete with shelf locations for movie night pitches. |
| `get_collection_facets` | List all available genres, decades, physical formats, and canonical edition tags in the collection with item counts. |

#### 2. Statistics & Collection Analytics (Read-Only)
| Tool | Description |
| :--- | :--- |
| `get_collection_stats` | Retrieve collection analytics (`all`, `overview`, `formats`, `content`, `physical_library`, or `acquisitions`), including format breakdowns, top directors/actors/franchises, format double-dips, shelf capacity & linear footage (mm), spine colors, and top retailers. |
| `get_recent_acquisitions` | List the most recently purchased (`purchase_date`) or cataloged (`created_at`) physical items. |

#### 3. Series, Franchises & TMDb Intelligence (Read-Only)
| Tool | Description |
| :--- | :--- |
| `list_series` | List all series/franchises configured in Cinefile with owned movie counts, sort modes, and linked TMDb Collection IDs. |
| `get_series_details` | Get a series by ID or name along with all owned movies in watch/sort order and their physical formats. |
| `check_series_completeness` | Compare an owned series (or TMDb Collection ID) against TMDb's canonical franchise list to identify owned vs. missing installments. |
| `search_tmdb` | Search TMDb for movies or TV shows, optionally fetching full credits, and automatically flag whether each result is already owned in your Cinefile collection. |

#### 4. Physical Library & Shelf Management (Read + Write)
| Tool | Description |
| :--- | :--- |
| `get_shelf_layout` | Inspect shelf groups, shelves, capacity units, utilization percentages, ordered shelf items, or unassigned items awaiting shelf placement. |
| `find_item_on_shelf` | Locate where a movie or physical item lives on your physical shelves — returns the shelf group, shelf name, 1-based position from the left, and immediate left/right neighboring titles. |
| `place_item_on_shelf` | Place or move a physical item onto a specific shelf (at an optional 0-based position), or pass `shelf_id: null` to unassign it. |

#### 5. Collection CRUD Management (Write)
| Tool | Description |
| :--- | :--- |
| `add_physical_item` | Add a new physical item (single film, multi-film box set, or TV season). Passing `tmdb_id` automatically fetches TMDb metadata, credits, genres, cover art, and extracts spine colors; can also place the item directly onto a `shelf_id`. |
| `update_physical_item` | Update an existing item's name, formats, edition tags, notes, purchase date, store links, thickness units, series associations, or archive status (`archived` + `archive_reason`). |
| `delete_physical_item` | Permanently delete a physical item by ID (and optionally clean up orphaned media records). |

### MCP Resources

- `cinefile://stats/summary` — Live JSON summary of collection counts, format distribution, and shelf usage
- `cinefile://facets` — Available genres, decades, formats, and edition tags with counts
- `cinefile://library/shelves` — Hierarchy of shelf groups, shelves, capacity units, and utilization

### MCP Prompts

- `movie-night-picker` (`mood`, `preferred_format?`, `decade?`) — Samples matching titles from your collection and pitches 3–5 options with format/edition details and exact shelf coordinates
- `franchise-gap-analysis` (`series_name?`) — Audits your series against TMDb Collections to highlight missing franchise installments
- `collection-curator-report` — Generates a curator breakdown of collection size, format mix, top directors/actors, double-dips, and shelf footprint

## Development & Verification

- **Frontend (`client/`)**: React 18, TypeScript, Vite, Tailwind CSS, Vitest + React Testing Library (`cd client && npm test`)
- **Backend (`server/`)**: Node.js, Express, TypeScript, SQLite + Knex migrations, `@modelcontextprotocol/sdk`
- **Desktop (`electron/`)**: Electron 33, `electron-builder` (`npm run desktop:start` / `npm run desktop:dist`), automated multi-OS release builds via `.github/workflows/desktop-release.yml`
- **Container Verification**: Run `./cinefile-skill.sh` from the repository root to rebuild the Docker image, run database migrations, and verify both the public (`:3005`) and admin (`:3001`) services.

## AI Disclosure
Cinefile was generated almost entirely by a combination of Cursor's Composer and Google's Gemini 2.5 and 3.0 and Claude Opus 4.5/4.6 models. As a hobby project, I am deliberately using it as a testing ground to 'feel' out the capabilities of current LLM models. If this is not to your taste or preferences, I completely understand, but I am disclosing this for transparency reasons. I'm committed to building a good product, and this is a low-stakes way for me to try new tools.

## License

MIT
