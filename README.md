# Resume Analyzer (Full Stack)

A small full-stack app that analyzes a resume (pasted text or uploaded file) and returns **scores + structured feedback** as JSON.

## How it works

1. **Frontend (Vite + React)** collects either:
   - **Pasted resume text**, or
   - A **file upload** (PDF / JPG / PNG / WEBP)
2. Frontend sends a request to the backend:
   - Text mode: JSON body `{ resumeText, targetRole }`
   - File mode: `multipart/form-data` with `file` and `targetRole`
3. **Backend (Express)**:
   - Extracts text from PDF (PDF.js) or runs OCR on images (Tesseract)
   - Classifies whether the document looks like a resume (LLM)
   - If it is a resume, asks an LLM to produce **JSON-only** feedback:
     - `relevanceScore`, `atsScore`, `toneScore`, `readabilityScore`
     - `missingKeywords`, `overallFeedback`, `suggestions`, `strengths`, `weaknesses`
4. Frontend renders the returned JSON into a UI (score rings, sections, keyword tags).

## Project structure

- `frontend/`: React UI (Vite dev server)
- `backend/`: Express API that extracts/ocr’s text and calls the model

## Quickstart (Windows / PowerShell)

### Backend

```powershell
cd backend
npm install
npm run start
```

Backend runs on `http://localhost:3000` by default.

### Frontend

Open a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173` by default.

## Configuration (environment variables)

This repo uses `.env` files in `backend/` and `frontend/`.

- **Backend**: see `backend/README.md` for required variables.
- **Frontend**: see `frontend/README.md` for variables and backend URL wiring.

Important: keep secrets (API keys) out of git history. Don’t paste real keys into documentation.

## API overview

- `POST /analyze`
  - **Text mode**: send JSON `{ "resumeText": "...", "targetRole": "..." }`
  - **File mode**: send `multipart/form-data` with `file=<pdf|image>` and optional `targetRole`

If the uploaded file is not recognized as a resume, the backend responds `400` with a message and a short reason.

