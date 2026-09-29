const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;

// ================================
// GEMINI SETTINGS
// ================================

const CHAT_MODEL = "gemini-3.5-flash-lite";
const IMAGE_MODEL = "gemini-3.1-flash-image";

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
    chatModel: CHAT_MODEL,
    imageModel: IMAGE_MODEL
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
// CHAT WITH GEMINI
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


  if (!response.ok) {

    const error = new Error(
      data?.error?.message ||
      `Gemini API error: ${response.status}`
    );

    error.status = response.status;

    throw error;
  }


  const answer =
    data?.output_text;


  if (
    typeof answer !== "string" ||
    !answer.trim()
  ) {

    throw new Error(
      "Gemini returned an empty response."
    );
  }


  return answer.trim();
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
// IMAGE GENERATION
// ================================

app.post(
  "/generate-image",
  async (req, res) => {

    const prompt =
      String(req.body?.prompt || "").trim();


    if (!prompt) {

      return res.status(400).json({
        error: "Image prompt is required."
      });

    }


    if (!process.env.GEMINI_API_KEY) {

      return res.status(500).json({
        error:
          "GEMINI_API_KEY is not configured on the server."
      });

    }


    try {

      const requestBody = {

        model: IMAGE_MODEL,

        input: prompt,

        response_format: {

          type: "image",

          mime_type: "image/png",

          aspect_ratio: "1:1",

          image_size: "1K"

        },

        store: false

      };


      const response =
        await fetch(
          GEMINI_API_URL,
          {
            method: "POST",

            headers: {

              "Content-Type":
                "application/json",

              "x-goog-api-key":
                process.env.GEMINI_API_KEY

            },

            body:
              JSON.stringify(requestBody)

          }
        );


      const data =
        await response.json();


      if (!response.ok) {

        const error = new Error(
          data?.error?.message ||
          `Image API error: ${response.status}`
        );

        error.status =
          response.status;

        throw error;

      }


      const image =
        data?.output_image;


      if (!image?.data) {

        throw new Error(
          "The image model returned no image."
        );

      }


      const mime =
        image.mime_type ||
        "image/png";


      return res.json({

        image:
          `data:${mime};base64,${image.data}`,

        model: IMAGE_MODEL

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

  }
);


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
