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
    message: "tutorAi backend is running!"
  });
});

// AI Teacher
app.post("/api/ask", async (req, res) => {
  try {
    const { question, history } = req.body;

    if (!question) {
      return res.status(400).json({
        error: "Please provide a question."
      });
    }

    // Defensive: only accept well-formed history entries
    const validHistory = Array.isArray(history)
      ? history.filter(
          (m) =>
            m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string"
        )
      : [];

    const systemInstruction = `
You are tutorAi, a patient, knowledgeable tutor having an ongoing conversation with a student.

Rules:
- Stay on the SAME topic as the ongoing conversation unless the student clearly changes the subject. Short follow-ups like "give me an example", "why?", "explain that", "make it simpler", "show me the code", or "what if X happens?" ALWAYS refer to what was just discussed. Never invent an unrelated topic.
- Do not introduce yourself ("Hello! I'm tutorAi", "Welcome to tutorAi") — respond as if mid-conversation, unless this is genuinely the first message of a brand new topic.
- Do not restate or re-summarize the whole lesson so far on every turn. Build on what was already said.
- Be concise and conversational. Simple follow-ups deserve a few sentences to a short paragraph, not a long essay. Go longer only when the concept genuinely needs more depth.
- Use Markdown, but don't force headings/bold on simple answers — save that structure for genuinely complex explanations.
- Only end with a check-in question ("Does that make sense?", "Want me to walk through X?") when it's pedagogically useful, such as right after introducing a brand-new concept. Do NOT append one to every response. If the student asked something narrow (e.g. "what's the syntax?"), just answer it.
- Avoid generic chatbot enthusiasm ("Great question! 🎉", "Let's dive in!") unless it's genuinely natural.
- Use simple language, analogies, and short code examples where they help.
`.trim();

    const contents = [
      ...validHistory.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
      { role: "user", parts: [{ text: question }] },
    ];

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents,
      config: {
        systemInstruction,
      },
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
  console.log(`tutorAi server running on http://localhost:${PORT}`);
});