# Cinefile 🎬

**Cinefile** is a clean, self-hosted web and desktop application for cataloging, organizing, and exploring your personal physical video media collection (4K UHD, Blu-ray, 3D Blu-ray, DVD, LaserDisc, VHS, and Digital copies) — complete with virtual shelf mapping, Letterboxd integration, collection analytics, and a built-in Model Context Protocol (MCP) server for AI assistants.

👉 **Live Demo:** Browse a live read-only collection at [cinefile.itsanhonor.me](https://cinefile.itsanhonor.me/)

![Cinefile Collection Gallery](screenshots/collection.png)

## Highlights

- **Movies, Box Sets & TV Seasons**: Catalog single releases, multi-film box sets, and TV seasons with automatic TMDb metadata, cast/crew credits, cover art selection, and normalized edition tags (`Criterion Collection`, `Steelbook`, `Arrow Video`, `Limited Edition`, etc.).
- **Letterboxd Integration**: Automatically sync your personal Letterboxd RSS feed to display star ratings, liked hearts, and last-watched dates across your collection.
- **Physical Library & Virtual Shelves**: Model your real-world media cabinets into Shelf Groups and Shelves, track capacity in standard case units (and millimeters), extract dominant spine colors, and locate any disc alongside its shelf neighbors.
- **Collection Statistics & Insights**: Explore format breakdowns, edition tag distributions, decade timelines, top directors and cast, franchise completeness, and format "double-dips."
- **Flexible Deployment**: Run as a **Docker container** (with a public read-only port and internal admin port) or install as a standalone **Desktop App** for Windows, macOS, and Linux.
- **Built-in AI / MCP Server**: Connect Claude, Cursor, Windsurf, or Devin to search your library, pitch movie-night picks by mood, audit franchise gaps, and find exact shelf coordinates.

## Get Started in 60 Seconds

- **Desktop App (Windows / macOS / Linux)**: Download the latest installer (`.exe`, `.dmg`, or `.AppImage`) from [GitHub Releases](https://github.com/itsANHonor/Cinefile/releases), launch Cinefile, and add your free [TMDb API key](https://www.themoviedb.org/settings/api) under **Settings → General**.
- **Docker**: Copy [`docker-compose.example.yml`](docker-compose.example.yml) to `docker-compose.yml`, set `TMDB_API_KEY`, `ADMIN_PASSWORD`, and `SESSION_SECRET` in a `.env` file, and run `docker compose up -d` ([full instructions below](#docker-deployment)).

---

## Table of Contents

- [Installation & Deployment Guide](#installation--deployment-guide)
  - [Docker Deployment](#docker-deployment)
  - [Two-Port Security Architecture](#two-port-security-architecture)
  - [Desktop Application (Electron)](#desktop-application-electron)
- [Product Tour & Using Cinefile](#product-tour--using-cinefile)
  - [Browsing, Filtering & Viewing Titles](#browsing-filtering--viewing-titles)
  - [Adding & Cataloging Media](#adding--cataloging-media)
  - [Core Data Concepts (Items, Media, Series & Shelves)](#core-data-concepts)
  - [Collection Statistics & Insights](#collection-statistics--insights)
  - [Settings, Privacy & Integrations](#settings-privacy--integrations)
- [Model Context Protocol (MCP) Server](#model-context-protocol-mcp-server)
  - [Authentication & Client Setup](#authentication--client-setup)
  - [MCP Tools, Resources & Prompts Reference](#mcp-tools-resources--prompts-reference)
- [Development & Building from Source](#development--building-from-source)
- [AI Disclosure](#ai-disclosure)
- [License](#license)

---

## Installation & Deployment Guide

### Docker Deployment

#### Prerequisites
- Docker and Docker Compose
- A free [TMDb v3 API key](https://www.themoviedb.org/settings/api) (can be set via `.env` or configured in the web UI after launch)

#### 1. Create a `docker-compose.yml` file

```yaml
version: '3.8'

services:
  cinefile:
    image: ghcr.io/itsanhonor/cinefile:latest
    container_name: cinefile
    restart: unless-stopped
    # Defaults to nodejs (UID 1001). Uncomment to override:
    # user: "1000:1000"
    ports:
      # Read-Only Port (Safe for public exposure)
      - "3000:3000"
      # Admin Port (Full API + MCP Server - keep internal/VPN only!)
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - TMDB_API_KEY=${TMDB_API_KEY}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
      - SESSION_SECRET=${SESSION_SECRET}
      # Optional: Enables the MCP server endpoint (/api/mcp) on port 3001
      - MCP_API_KEY=${MCP_API_KEY:-}
      # Optional: Restrict CORS to your public origin
      - ALLOWED_ORIGIN=${ALLOWED_ORIGIN:-http://localhost:3000}
      - DATABASE_PATH=/data/database.sqlite
      - UPLOAD_DIR=/data/uploads
    volumes:
      - /opt/cinefile:/data
```

#### 2. Configure your `.env` file

```env
TMDB_API_KEY=your_tmdb_api_key_here
ADMIN_PASSWORD=your_secure_password
SESSION_SECRET=use_a_long_random_string_distinct_from_the_password
MCP_API_KEY=optional_long_random_mcp_api_key
```

> `SESSION_SECRET` signs admin JWTs (which expire after `JWT_EXPIRES_IN`, default **8 hours**). Keep it private and distinct from `ADMIN_PASSWORD`.

#### 3. Start the container

```bash
docker compose up -d
```

- **Public Read-Only Gallery**: `http://localhost:3000` (or `http://localhost:3005` when using the repo's local `docker-compose.yml`)
- **Admin UI & Full API**: `http://localhost:3001`
- **MCP Endpoint**: `http://localhost:3001/api/mcp`

### Two-Port Security Architecture

When running in Docker, Cinefile starts two Express servers inside a single container:

| Port | Role | Capabilities |
| :--- | :--- | :--- |
| **`3000`** | **Read-Only Server** | Public-facing server that registers only `GET` routes for browsing the collection, statistics, series, and shelf layouts. Cannot modify data by design. |
| **`3001`** | **Admin Server** | Full CRUD API, Settings/Admin UI, CSV import/export, TMDb/Letterboxd sync, and the MCP server endpoint. Keep restricted to localhost or a private VPN. |

### Desktop Application (Electron)

If you prefer a native desktop app over running Docker, Cinefile is available as a standalone Electron application for **Windows**, **macOS**, and **Linux**.

#### Installing a Pre-Built Release
1. Download the installer for your OS from [GitHub Releases](https://github.com/itsANHonor/Cinefile/releases):
   - **Windows**: `Cinefile Setup <version>.exe`
   - **macOS (Apple Silicon)**: `Cinefile-<version>-arm64.dmg` (or `.zip`)
   - **Linux**: `Cinefile-<version>.AppImage` (`chmod +x Cinefile-*.AppImage`)
2. Launch **Cinefile**.
3. Open **Settings** (gear icon in the sidebar) → **General** → **TMDb Metadata Integration**, paste your free [TMDb API key](https://www.themoviedb.org/settings/api), and click **Save API Key**.

#### How Desktop Mode Works
The desktop app runs the exact same frontend and backend codebase with automatic single-user adjustments (`DESKTOP_MODE=true`):
- **Loopback Single-Server**: Runs in-process bound strictly to `127.0.0.1` on an ephemeral port inside a native desktop window.
- **Zero-Config Local Auth**: Automatically signs you in locally without requiring `ADMIN_PASSWORD` or `.env` files, and hides server-only controls like Sign Out and public visibility toggles.
- **Persistent OS Storage & Backups**: Your SQLite database (`database.sqlite`), automatic pre-migration `.backup` files, and uploaded cover art (`uploads/`) live in your OS user data directory so app updates never overwrite your library:
  - **Windows**: `%APPDATA%\Cinefile\`
  - **macOS**: `~/Library/Application Support/Cinefile/`
  - **Linux**: `~/.config/Cinefile/`

---

## Product Tour & Using Cinefile

### Browsing, Filtering & Viewing Titles

The **Collection** page lets you explore your library with instant search, multi-facet filters (Format, Genre, Decade, Edition Tag, Series, or Physical Shelf), and multiple sort modes (*Title*, *Series*, *Director*, *Year*, *Added*).

- **Grid & Shelf Views**: Toggle between the poster **Grid** view and the virtual **Shelf** view, toggle format badges on posters, or launch **Showcase** mode.
- **URL-Synced Filters**: Every search, filter, and sort selection updates the URL query string so filtered views can be bookmarked or shared.
- **Detailed Media View**: Clicking any card opens the detail modal displaying the full synopsis, director, cast list, edition tags, physical formats, and your synced **Letterboxd** rating, like status, and last-watched date.

![Movie Detail Modal](screenshots/movie.png)

### Adding & Cataloging Media

Click **+ Add Item** in the admin interface to catalog a new release:

1. **Search TMDb**: Search across **Movies** or **TV Shows** to automatically import metadata, release year, synopsis, director, cast portraits, genres, cover art, and dominant spine colors.
2. **Manual Entry Fallback**: For rare, out-of-print, or unlisted home video releases, click *Can't find it? Create a movie manually* to enter custom metadata and upload your own artwork.
3. **Box Sets & Multi-Disc Releases**: Link multiple movies or TV seasons to a single physical package, choose custom TMDb posters for both the outer package and individual titles, and tag formats/editions.

![Add New Media via TMDb](screenshots/selection.png)

### Core Data Concepts

Cinefile separates the **physical package** on your shelf from the **artistic works** inside it:

| Concept | What It Represents |
| :--- | :--- |
| **Physical Item** | The actual case, steelbook, box set, tape, or disc package you own. Tracks physical formats, edition tags, case thickness (`thickness_units` and `mm`), spine color, shelf coordinates, purchase date, retailer links, notes, and archive status (`archived` + `archive_reason`). |
| **Media** | A movie or TV season record independent of format. Multiple Physical Items can link to the same Media record (e.g., owning both a Blu-ray and a 4K UHD Steelbook of the same film, tracked in Statistics as a **double-dip**). |
| **Series** | Groups related releases (e.g., *Marvel Cinematic Universe*, *The Lord of the Rings*) and optionally links to a TMDb Collection ID to check for missing franchise installments. Supports both a **Primary Series** (for the films inside) and a **Sort Series** (for grouping crossover box sets). |
| **Shelf Groups & Shelves** | Models your physical bookcases/cabinets (**Shelf Groups**) and individual rows (**Shelves**) with configurable capacity in standard Blu-ray case units. |

**Supported Formats:** `4K UHD` · `3D Blu-ray` · `Blu-ray` · `DVD` · `Digital-UHD` · `Digital-HD` · `Digital-SD` · `LaserDisc` · `VHS`

### Collection Statistics & Insights

The **Statistics** page gives you an interactive breakdown of your collection across three tabs — click any format, edition tag, decade, genre, director, or actor to immediately filter your gallery:

- **Collection Statistics**: Total physical items, movies, TV seasons/episodes, multi-title sets, active series, format distribution (by titles or physical items), and edition tags breakdown.
- **Content Insights**: Decade distribution, top genres, top directors and cast with TMDb portraits, largest franchises, and format double-dips.
- **Physical Statistics**: Shelf capacity utilization, total linear shelf footprint (mm), spine color palette distribution, acquisition timeline, and top retailers.

![Collection Statistics Dashboard](screenshots/stats.png)

### Settings, Privacy & Integrations

From the **Settings** page (accessible on the Admin server or Desktop app), you can manage your collection across three tabs:

- **General**:
  - **Collection Profile & Privacy**: Customize your collection's display title and toggle whether visitors can browse your collection publicly without signing in.
  - **TMDb Metadata Integration**: Configure or replace your TMDb v3 API key directly in the UI (overrides `TMDB_API_KEY` from `.env`).
  - **Letterboxd Integration**: Connect your Letterboxd username to cache and sync your RSS feed ratings, liked films, and watch dates onto matching movies in your collection.
- **Series**: Create, reorder, and link series to TMDb Collections, and manage physical **Shelf Groups** and **Shelves**.
- **Data & Import**: Bulk-add releases, manage archived items, and import or export your collection via CSV.

![Settings and Integrations Panel](screenshots/admin.png)

---

## Model Context Protocol (MCP) Server

Cinefile includes a built-in **Streamable HTTP MCP server** mounted at `/api/mcp` (and `/mcp`) on the **Admin Port (`3001`)**. AI assistants like Claude Desktop, Claude Code, Cursor, Windsurf, and Devin can query your library, recommend titles for movie night, check for missing franchise entries, and tell you the exact shelf and position of any disc.

### Authentication & Client Setup

- **Admin Port Only**: `/api/mcp` is mounted exclusively on port `3001` (never on the public read-only port `3000`).
- **Fail-Closed Auth**: Set `MCP_API_KEY` in your `.env`. Requests must supply `Authorization: Bearer <MCP_API_KEY>` or `X-MCP-API-Key: <MCP_API_KEY>` (verified with constant-time comparison). If `MCP_API_KEY` is unset, `/api/mcp` returns `503 Service Unavailable`.

Add Cinefile to any Streamable HTTP-compatible MCP client configuration:

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

### MCP Tools, Resources & Prompts Reference

<details>
<summary><strong>Click to expand all 15 MCP Tools, 3 Resources, and 3 Prompts</strong></summary>

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

#### MCP Resources
- `cinefile://stats/summary` — Live JSON summary of collection counts, format distribution, and shelf usage
- `cinefile://facets` — Available genres, decades, formats, and edition tags with counts
- `cinefile://library/shelves` — Hierarchy of shelf groups, shelves, capacity units, and utilization

#### MCP Prompts
- `movie-night-picker` (`mood`, `preferred_format?`, `decade?`) — Samples matching titles from your collection and pitches 3–5 options with format/edition details and exact shelf coordinates
- `franchise-gap-analysis` (`series_name?`) — Audits your series against TMDb Collections to highlight missing franchise installments
- `collection-curator-report` — Generates a curator breakdown of collection size, format mix, top directors/actors, double-dips, and shelf footprint

</details>

---

## Development & Building from Source

### Tech Stack
- **Frontend (`client/`)**: React 18, TypeScript, Vite, Tailwind CSS, Vitest + React Testing Library
- **Backend (`server/`)**: Node.js 20+, Express, TypeScript, SQLite (`better-sqlite3`) + Knex migrations, `@modelcontextprotocol/sdk`
- **Desktop (`electron/`)**: Electron 33, `electron-builder`

### Building & Running Locally

> **Prerequisites for Desktop / Native Addons**: Node.js 20+, npm, and C++ build tools for `better-sqlite3` (`python3`, `make`, `g++` on Linux; Xcode Command Line Tools on macOS; Visual Studio C++ Build Tools on Windows).

```bash
# 1. Install dependencies across root, server, and client
npm run install:all

# 2. Run frontend tests
cd client && npm test

# 3. Launch the Electron desktop app locally
npm run desktop:start

# 4. Build distributable desktop installers (.AppImage, .dmg, .exe) into dist-desktop/
npm run desktop:dist
```

For Docker container verification during development, run `./cinefile-skill.sh` from the repository root to rebuild the container image, apply migrations, and verify both the public (`:3005`) and admin (`:3001`) services.

## AI Disclosure

Cinefile was generated almost entirely by a combination of Cursor's Composer, Gemini 2.5/3.0/4.0, Anthropic Opus models. As a hobby project, I am deliberately using it as a testing ground to 'feel' out the capabilities of current LLM models. If this is not to your taste or preferences, I completely understand, but I am disclosing this for transparency reasons. I'm committed to building a good product, and this is a low-stakes way for me to try new tools.

## License

MIT
