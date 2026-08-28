const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { GoogleGenAI } = require("@google/genai");

dotenv.config();

const app = express();
const PORT = 5050;

app.use(cors());
app.use(express.json());

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Test route
app.get("/", (req, res) => {
  res.json({
    message: "Study AI backend is running!"
  });
});

// AI Teacher - Streaming Response
app.post("/api/ask", async (req, res) => {
  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({
        error: "Please provide a question."
      });
    }

    const prompt = `
You are Study AI, an intelligent AI teacher.

Your goal is to TEACH the student, not simply give them an answer.

Follow these rules:
1. Explain the concept in simple language.
2. Break difficult concepts into smaller steps.
3. Give a simple example when useful.
4. Avoid unnecessarily complicated terminology.
5. Use Markdown for headings, bullet points, and bold important terms.
6. At the end, ask the student one short question to check their understanding.

Student's question:
${question}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt
    });

    res.json({
      answer: response.text
    });

  } catch (error) {
    console.error("Gemini Error:", error);

    res.status(500).json({
      error: "Failed to get a response from Gemini."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Study AI server running on http://localhost:${PORT}`);
});