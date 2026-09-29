const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

app.get("/", (req, res) => {
  res.json({
    name: "Lumora AI Backend",
    status: "online",
    provider: "Google Gemini",
    model: DEFAULT_MODEL
  });
});

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter(item =>
      item &&
      (item.role === "user" || item.role === "model") &&
      typeof item.text === "string" &&
      item.text.trim()
    )
    .slice(-20)
    .map(item => ({
      role: item.role,
      parts: [{ text: item.text.trim() }]
    }));
}

function extractReply(data) {
  const parts =
    data?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) return "";

  return parts
    .filter(part => typeof part?.text === "string")
    .map(part => part.text)
    .join("")
    .trim();
}

async function callGemini(model, contents, useSearch) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const body = {
    systemInstruction: {
      parts: [{
        text:
          "You are Lumora AI, a helpful general-purpose AI assistant. " +
          "Answer accurately and clearly. Use the same language as the user. " +
          "For Bengali questions, answer in natural Bengali. " +
          "Do not invent facts. If you are unsure, say so. " +
          "For current or changing information, use Google Search when available. " +
          "Give practical explanations and examples when useful."
      }]
    },
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096
    }
  };

  // Google Search grounding is supported by Gemini 2.5 Flash-Lite
  // and can provide up-to-date information while staying within
  // the model's available free-tier search allowance.
  if (useSearch) {
    body.tools = [{ google_search: {} }];
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();

  if (!response.ok) {
    const message =
      data?.error?.message ||
      `Gemini API request failed with status ${response.status}.`;

    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return extractReply(data);
}

app.post("/chat", async (req, res) => {
  const message = String(req.body?.message || "").trim();

  if (!message) {
    return res.status(400).json({ error: "Message is required." });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY is not configured on the server."
    });
  }

  const history = cleanHistory(req.body?.history);

  // If the frontend sends history, keep the conversation context.
  // Remove a possible duplicate current message from the end.
  const contents = [...history];

  if (
    contents.length === 0 ||
    contents[contents.length - 1]?.role !== "user" ||
    contents[contents.length - 1]?.parts?.[0]?.text !== message
  ) {
    contents.push({
      role: "user",
      parts: [{ text: message }]
    });
  }

  try {
    let reply = "";

    try {
      // First attempt: free-tier friendly model with Google Search grounding.
      reply = await callGemini(DEFAULT_MODEL, contents, true);
    } catch (firstError) {
      console.error("Gemini first attempt failed:", firstError.message);

      // Some accounts/projects may not have the 2.5 model available.
      // Try a current Flash-Lite model without Search as a fallback.
      const fallbackModel = "gemini-3.5-flash-lite";

      if (
        DEFAULT_MODEL !== fallbackModel &&
        (firstError.status === 400 ||
          firstError.status === 403 ||
          firstError.status === 404)
      ) {
        reply = await callGemini(fallbackModel, contents, false);
      } else {
        throw firstError;
      }
    }

    if (!reply) {
      return res.status(502).json({
        error: "Gemini returned no text response."
      });
    }

    res.json({
      reply,
      model: DEFAULT_MODEL
    });
  } catch (err) {
    console.error("Lumora Gemini error:", err);

    res.status(err.status && Number.isInteger(err.status) ? err.status : 500).json({
      error: err.message || "Unable to get a response from Gemini."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Lumora AI Gemini Backend running on port ${PORT}`);
});
