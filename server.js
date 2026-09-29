import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Gemini model fallback
// একটি model ব্যস্ত থাকলে পরের model চেষ্টা করবে।
const MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash"
];

const CREATOR_REPLY =
  "আমি Lumora AI। আমাকে তৈরি ও ডেভেলপ করেছেন অঙ্কুশ মণ্ডল (Ankush Mondal)। আমার AI প্রযুক্তি Google Gemini দ্বারা চালিত।";

function isCreatorQuestion(message) {
  const text = message.toLowerCase();

  return (
    text.includes("who created you") ||
    text.includes("who made you") ||
    text.includes("who built you") ||
    text.includes("who developed you") ||
    text.includes("who is your creator") ||
    text.includes("who is your developer") ||
    text.includes("কে তোমাকে তৈরি করেছে") ||
    text.includes("কে আপনাকে তৈরি করেছে") ||
    text.includes("তোমাকে কে বানিয়েছে") ||
    text.includes("আপনাকে কে বানিয়েছে") ||
    text.includes("কে তোমাকে বানিয়েছে") ||
    text.includes("কে আপনাকে বানিয়েছে")
  );
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
  const response = await ai.models.generateContent({
    model: model,
    contents: message,

    config: {
      systemInstruction:
        "You are Lumora AI, a helpful AI assistant. " +
        "Lumora AI was created and developed by Ankush Mondal (অঙ্কুশ মণ্ডল). " +
        "Ankush Mondal created the Lumora AI app and assistant, " +
        "but he did not create Google Gemini itself. " +
        "Always answer in the same language used by the user. " +
        "If the user speaks Bengali, answer naturally in Bengali. " +
        "Be helpful, accurate and clear. " +
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

      // পরের model চেষ্টা করার আগে ছোট delay
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


// ===============================
// HOME / STATUS
// ===============================

app.get("/", (req, res) => {
  res.json({
    name: "Lumora AI Backend",
    status: "online",
    provider: "Google Gemini",
    fallback: true,
    models: MODELS
  });
});


// ===============================
// HEALTH CHECK
// ===============================

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    status: "online"
  });
});


// ===============================
// CHAT API
// ===============================

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

    // Creator question হলে সরাসরি Lumora-এর উত্তর
    if (isCreatorQuestion(message)) {
      return res.json({
        reply: CREATOR_REPLY,
        model: "lumora-creator-response"
      });
    }

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


// ===============================
// START SERVER
// ===============================

app.listen(PORT, () => {
  console.log(
    `Lumora AI Backend running on port ${PORT}`
  );
});
