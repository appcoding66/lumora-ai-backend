import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Gemini fallback models
const MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash"
];

// Only used when the user asks who created Lumora AI.
const CREATOR_REPLY_BN =
  "আমি Lumora AI। আমাকে তৈরি ও ডেভেলপ করেছেন অঙ্কুশ মণ্ডল (Ankush Mondal)।";

const CREATOR_REPLY_EN =
  "I am Lumora AI. I was created and developed by Ankush Mondal.";

function isCreatorQuestion(message) {
  const text = message.toLowerCase().trim();

  const creatorQuestions = [
    "who created you",
    "who made you",
    "who built you",
    "who developed you",
    "who is your creator",
    "who is your developer",
    "who created lumora ai",
    "who made lumora ai",

    "কে তোমাকে তৈরি করেছে",
    "কে আপনাকে তৈরি করেছে",
    "তোমাকে কে বানিয়েছে",
    "আপনাকে কে বানিয়েছে",
    "কে তোমাকে বানিয়েছে",
    "কে আপনাকে বানিয়েছে",
    "লুমোরা এআই কে তৈরি করেছে",
    "লুমোরা এআই কে বানিয়েছে",
    "লুমোরা এআই কে বানিয়েছে"
  ];

  return creatorQuestions.some(question =>
    text.includes(question)
  );
}

function isEnglish(message) {
  const text = message.trim();

  if (!text) return false;

  // Bengali Unicode range
  const bengaliCharacters =
    (text.match(/[\u0980-\u09FF]/g) || []).length;

  // Basic Latin letters
  const englishCharacters =
    (text.match(/[A-Za-z]/g) || []).length;

  return englishCharacters >= bengaliCharacters;
}

function shouldFallback(error) {
  const text = [
    error?.message,
    error?.status,
    error?.code,
    error?.response?.status
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

  return (
    /\b(429|500|502|503|504)\b/.test(text) ||
    text.includes("UNAVAILABLE") ||
    text.includes("RESOURCE_EXHAUSTED") ||
    text.includes("HIGH DEMAND") ||
    text.includes("OVERLOADED") ||
    text.includes("RATE LIMIT")
  );
}

async function generateWithModel(ai, model, message) {
  const languageInstruction = isEnglish(message)
    ? "Reply in English."
    : "Reply in Bengali.";

  const response = await ai.models.generateContent({
    model: model,
    contents: message,

    config: {
      systemInstruction:
        "You are Lumora AI, a helpful general-purpose AI assistant. " +

        "Answer the user's actual request directly. " +

        languageInstruction + " " +

        "Never mention Ankush Mondal, your creator, developer, " +
        "Lumora's creator, Google Gemini, or your underlying AI technology " +
        "unless the user specifically asks who created, made, built, " +
        "or developed you. " +

        "Do not repeat creator information in normal conversations. " +

        "Do not introduce yourself unnecessarily. " +

        "If the user asks you to perform a task, help with that task directly. " +

        "Do not add unrelated information about your creator. " +

        "Be helpful, accurate, natural and concise. " +

        "Do not invent information.",

      maxOutputTokens: 4096
    }
  });

  const answer = String(response?.text || "").trim();

  if (!answer) {
    throw new Error(
      `Gemini model ${model} returned an empty response.`
    );
  }

  return answer;
}

async function askGemini(message) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not configured on the server."
    );
  }

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
  });

  let lastError = null;

  for (const model of MODELS) {
    try {
      console.log(`Trying Gemini model: ${model}`);

      const reply = await generateWithModel(
        ai,
        model,
        message
      );

      console.log(`Gemini success: ${model}`);

      return {
        reply,
        model
      };

    } catch (error) {
      lastError = error;

      console.error(
        `Gemini ${model} failed:`,
        error?.message || error
      );

      if (!shouldFallback(error)) {
        throw error;
      }

      await new Promise(resolve =>
        setTimeout(resolve, 500)
      );
    }
  }

  throw (
    lastError ||
    new Error(
      "All Gemini models are temporarily unavailable."
    )
  );
}


// ======================================
// HOME
// ======================================

app.get("/", (req, res) => {
  res.json({
    name: "Lumora AI Backend",
    status: "online",
    provider: "Google Gemini",
    fallback: true
  });
});


// ======================================
// HEALTH CHECK
// ======================================

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    status: "online"
  });
});


// ======================================
// CHAT
// ======================================

app.post("/chat", async (req, res) => {
  try {
    const message = String(
      req.body?.message || ""
    ).trim();

    if (!message) {
      return res.status(400).json({
        error: "Message is required."
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error:
          "GEMINI_API_KEY is not configured on the server."
      });
    }

    // ==================================
    // CREATOR QUESTION
    // ==================================

    if (isCreatorQuestion(message)) {
      const reply = isEnglish(message)
        ? CREATOR_REPLY_EN
        : CREATOR_REPLY_BN;

      return res.json({
        reply: reply,
        model: "lumora-creator-response"
      });
    }

    // ==================================
    // NORMAL AI CHAT
    // ==================================

    const result = await askGemini(message);

    return res.json({
      reply: result.reply,
      model: result.model
    });

  } catch (error) {
    console.error(
      "Lumora AI final error:",
      error
    );

    return res.status(503).json({
      error:
        "Gemini is temporarily unavailable. Please try again in a moment."
    });
  }
});


// ======================================
// START SERVER
// ======================================

app.listen(PORT, () => {
  console.log(
    `Lumora AI Backend running on port ${PORT}`
  );
});
