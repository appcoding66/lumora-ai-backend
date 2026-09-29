const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;

const CHAT_MODEL = "gemini-3.8-flash";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/interactions";


// ================================
// HOME
// ================================

app.get("/", (req, res) => {
  res.json({
    name: "Lumora AI Backend",
    status: "online",
    provider: "Google Gemini",
    model: CHAT_MODEL
  });
});


// ================================
// CREATOR QUESTION
// ================================

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


// ================================
// EXTRACT TEXT FROM GEMINI RESPONSE
// ================================

function extractGeminiText(data) {

  // Normal shortcut
  if (
    typeof data?.output_text === "string" &&
    data.output_text.trim()
  ) {
    return data.output_text.trim();
  }


  // Read model output steps
  if (Array.isArray(data?.steps)) {

    const texts = [];

    for (const step of data.steps) {

      if (step?.type !== "model_output") {
        continue;
      }

      if (!Array.isArray(step.content)) {
        continue;
      }

      for (const content of step.content) {

        if (
          content?.type === "text" &&
          typeof content.text === "string" &&
          content.text.trim()
        ) {
          texts.push(content.text.trim());
        }

      }
    }

    if (texts.length > 0) {
      return texts.join("\n\n").trim();
    }
  }


  // Extra fallback
  if (Array.isArray(data?.output)) {

    const texts = [];

    for (const item of data.output) {

      if (
        item?.type === "text" &&
        typeof item.text === "string"
      ) {
        texts.push(item.text.trim());
      }

      if (Array.isArray(item?.content)) {

        for (const content of item.content) {

          if (
            content?.type === "text" &&
            typeof content.text === "string"
          ) {
            texts.push(content.text.trim());
          }

        }
      }
    }

    const result = texts
      .filter(Boolean)
      .join("\n\n")
      .trim();

    if (result) {
      return result;
    }
  }


  return "";
}


// ================================
// ASK GEMINI
// ================================

async function askGemini(message) {

  const requestBody = {

    model: CHAT_MODEL,

    input: message,

    system_instruction:
      "You are Lumora AI, a helpful AI assistant. " +
      "Lumora AI was created and developed by Ankush Mondal (অঙ্কুশ মণ্ডল). " +
      "Ankush Mondal created the Lumora AI app and assistant, " +
      "but he did not create Google Gemini itself. " +
      "The underlying AI technology is provided by Google Gemini. " +
      "Always answer in the same language used by the user. " +
      "If the user speaks Bengali, answer naturally in Bengali. " +
      "Be helpful, accurate and clear. " +
      "Do not invent information.",

    generation_config: {
      max_output_tokens: 4096
    },

    store: false
  };


  const response = await fetch(
    GEMINI_API_URL,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY
      },

      body: JSON.stringify(requestBody)
    }
  );


  const data = await response.json();


  console.log(
    "Gemini HTTP status:",
    response.status
  );


  if (!response.ok) {

    console.error(
      "Gemini API error:",
      JSON.stringify(data, null, 2)
    );

    const error = new Error(
      data?.error?.message ||
      `Gemini API error: ${response.status}`
    );

    error.status = response.status;

    throw error;
  }


  // Debug response structure
  console.log(
    "Gemini response:",
    JSON.stringify(data, null, 2)
  );


  const answer = extractGeminiText(data);


  if (!answer) {

    throw new Error(
      "Gemini returned no readable text. Check Render logs for the full Gemini response."
    );
  }


  return answer;
}


// ================================
// CHAT API
// ================================

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
      error:
        "GEMINI_API_KEY is not configured on the server."
    });

  }


  // Creator question
  if (isCreatorQuestion(message)) {

    return res.json({

      reply:
        "আমি Lumora AI। আমাকে তৈরি ও ডেভেলপ করেছেন অঙ্কুশ মণ্ডল (Ankush Mondal)। আমার AI প্রযুক্তি Google Gemini দ্বারা চালিত।",

      model: CHAT_MODEL

    });

  }


  try {

    const reply =
      await askGemini(message);


    return res.json({

      reply: reply,

      model: CHAT_MODEL

    });

  }


  catch (error) {

    console.error(
      "Lumora AI error:",
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


// ================================
// START SERVER
// ================================

app.listen(
  PORT,
  () => {

    console.log(
      `Lumora AI Backend running on port ${PORT}`
    );

  }
);
