const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({limit:"1mb"}));

app.get("/", (req,res) => {
  res.json({name:"Lumora AI Backend", status:"online"});
});

app.post("/chat", async (req,res) => {
  const message = String(req.body?.message || "").trim();
  if (!message) return res.status(400).json({error:"Message is required."});

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({error:"OPENAI_API_KEY is not configured on the server."});

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${apiKey}`
      },
      body:JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
        input: message
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("OpenAI API error:", data);
      return res.status(response.status).json({
        error: data?.error?.message || "OpenAI request failed."
      });
    }

    const reply = data.output_text ||
      (Array.isArray(data.output)
        ? data.output.flatMap(x => Array.isArray(x.content) ? x.content : [])
            .filter(x => x.type === "output_text")
            .map(x => x.text).join("")
        : "");

    res.json({reply: reply || "I received the request but no text response was returned."});
  } catch (err) {
    console.error(err);
    res.status(500).json({error:"Unable to reach OpenAI from the backend."});
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Lumora AI Backend running on port ${PORT}`));
