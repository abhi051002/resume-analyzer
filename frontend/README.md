# Frontend (Vite + React) — Resume Analyzer UI

The frontend provides a UI to:

- Paste resume text, or upload a resume file (PDF / JPG / PNG / WEBP)
- Optionally provide a target role / job description
- View the backend’s JSON response as score rings + categorized feedback

## Requirements

- Node.js + npm
- Backend running (or a deployed backend URL)

## Setup

```powershell
cd frontend
npm install
```

## Environment variables

Create `frontend/.env` with:

- **`VITE_BACKEND_URL`**: the full URL to the backend analyze endpoint.

Example (local dev):

```env
VITE_BACKEND_URL=http://localhost:3000/analyze
```

The app reads it as:

- `import.meta.env.VITE_BACKEND_URL`

## Run (dev)

```powershell
cd frontend
npm run dev
```

Vite dev server runs on `http://localhost:5173` by default.

## Build / Preview

```powershell
cd frontend
npm run build
npm run preview
```

