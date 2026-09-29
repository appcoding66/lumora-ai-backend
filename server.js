import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "20mb" }));

const CHAT_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite"
];

const IMAGE_MODEL = "gemini-3.1-flash-image";

const CREATOR_BN =
  "আমি Lumora AI। আমাকে তৈরি ও ডেভেলপ করেছেন অঙ্কুশ মণ্ডল (Ankush Mondal)।";

const CREATOR_EN =
  "I am Lumora AI. I was created and developed by Ankush Mondal.";

function isCreatorQuestion(message = "") {
  const text = message.toLowerCase().trim();

  const patterns = [
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

  return patterns.some((p) => text.includes(p));
}

function isMostlyEnglish(text = "") {
  const bn = (text.match(/[\u0980-\u09FF]/g) || []).length;
  const en = (text.match(/[A-Za-z]/g) || []).length;
  return en >= bn;
}

function shouldFallback(error) {
  const raw = [
    error?.message,
    error?.status,
    error?.code,
    error?.response?.status
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

  return (
    /\b(429|500|502|503|504)\b/.test(raw) ||
    raw.includes("UNAVAILABLE") ||
    raw.includes("RESOURCE_EXHAUSTED") ||
    raw.includes("HIGH DEMAND") ||
    raw.includes("OVERLOADED") ||
    raw.includes("RATE LIMIT")
  );
}

function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") return null;

  const match = dataUrl.match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/
  );

  if (!match) return null;

  return {
    mimeType: match[1],
    data: match[2]
  };
}

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .slice(-12)
    .filter(
      (item) =>
        item &&
        (item.role === "user" || item.role === "model")
    )
    .map((item) => ({
      role: item.role,
      parts: [
        {
          text: String(item.content || "").slice(0, 12000)
        }
      ]
    }));
}

const SYSTEM_INSTRUCTION = `
You are Lumora AI, a capable general-purpose AI assistant.

Your job is to understand the user's actual goal and help complete the task, not merely talk about the task.

TASK EXECUTION:
- Analyze what the user is asking for before answering.
- If the user asks for code, produce complete usable code when enough information is available.
- If the user asks to fix, improve, or rewrite code, work directly on the provided code.
- If the user asks for a website, app, document, message, plan, explanation, calculation, or other deliverable, provide the actual useful result.
- If the user asks for an explanation, explain clearly and directly.
- If the user provides an image or screenshot, inspect it and use what is visible in the image.
- If the user asks for current, recent, live, official, or location-specific information, use web search when available.
- If the user asks for a website link, provide a useful official or directly relevant link when available.
- For current political or public-office questions, provide factual current information from reliable sources and avoid political persuasion or rankings.
- Do not claim that you performed an external action unless you actually did it.
- Do not invent facts, links, results, or completed actions.

LANGUAGE:
- Reply in the same language as the user's latest message.
- English input -> English response.
- Bengali input -> Bengali response.
- Hindi input -> Hindi response.
- If the user mixes languages, use the dominant language.

CREATOR:
- Never mention Ankush Mondal or your creator in ordinary conversation.
- Only discuss your creator when the user explicitly asks who created, made, built, or developed you.
- Do not mention Google Gemini or your underlying AI provider in the creator answer.

STYLE:
- Be natural and helpful.
- Do not repeatedly introduce yourself.
- When the user gives a concrete task, focus on completing it.
`;

async function generateChat(ai, model, message, history, image) {
  const contents = [];

  const previous = cleanHistory(history);
  contents.push(...previous);

  const currentParts = [];

  const imagePart = parseDataUrl(image);

  if (imagePart) {
    currentParts.push({
      inlineData: {
        mimeType: imagePart.mimeType,
        data: imagePart.data
      }
    });
  }

  currentParts.push({
    text: String(
      message || "Please analyze the attached image."
    )
  });

  contents.push({
    role: "user",
    parts: currentParts
  });

  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      maxOutputTokens: 8192,
      tools: [
        {
          googleSearch: {}
        }
      ]
    }
  });

  const text = String(response?.text || "").trim();

  if (!text) {
    throw new Error(
      `Model ${model} returned an empty response.`
    );
  }

  return text;
}

async function askLumora(message, history, image) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not configured on the server."
    );
  }

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
  });

  let lastError = null;

  for (const model of CHAT_MODELS) {
    try {
      console.log(`Trying model: ${model}`);

      const reply = await generateChat(
        ai,
        model,
        message,
        history,
        image
      );

      console.log(`Model success: ${model}`);

      return {
        reply,
        model
      };
    } catch (error) {
      lastError = error;

      console.error(
        `${model} failed:`,
        error?.message || error
      );

      if (!shouldFallback(error)) {
        throw error;
      }

      await new Promise((resolve) =>
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

async function generateImage(prompt, image) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not configured on the server."
    );
  }

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
  });

  const contents = [];

  const sourceImage = parseDataUrl(image);

  if (sourceImage) {
    contents.push({
      inlineData: {
        mimeType: sourceImage.mimeType,
        data: sourceImage.data
      }
    });
  }

  contents.push({
    text: String(prompt || "Create an image.")
  });

  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents,
    config: {
      responseModalities: ["TEXT", "IMAGE"]
    }
  });

  const parts =
    response?.candidates?.[0]?.content?.parts || [];

  let imageData = null;
  let text = "";

  for (const part of parts) {
    if (part?.inlineData?.data) {
      imageData = {
        data: part.inlineData.data,
        mimeType:
          part.inlineData.mimeType || "image/png"
      };
    }

    if (part?.text) {
      text += part.text;
    }
  }

  if (!imageData) {
    throw new Error(
      "The image model did not return an image."
    );
  }

  return {
    image: `data:${imageData.mimeType};base64,${imageData.data}`,
    text: text.trim()
  };
}

app.get("/", (req, res) => {
  res.json({
    name: "Lumora AI Backend",
    status: "online",
    provider: "Google Gemini",
    multimodal: true,
    webSearch: true,
    imageGeneration: true,
    fallback: true
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    status: "online"
  });
});

app.post("/chat", async (req, res) => {
  const message = String(
    req.body?.message || ""
  ).trim();

  const history = req.body?.history || [];
  const image = req.body?.image || null;

  if (!message && !image) {
    return res.status(400).json({
      error: "Message or image is required."
    });
  }

  if (isCreatorQuestion(message)) {
    return res.json({
      reply: isMostlyEnglish(message)
        ? CREATOR_EN
        : CREATOR_BN,
      model: "lumora-creator-response"
    });
  }

  try {
    const result = await askLumora(
      message,
      history,
      image
    );

    return res.json({
      reply: result.reply,
      model: result.model
    });
  } catch (error) {
    console.error(
      "Lumora final error:",
      error
    );

    return res.status(503).json({
      error:
        "Lumora AI is temporarily unavailable. Please try again in a moment."
    });
  }
});

app.post("/generate-image", async (req, res) => {
  const prompt = String(
    req.body?.prompt || ""
  ).trim();

  const image = req.body?.image || null;

  if (!prompt) {
    return res.status(400).json({
      error: "Image prompt is required."
    });
  }

  try {
    const result = await generateImage(
      prompt,
      image
    );

    return res.json({
      image: result.image,
      text: result.text
    });
  } catch (error) {
    console.error(
      "Image generation error:",
      error
    );

    return res.status(503).json({
      error:
        "Image generation is temporarily unavailable. Please try again."
    });
  }
});

app.listen(PORT, () => {
  console.log(
    `Lumora AI Backend running on port ${PORT}`
  );
});
