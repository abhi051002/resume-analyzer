import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Ollama } from "ollama";
import rateLimit from "express-rate-limit";
import multer from "multer";
import fs from "fs";
import { extractText } from "unpdf";
import Tesseract from "tesseract.js";

dotenv.config();

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseJsonFromModel(content) {
    if (typeof content !== "string") {
        throw new Error("Model response is not text.");
    }
    const cleaned = content.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    return JSON.parse(cleaned);
}

async function extractTextFromPDF(buffer) {
    const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
    return text;
}

async function extractTextFromImage(buffer) {
    const { data: { text } } = await Tesseract.recognize(buffer, "eng", {
        logger: () => {},
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
                content: "You are a document classifier. Respond with valid JSON only.",
            },
            {
                role: "user",
                content: `Does the following text appear to be a resume or CV? Look for typical resume elements like work experience, education, skills, contact info, or job titles.

Text:
${snippet}

Respond with ONLY this JSON:
{"isResume": true or false, "reason": "brief one-sentence explanation"}`,
            },
        ],
        stream: false,
    });

    return JSON.parse(response.message.content);
}

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.length === 0) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS: origin '${origin}' is not allowed.`));
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
};

// ── Multer — memory storage, no disk writes ───────────────────────────────────
const ALLOWED_MIME_TYPES = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
]);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only PDF, JPG, PNG, or WEBP files are allowed."));
        }
    },
});

// ── App ───────────────────────────────────────────────────────────────────────
const app = express();
app.use(cors(corsOptions));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3";

const ollama = new Ollama({
    host: process.env.OLLAMA_HOST,
    headers: {
        Authorization: "Bearer " + process.env.OLLAMA_API_KEY,
    },
});

const analyzeLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 10,
    message: { error: "Too many resume analyses. Try again later." },
});

// ── Routes ────────────────────────────────────────────────────────────────────
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
            const { mimetype, buffer } = req.file;  // buffer from memoryStorage

            if (mimetype === "application/pdf") {
                resumeText = await extractTextFromPDF(buffer);
            } else if (mimetype.startsWith("image/")) {
                resumeText = await extractTextFromImage(buffer);
            }

            if (!resumeText || resumeText.trim().length < 50) {
                return res.status(400).json({
                    error: "Could not extract enough text. Make sure the file is clear and readable.",
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
                {
                    role: "system",
                    content: "You are a resume analysis assistant. Always respond with valid JSON only.",
                },
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

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
    if (err?.message?.startsWith("CORS:")) {
        return res.status(403).json({ error: err.message });
    }
    if (err?.message) {
        return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: "Internal server error." });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    if (allowedOrigins.length > 0) {
        console.log(`CORS allowed origins: ${allowedOrigins.join(", ")}`);
    } else {
        console.log("CORS: all origins allowed (ALLOWED_ORIGINS not set)");
    }
});