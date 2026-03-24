import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Ollama } from "ollama";
import rateLimit from "express-rate-limit";
import multer from "multer";
import fs from "fs";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import Tesseract from "tesseract.js";

function parseJsonFromModel(content) {
    if (typeof content !== "string") {
        throw new Error("Model response is not text.");
    }
    const cleaned = content.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    return JSON.parse(cleaned);
}

async function extractTextFromPDF(buffer) {
    const uint8Array = new Uint8Array(buffer);
    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdf = await loadingTask.promise;

    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(" ");
        fullText += pageText + "\n";
    }

    return fullText;
}

// ← New: OCR for images
async function extractTextFromImage(filePath) {
    const { data: { text } } = await Tesseract.recognize(filePath, "eng", {
        logger: () => { }, // silence progress logs
    });
    return text;
}

async function isResume(ollama, model, text) {
    const snippet = text.slice(0, 1500);
    const response = await ollama.chat({
        model,
        messages: [
            {
                role: "system",
                content: "You are a document classifier. Respond with valid JSON only."
            },
            {
                role: "user",
                content: `Does the following text appear to be a resume or CV? Look for typical resume elements like work experience, education, skills, contact info, or job titles.

Text:
${snippet}

Respond with ONLY this JSON:
{"isResume": true or false, "reason": "brief one-sentence explanation"}`
            }
        ],
        stream: false,
    });

    const parsed = JSON.parse(response.message.content);
    return parsed;
}

const ALLOWED_MIME_TYPES = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
]);

// ← Accept pdf + images
const upload = multer({
    dest: "uploads/",
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only PDF, JPG, PNG, or WEBP files are allowed."));
        }
    },
});

dotenv.config();

const rawOrigins = process.env.ALLOWED_ORIGINS ?? "";
const allowedOrigins = rawOrigins
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

const corsOptions = {
    origin: (origin, callback) => {
        console.log("Request origin:", JSON.stringify(origin));
        console.log("Allowed list:", JSON.stringify(allowedOrigins));
        // Allow requests with no origin (e.g. curl, Postman, server-to-server)
        if (!origin) return callback(null, true);

        if (allowedOrigins.length === 0) {
            // No env var set — allow all (development fallback)
            return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        callback(new Error(`CORS: origin '${origin}' is not allowed.`));
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
};

const app = express();
app.use(cors(corsOptions));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3";

const ollama = new Ollama({
    host: "https://ollama.com",
    headers: {
        Authorization: "Bearer " + process.env.OLLAMA_API_KEY,
    },
});

const analyzeLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 10,
    message: { error: "Too many resume analyses. Try again later." },
});

// Handle multer fileFilter errors
function multerErrorHandler(err, req, res, next) {
    if (err?.message) {
        return res.status(400).json({ error: err.message });
    }
    next(err);
}

// ── Health check / landing route ──────────────────────────────────────────────
app.get("/", (_req, res) => {
    res.json({
        status: "ok",
        service: "Resume Checker API",
        version: "1.0.0"
    });
});

app.post("/analyze", analyzeLimiter, upload.single("file"), async (req, res) => {
    try {
        let resumeText = req.body.resumeText;
        const targetRole = (req.body.targetRole || "").toString().trim();

        if (req.file) {
            const { mimetype, path: filePath } = req.file;

            try {
                if (mimetype === "application/pdf") {
                    const buffer = fs.readFileSync(filePath);
                    resumeText = await extractTextFromPDF(buffer);
                } else if (mimetype.startsWith("image/")) {
                    // ← OCR path for images
                    resumeText = await extractTextFromImage(filePath);
                }
            } finally {
                // Always cleanup the temp file
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }

            if (!resumeText || resumeText.trim().length < 50) {
                return res.status(400).json({
                    error: "Could not extract enough text. Make sure the file is clear and readable."
                });
            }

            const classification = await isResume(ollama, OLLAMA_MODEL, resumeText);
            if (!classification.isResume) {
                return res.status(400).json({
                    error: "The uploaded file does not appear to be a resume.",
                    reason: classification.reason,
                });
            }
        }

        if (!resumeText) {
            return res.status(400).json({ error: "No resume content provided." });
        }

        const prompt = `
        Analyze the following resume and give feedback.

        Resume:
        ${resumeText}

        Target Role or Job Description (optional):
        ${targetRole || "Not provided"}

        Provide feedback on:
        1. Relevance of skills
        2. Missing keywords
        3. Overall structure and clarity
        4. Any missing information
        5. Suggestions for improvement

        Return the feedback in JSON format with the following keys:
        - relevanceScore (0-100)
        - atsScore (0-100)
        - toneScore (0-100)
        - readabilityScore (0-100)
        - missingKeywords (array of strings)
        - overallFeedback (string)
        - suggestions (array of strings)
        - strengths (array of strings)
        - weaknesses (array of strings)

        Respond with ONLY valid JSON, no markdown or extra text.
        `;

        const response = await ollama.chat({
            model: OLLAMA_MODEL,
            messages: [
                { role: "system", content: "You are a resume analysis assistant. Always respond with valid JSON only." },
                { role: "user", content: prompt },
            ],
            stream: false,
        });

        const feedback = parseJsonFromModel(response.message.content);
        res.json(feedback);
    } catch (error) {
        console.error("Error analyzing resume:", error);
        res.status(500).json({ error: "Failed to analyze resume." });
    }
});

// ← Must be after routes
app.use(multerErrorHandler);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    if (allowedOrigins.length > 0) {
        console.log(`CORS allowed origins: ${allowedOrigins.join(", ")}`);
    } else {
        console.log("CORS: all origins allowed (ALLOWED_ORIGINS not set)");
    }
});