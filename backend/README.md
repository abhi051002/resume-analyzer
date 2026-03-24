# Backend (Express) — Resume Analyzer API

The backend exposes a single API endpoint that:

- Accepts **pasted resume text** or an uploaded **PDF/image**
- Extracts text (PDF parsing or OCR)
- Uses an LLM (via the `ollama` client) to:
  - Classify whether the document looks like a resume
  - Return **JSON-only** feedback and scores

## Requirements

- Node.js + npm
- Internet access (this backend is configured to call a hosted Ollama endpoint)

## Setup

```powershell
cd backend
npm install
```

## Environment variables

Create `backend/.env` (or edit yours) with:

- **`PORT`**: API port (default: `3000`)
- **`OLLAMA_MODEL`**: model name used for classification + analysis (default in code: `llama3`)
- **`OLLAMA_API_KEY`**: API key used in the `Authorization: Bearer ...` header

Do **not** commit real API keys.

## Run

```powershell
cd backend
npm run start
```

This uses `nodemon` and starts the server on `http://localhost:3000` by default.

## Endpoint

### `POST /analyze`

Rate-limited (10 requests/minute per IP).

#### Option A — JSON (paste resume text)

Request:

- `Content-Type: application/json`
- Body:
  - **`resumeText`**: string (required)
  - **`targetRole`**: string (optional)

Example body:

```json
{
  "resumeText": "Paste resume here...",
  "targetRole": "Frontend Engineer"
}
```

#### Option B — Multipart (upload a file)

Request:

- `Content-Type: multipart/form-data`
- Fields:
  - **`file`**: PDF / JPG / PNG / WEBP (required)
  - **`targetRole`**: string (optional)

Backend behavior:

- PDFs: text extracted via `pdfjs-dist`
- Images: OCR via `tesseract.js` (English data)
- The uploaded temp file is deleted after processing
- If extracted text is too short, returns `400`
- If the LLM classifier says it’s not a resume, returns `400` with a reason

## Response shape (success)

On success, the backend returns JSON containing:

- `relevanceScore` (0-100)
- `atsScore` (0-100)
- `toneScore` (0-100)
- `readabilityScore` (0-100)
- `missingKeywords` (string[])
- `overallFeedback` (string)
- `suggestions` (string[])
- `strengths` (string[])
- `weaknesses` (string[])

## Troubleshooting

- If you get `Failed to analyze resume.` (500), check backend logs for the underlying exception.
- If you get a `400` about file types, ensure the upload is one of: PDF, JPG, PNG, WEBP.
- If the model returns non-JSON, the backend will fail JSON parsing—try a different `OLLAMA_MODEL`.

