# BeavArr 🦫

> *"Dam good media from outside the States."*

**BeavArr** is a lightweight, high-performance media discovery frontend and companion for **Overseerr** and **Jellyseerr**. Tailored specifically for Android WebView tabs in the [nzb360](https://nzb360.com/) app, BeavArr surfaces acclaimed and trending English-language TV series and films from **Canada (`CA`)**, the **United Kingdom (`GB`)**, **Australia (`AU`)**, **New Zealand (`NZ`)**, **South Africa (`ZA`)**, **Ireland (`IE`)**, and the **Rest of the World (`ROW`)**.

---

## ✨ Features

- 🇨🇦 🇬🇧 🇦🇺 🇳🇿 🇿🇦 🇮🇪 🌍 **Non-US Focus:** Uncover regional gems across Canada, UK, Australia, New Zealand, South Africa, Ireland, and global international English cinema.
- 🌐 **"All Non-US" Aggregate View:** A single filter that surfaces the best content from every supported region at once — no need to click through each country individually.
- ⚡ **Overseerr & Jellyseerr Integration:** Real-time library availability check (`In Plex/Jellyfin`) and 1-click requests.
- 📱 **Mobile & nzb360 Optimized:**
  - Deep AMOLED Black (`#0a0b0d`) theme.
  - Horizontal scroll snapping carousels (`overflow-x-auto snap-x snap-mandatory`).
  - Native feel bottom-sheet modal for show details.
  - Touch-friendly (minimum 48px targets) with `.no-scrollbar` styling.
  - Prevent swipe-to-refresh pull collisions via `overscroll-behavior-y: contain`.
- 🚀 **SvelteKit & Svelte 5 Runes:** Built with Svelte 5 (`$state`, `$derived`, `$props`), Vite, and Tailwind CSS.
- 💾 **Smart In-Memory Caching:** 6-hour TTL LRU cache for TMDb discovery queries to minimize external API roundtrips.
- 🐳 **Container Ready:** Multi-stage `Dockerfile` and `docker-compose.yml` for effortless self-hosting.

---

## 🛠️ Tech Stack

- **Framework:** [SvelteKit](https://kit.svelte.dev/) with **Svelte 5 Runes**
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Icons:** [Lucide](https://lucide.dev/)
- **Runtime:** Node.js 20+ via `@sveltejs/adapter-node`
- **Cache:** `lru-cache` (6-hour in-memory TTL)
- **Deployment:** Docker & Docker Compose

---

## 🚀 Quick Start

### 1. Clone & Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# TMDb v3 API Key (from https://www.themoviedb.org/settings/api)
TMDB_API_KEY=your_tmdb_api_key

# Overseerr / Jellyseerr base URL & API Key
OVERSEERR_URL=http://your-overseerr-host:5055
OVERSEERR_API_KEY=your_overseerr_api_key

PORT=3000
HOST=0.0.0.0
```

> **Note:** If `TMDB_API_KEY` or `OVERSEERR_URL` are omitted, BeavArr operates in demo mode, previewing hand-curated regional titles so you can test the UI instantly.

### 2. Run Locally

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Or build & run production server
npm run build
npm run preview
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🐳 Running with Docker

### Using Docker Compose (Recommended)

```bash
docker compose up -d --build
```

Access BeavArr at `http://localhost:3000`.

### Using Plain Docker

```bash
docker build -t beavarr:latest .
docker run -d \
  --name beavarr \
  -p 3000:3000 \
  -e TMDB_API_KEY="your_api_key" \
  -e OVERSEERR_URL="http://host.docker.internal:5055" \
  -e OVERSEERR_API_KEY="your_overseerr_key" \
  beavarr:latest
```

---

## 📱 Integrating with nzb360

1. Open **nzb360** on your Android device.
2. Navigate to **Settings** > **Web interface tabs** (or Custom Web Items).
3. Add a new Web item:
   - **Name:** `BeavArr`
   - **URL:** `http://<your-server-ip>:3000`
   - **Icon:** Custom icon or beaver / discovery
4. Tap **Save**. BeavArr will now launch directly within nzb360 with AMOLED black background and native gesture behavior.

---

## 📁 Project Structure

```text
beavarr/
├── Dockerfile                   # Multi-stage container build
├── docker-compose.yml           # Compose specification
├── .env.example                 # Example configuration
├── package.json                 # Project dependencies & scripts
├── svelte.config.js             # SvelteKit configuration (adapter-node)
├── tailwind.config.js           # Theme colors & tokens
├── vite.config.ts               # Vite bundler configuration
└── src/
    ├── app.html                 # HTML template with mobile viewport & overscroll contain
    ├── lib/
    │   ├── components/
    │   │   ├── TopBar.svelte        # Sticky header & country pills
    │   │   ├── Carousel.svelte      # Horizontal scroll-snap carousel
    │   │   ├── MediaCard.svelte     # 2:3 poster artwork card
    │   │   ├── DetailDrawer.svelte  # Bottom sheet modal with Overseerr button
    │   │   └── StatusBanner.svelte  # Setup guidance notice
    │   ├── server/
    │   │   ├── tmdb.ts              # TMDb discover API client & 6-hr LRU cache
    │   │   └── overseerr.ts         # Overseerr status check & request client
    │   └── types.ts                 # Shared TypeScript interfaces
    └── routes/
        ├── +layout.svelte       # Root layout
        ├── layout.css           # Tailwind styles & theme variables
        ├── +page.server.ts      # Parallel data loader for discover rows
        ├── +page.svelte         # Dashboard view
        └── api/
            ├── request/
            │   └── +server.ts   # POST /api/request endpoint
            └── status/
                └── +server.ts   # GET /api/status endpoint
```

---

## 📄 License

MIT
