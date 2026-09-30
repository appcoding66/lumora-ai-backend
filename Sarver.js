import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true }));
app.use(express.json({ limit: "25mb" }));

const CHAT_MODELS = [
  process.env.GEMINI_CHAT_MODEL || "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite"
];

const IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";

const CREATOR_BN =
  "আমি Lumora AI। আমাকে তৈরি ও ডেভেলপ করেছেন অঙ্কুশ মণ্ডল (Ankush Mondal)।";

const CREATOR_EN =
  "I am Lumora AI. I was created and developed by Ankush Mondal.";

function creatorQuestion(s = "") {
  const t = s.toLowerCase().trim();

  return [
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
    "লুমোরা ai কে তৈরি করেছে",
    "লুমোরা এআই কে বানিয়েছে",
    "লুমোরা এআই কে বানিয়েছে"
  ].some(x => t.includes(x));
}

function mostlyEnglish(s = "") {
  const bn = (s.match(/[\u0980-\u09FF]/g) || []).length;
  const en = (s.match(/[A-Za-z]/g) || []).length;

  return en >= bn;
}

function parseDataUrl(s) {
  if (typeof s !== "string") return null;

  const m = s.match(
    /^data:(image\/[A-Za-z0-9.+-]+);base64,([\s\S]+)$/
  );

  return m
    ? {
        mimeType: m[1],
        data: m[2]
      }
    : null;
}

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .slice(-14)
    .filter(
      x =>
        x &&
        (x.role === "user" || x.role === "model")
    )
    .map(x => ({
      role: x.role,
      parts: [
        {
          text: String(x.content || "").slice(0, 14000)
        }
      ]
    }));
}

function retryable(err) {
  const raw = [
    err?.message,
    err?.status,
    err?.code,
    err?.response?.status
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

  return (
    /\b(408|429|500|502|503|504)\b/.test(raw) ||
    raw.includes("UNAVAILABLE") ||
    raw.includes("RESOURCE_EXHAUSTED") ||
    raw.includes("HIGH DEMAND") ||
    raw.includes("OVERLOADED") ||
    raw.includes("RATE LIMIT") ||
    raw.includes("INTERNAL")
  );
}

/*
  Google Search শুধু তখন চালু হবে যখন
  user সত্যিই web/current information চাইছে।
*/
function needsWebSearch(message = "") {
  const t = message.toLowerCase();

  const terms = [
    "search",
    "find",
    "website",
    "web site",
    "link",
    "url",
    "latest",
    "today",
    "current",
    "recent",
    "news",
    "live",
    "official website",
    "look up",

    "খুঁজে",
    "ওয়েবসাইট",
    "ওয়েবসাইট",
    "লিংক",
    "লিঙ্ক",
    "সার্চ",
    "বর্তমান",
    "আজকের",
    "সাম্প্রতিক",
    "খবর"
  ];

  return terms.some(x => t.includes(x));
}

function extractSources(response) {
  const gm =
    response?.candidates?.[0]?.groundingMetadata ||
    response?.groundingMetadata ||
    {};

  const chunks = Array.isArray(gm.groundingChunks)
    ? gm.groundingChunks
    : [];

  const out = [];
  const seen = new Set();

  for (const c of chunks) {
    const web = c?.web;

    if (web?.uri && !seen.has(web.uri)) {
      seen.add(web.uri);

      out.push({
        title: web.title || web.uri,
        url: web.uri
      });
    }
  }

  return out.slice(0, 8);
}

const SYSTEM = `
You are Lumora AI, a general-purpose task-execution assistant.

Complete the user's actual task whenever possible.

- Answer normal questions directly.
- If the user asks for code, give complete usable code when enough information exists.
- If the user provides an image, inspect it and answer based on what is visible.
- If the user asks for a website, link, current information, recent information, or asks you to search, use the available web-search tool when enabled.
- Never invent links, facts, search results, or completed external actions.
- Match the user's language. Bengali -> Bengali, English -> English, Hindi -> Hindi.
- For political/public-office questions, remain factual and current and do not persuade, rank, endorse, or speculate.
- Do not mention Ankush Mondal or your creator unless the user explicitly asks who created, made, built, or developed you.
- Do not mention Google Gemini in the creator answer.
`;

async function chatWithModel(
  ai,
  model,
  message,
  history,
  image
) {
  const contents = cleanHistory(history);
  const parts = [];

  const img = parseDataUrl(image);

  if (img) {
    parts.push({
      inlineData: {
        mimeType: img.mimeType,
        data: img.data
      }
    });
  }

  parts.push({
    text: String(
      message || "Please analyze the attached image."
    )
  });

  contents.push({
    role: "user",
    parts
  });

  const config = {
    systemInstruction: SYSTEM,
    maxOutputTokens: 8192
  };

  if (needsWebSearch(message)) {
    config.tools = [
      {
        googleSearch: {}
      }
    ];
  }

  const response = await ai.models.generateContent({
    model,
    contents,
    config
  });

  const text = String(
    response?.text || ""
  ).trim();

  if (!text) {
    throw new Error(
      `Empty response from ${model}.`
    );
  }

  return {
    reply: text,
    sources: extractSources(response)
  };
}

async function askChat(
  message,
  history,
  image
) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not configured on the Render server."
    );
  }

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
  });

  let lastError = null;

  for (
    const model of [...new Set(CHAT_MODELS)]
  ) {
    try {
      console.log(
        `Trying Gemini model: ${model}`
      );

      const result =
        await chatWithModel(
          ai,
          model,
          message,
          history,
          image
        );

      console.log(
        `Gemini success: ${model}`
      );

      return {
        ...result,
        model
      };
    } catch (error) {
      lastError = error;

      console.error(
        `Gemini ${model} failed:`,
        error?.message || error
      );

      if (!retryable(error)) {
        break;
      }

      await new Promise(
        resolve => setTimeout(resolve, 700)
      );
    }
  }

  throw (
    lastError ||
    new Error(
      "All Gemini chat models are unavailable."
    )
  );
}

