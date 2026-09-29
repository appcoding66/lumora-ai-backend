const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;

const MODEL = "gemini-3.8-flash";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});


// HOME
app.get("/", (req, res) => {
  res.json({
    name: "Lumora AI Backend",
    status: "online",
    provider: "Google Gemini",
    model: MODEL
  });
});


// CREATOR QUESTION
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


// CHAT
app.post("/chat", async (req, res) => {

  const message =
    String(req.body?.message || "").trim();

  if (!message) {
    return res.status(400).json({
      error: "Message is required."
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      error: "GEMINI_API_KEY is not configured on the server."
    });
  }

  if (isCreatorQuestion(message)) {
    return res.json({
      reply:
        "আমি Lumora AI। আমাকে তৈরি ও ডেভেলপ করেছেন অঙ্কুশ মণ্ডল (Ankush Mondal)। আমার AI প্রযুক্তি Google Gemini দ্বারা চালিত।",
      model: MODEL
    });
  }

  try {

    const response = await ai.models.generateContent({
      model: MODEL,

      contents: message,

      config: {
        systemInstruction:
          "You are Lumora AI, a helpful AI assistant. " +
          "Lumora AI was created and developed by Ankush Mondal (অঙ্কুশ মণ্ডল). " +
          "Always answer in the same language as the user. " +
          "If the user writes Bengali, reply naturally in Bengali. " +
          "Be accurate, helpful and clear.",

        maxOutputTokens: 4096
      }
    });

    const reply = response.text;

    if (!reply || !reply.trim()) {
      return res.status(500).json({
        error: "Gemini returned an empty response."
      });
    }

    return res.json({
      reply: reply.trim(),
      model: MODEL
    });

  } catch (error) {

    console.error("Lumora AI ERROR:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Unable to get a response from Gemini."
    });
  }
});


app.listen(PORT, () => {
  console.log(
    `Lumora AI Backend running on port ${PORT}`
  );
});
