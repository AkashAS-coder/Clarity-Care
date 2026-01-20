const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const OPENROUTER_SITE = process.env.OPENROUTER_SITE || "";
const OPENROUTER_APP = process.env.OPENROUTER_APP || "Health Literacy Translator";

if(!OPENROUTER_API_KEY){
  console.warn("Missing OPENROUTER_API_KEY. Set it in your Koyeb service.");
}

app.post("/translate", async (req, res) => {
  try{
    const { text, audience, tone } = req.body || {};
    if(!text){
      return res.status(400).json({ error: "Missing text" });
    }
    const systemPrompt = "You rewrite medical notes into clear, respectful plain language. Return JSON with keys: simple (string), actions (array of short sentences). Keep medical meaning intact and avoid adding new facts.";
    const userPrompt = `Audience: ${audience || "adult"}\nTone: ${tone || "warm"}\nNote: ${text}`;

    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": OPENROUTER_SITE,
        "X-Title": OPENROUTER_APP
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" }
      })
    });

    if(!response.ok){
      const errorText = await response.text();
      return res.status(500).json({ error: "AI request failed", details: errorText });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    let parsed = {};
    try{
      parsed = JSON.parse(content);
    }catch{
      parsed = { simple: content, actions: [] };
    }

    return res.json({
      simple: String(parsed.simple || "").trim(),
      actions: Array.isArray(parsed.actions) ? parsed.actions : []
    });
  }catch(error){
    return res.status(500).json({ error: "Server error" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