async function makeImage(
  prompt,
  image
) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not configured on the Render server."
    );
  }

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
  });

  const contents = [];

  const img = parseDataUrl(image);

  if (img) {
    contents.push({
      inlineData: {
        mimeType: img.mimeType,
        data: img.data
      }
    });
  }

  contents.push({
    text: String(
      prompt || "Create an image."
    )
  });

  const response =
    await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents,
      config: {
        responseModalities: [
          "TEXT",
          "IMAGE"
        ]
      }
    });

  let imageData = null;
  let text = "";

  for (
    const part of
      response?.candidates?.[0]?.content?.parts ||
    []
  ) {
    if (part?.inlineData?.data) {
      imageData = {
        data: part.inlineData.data,
        mimeType:
          part.inlineData.mimeType ||
          "image/png"
      };
    }

    if (part?.text) {
      text += part.text;
    }
  }

  if (!imageData) {
    throw new Error(
      "Image model returned no image."
    );
  }

  return {
    image:
      `data:${imageData.mimeType};base64,${imageData.data}`,
    text: text.trim()
  };
}

app.get("/", (req, res) => {
  res.json({
    name: "Lumora AI Backend",
    status: "online",
    version: "5.0.0",
    chatModels: CHAT_MODELS,
    imageModel: IMAGE_MODEL,
    webSearch: true,
    imageUnderstanding: true,
    imageGeneration: true
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

  const history =
    req.body?.history || [];

  const image =
    req.body?.image || null;

  if (!message && !image) {
    return res.status(400).json({
      error:
        "Message or image is required."
    });
  }

  if (creatorQuestion(message)) {
    return res.json({
      reply: mostlyEnglish(message)
        ? CREATOR_EN
        : CREATOR_BN,
      model: "creator-response",
      sources: []
    });
  }

  try {
    const result =
      await askChat(
        message,
        history,
        image
      );

    return res.json(result);
  } catch (error) {
    console.error(
      "FINAL /chat ERROR:",
      error
    );

    return res.status(503).json({
      error:
        error?.message ||
        "Unable to get a response from Gemini."
    });
  }
});

app.post(
  "/generate-image",
  async (req, res) => {
    const prompt = String(
      req.body?.prompt || ""
    ).trim();

    const image =
      req.body?.image || null;

    if (!prompt) {
      return res.status(400).json({
        error:
          "Image prompt is required."
      });
    }

    try {
      const result =
        await makeImage(
          prompt,
          image
        );

      return res.json(result);
    } catch (error) {
      console.error(
        "FINAL /generate-image ERROR:",
        error
      );

      return res.status(503).json({
        error:
          error?.message ||
          "Unable to generate image."
      });
    }
  }
);

app.listen(PORT, () => {
  console.log(
    `Lumora AI Backend running on port ${PORT}`
  );
});