const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;

const CHAT_MODEL =
  process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

const IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";


// ===============================
// HOME
// ===============================

app.get("/", (req, res) => {
  res.json({
    name: "Lumora AI Backend",
    status: "online",
    provider: "Google Gemini",
    model: CHAT_MODEL,
    imageModel: IMAGE_MODEL
  });
});


// ===============================
// EXTRACT GEMINI TEXT
// ===============================

function extractText(data) {
  const parts =
    data?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .filter(part => typeof part?.text === "string")
    .map(part => part.text)
    .join("")
    .trim();
}


// ===============================
// CREATOR QUESTION DETECTION
// ===============================

function isCreatorQuestion(message) {
  return /(?:who\s+(?:created|made|built|developed)\s+you|who\s+is\s+your\s+(?:creator|developer|maker)|কে\s*(?:তোমাকে|আপনাকে|আপনি)?\s*(?:তৈরি|বান|ডেভেলপ)\s*(?:করেছে|করেছেন|করল|করলেন)|তোমাকে\s*কে\s*বানিয়েছে|আপনাকে\s*কে\s*বানিয়েছে|কে\s*তোমাকে\s*তৈরি\s*করেছে|কে\s*আপনাকে\s*তৈরি\s*করেছে)/i.test(
    message
  );
}


// ===============================
// GEMINI CHAT
// ===============================

async function chatWithGemini(message) {

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      CHAT_MODEL
    )}:generateContent`;

  const body = {

    systemInstruction: {
      parts: [
        {
          text:
            "You are Lumora AI, a helpful general-purpose AI assistant. " +
            "Lumora AI was created and developed by Ankush Mondal (অঙ্কুশ মণ্ডল). " +
            "Do not claim that Ankush Mondal created the underlying Google Gemini model. " +
            "Lumora AI is the app/assistant created by Ankush Mondal, while the underlying AI technology is provided by Google Gemini. " +
            "Use the same language as the user. " +
            "For Bengali questions, answer naturally in Bengali. " +
            "Do not invent facts."
        }
      ]
    },

    contents: [
      {
        role: "user",
        parts: [
          {
            text: message
          }
        ]
      }
    ],

    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096
    },

    tools: [
      {
        google_search: {}
      }
    ]
  };


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

    const error = new Error(
      data?.error?.message ||
      `Gemini error ${response.status}`
    );

    error.status = response.status;

    throw error;
  }


  return extractText(data);
}


// ===============================
// CHAT API
// ===============================

app.post("/chat", async (req, res) => {

  const message =
    String(req.body?.message || "").trim();


  if (!message) {

    return res.status(400).json({
      error: "Message is required."
    });

  }


  // Creator question is answered directly
  // without asking Gemini.

  if (isCreatorQuestion(message)) {

    return res.json({

      reply:
        "আমি Lumora AI। আমাকে তৈরি ও ডেভেলপ করেছেন অঙ্কুশ মণ্ডল (Ankush Mondal)। আমার AI প্রযুক্তি Google Gemini দ্বারা চালিত।"

    });

  }


  // Check API key

  if (!process.env.GEMINI_API_KEY) {

    return res.status(500).json({

      error:
        "GEMINI_API_KEY is not configured on the server."

    });

  }


  try {

    const reply =
      await chatWithGemini(message);


    if (!reply) {

      return res.status(502).json({

        error:
          "Gemini returned no text response."

      });

    }


    return res.json({

      reply: reply,

      model: CHAT_MODEL

    });

  }

  catch (error) {

    console.error(
      "Lumora Gemini error:",
      error
    );


    return res.status(
      error.status || 500
    ).json({

      error:
        error.message ||
        "Unable to get a response from Gemini."

    });

  }

});


// ===============================
// IMAGE GENERATION
// ===============================

app.post("/generate-image", async (req, res) => {

  const prompt =
    String(req.body?.prompt || "").trim();


  if (!prompt) {

    return res.status(400).json({

      error:
        "Image prompt is required."

    });

  }


  if (!process.env.GEMINI_API_KEY) {

    return res.status(500).json({

      error:
        "GEMINI_API_KEY is not configured on the server."

    });

  }


  try {

    const url =
      "https://generativelanguage.googleapis.com/v1beta/interactions";


    const body = {

      model: IMAGE_MODEL,

      input: [
        {
          type: "text",
          text: prompt
        }
      ],

      response_format: {
        type: "image",
        mime_type: "image/png",
        aspect_ratio: "1:1",
        image_size: "1K"
      }

    };


    const response = await fetch(url, {

      method: "POST",

      headers: {

        "Content-Type": "application/json",

        "x-goog-api-key":
          process.env.GEMINI_API_KEY

      },

      body: JSON.stringify(body)

    });


    const data =
      await response.json();


    if (!response.ok) {

      const error = new Error(
        data?.error?.message ||
        `Image API error ${response.status}`
      );

      error.status =
        response.status;

      throw error;
    }


    const image =
      data?.output_image;


    if (!image?.data) {

      return res.status(502).json({

        error:
          "The image model returned no image."

      });

    }


    const mime =
      image.mime_type ||
      "image/png";


    return res.json({

      image:
        `data:${mime};base64,${image.data}`,

      model:
        IMAGE_MODEL

    });

  }

  catch (error) {

    console.error(
      "Image generation error:",
      error
    );


    return res.status(
      error.status || 500
    ).json({

      error:
        error.message ||
        "Unable to generate image."

    });

  }

});


// ===============================
// START SERVER
// ===============================

app.listen(PORT, () => {

  console.log(
    `Lumora AI backend running on port ${PORT}`
  );

});
