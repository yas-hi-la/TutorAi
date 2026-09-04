const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { GoogleGenAI } = require("@google/genai");
const path = require("path");
const { MongoClient, ObjectId } = require("mongodb");

dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = process.env.PORT || 5050;
const MAX_GEMINI_RETRIES = 2;
const GEMINI_RETRY_DELAY_MS = 1000;
const TEMPORARY_ERROR_MESSAGE =
  "TutorAI is temporarily unable to reach the AI service. Please try again in a moment.";
const MONGODB_UNAVAILABLE_MESSAGE =
  "TutorAI is temporarily unable to reach the database. Please try again in a moment.";

const mongoClient = process.env.MONGODB_URI
  ? new MongoClient(process.env.MONGODB_URI)
  : null;
let mongoDatabasePromise;

const getConversationsCollection = async () => {
  if (!mongoClient) {
    throw new Error("MONGODB_URI is not configured.");
  }

  if (!mongoDatabasePromise) {
    mongoDatabasePromise = mongoClient
      .connect()
      .then((client) =>
        client.db(process.env.MONGODB_DB_NAME || "tutorai").collection("conversations")
      )
      .catch((error) => {
        mongoDatabasePromise = undefined;
        throw error;
      });
  }

  return mongoDatabasePromise;
};

const isValidObjectId = (id) => typeof id === "string" && ObjectId.isValid(id);

const toConversationResponse = ({ _id, ...conversation }) => ({
  ...conversation,
  id: _id.toString(),
});

const handleMongoError = (res, error) => {
  console.error("MongoDB Error:", error);
  return res.status(503).json({ error: MONGODB_UNAVAILABLE_MESSAGE });
};

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const isTemporaryUnavailableError = (error) => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error;
  const status = candidate.status ?? candidate.code;
  const message =
    typeof candidate.message === "string" ? candidate.message : "";

  return (
    status === 503 ||
    status === "503" ||
    candidate.code === "UNAVAILABLE" ||
    /503\s+UNAVAILABLE|service unavailable/i.test(message)
  );
};

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
You are tutorAi, a patient, knowledgeable teacher guiding a student through a live conversation.

Core teaching style:
- Teach step by step instead of dumping the whole lesson at once.
- Start with intuition or simple language before formal definitions.
- Explain why something works, not just what it is.
- Build from simple -> intermediate -> advanced.
- Break complex topics into manageable sections.
- Use short paragraphs, brief sections, and concrete examples.
- Keep answers focused: simple questions = a few sentences; normal concepts = a few short sections plus an example; complex topics = staged teaching instead of one giant explanation.
- Continue naturally from recent conversation history and do not repeat things already explained unless the student asks for review or a recap.
- Treat follow-up prompts such as "why?", "give me an example", "explain that", "make it simpler", "what happens if...", "show me the code", and similar as referring to the immediately preceding topic, not a new unrelated topic.
- If the student asks a follow-up without changing the subject, stay in that same discussion and build directly on it.
- Do not re-summarize the whole lesson every turn. Keep the conversation cumulative and connected.

Pedagogy:
- Prefer intuition first, then the formal definition.
- Use small, concrete examples before abstract explanations.
- Explain the underlying mechanism or reasoning behind each idea.
- Use analogies when they clarify a concept.
- Ask a short check-for-understanding question only when it is genuinely useful, such as after introducing a new concept or a key idea. Do not ask after every response.
- Avoid generic enthusiasm or filler phrases such as "Great question!", "Let's dive in!", "Absolutely!", or similar unless the wording is naturally appropriate.

Markdown and formatting:
- Use Markdown appropriately, not as decoration for every answer.
- Use headings for meaningful sections.
- Use bullets for lists and numbered lists for procedures or steps.
- Use code blocks for code examples.
- Use tables for structured/tabular information when they add clarity.
- Keep tables small, readable, and clearly columned with proper headers.
- Use bold only for important terms or labels.
- Avoid huge walls of text; prefer short blocks of explanation separated by structure.

Database and technical topics:
- Prefer examples over abstract explanations.
- For database topics, show real tables when useful.
- For normalization, teach progressively instead of dumping all normal forms at once:
  1. Show a problematic or unorganized table.
  2. Explain what is wrong with it.
  3. Explain redundancy and anomalies.
  4. Introduce 1NF with an example.
  5. Introduce 2NF with an example.
  6. Introduce 3NF with an example.
  7. Explain why each decomposition is being done.
- Do not give a giant one-shot overview of 1NF, 2NF, 3NF, and BCNF unless the student explicitly asks for a complete overview.

Conversation behavior:
- Do not introduce yourself or restate your identity in normal replies.
- Respond as if the session is already underway.
- If the student clearly changes the subject, move to that subject naturally.
- If the student asks a narrow question, answer the specific question directly without extra lecture.
- If the question is broad, teach in short stages rather than one large block.
- Keep the tone patient, clear, and conversational.

Style constraints:
- Use language the student can follow without requiring prior expert knowledge.
- Avoid textbook-only wording and overly formal academic dumps.
- Keep explanations clear, incremental, and grounded in real examples.
- Use concise, well-structured teaching, not a generic chatbot response.
`.trim();

    const contents = [
      ...validHistory.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
      { role: "user", parts: [{ text: question }] },
    ];

    let response;
    for (let attempt = 0; attempt <= MAX_GEMINI_RETRIES; attempt += 1) {
      try {
        response = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents,
          config: {
            systemInstruction,
          },
        });
        break;
      } catch (error) {
        const canRetry =
          isTemporaryUnavailableError(error) && attempt < MAX_GEMINI_RETRIES;
        if (!canRetry) {
          throw error;
        }
        await delay(GEMINI_RETRY_DELAY_MS);
      }
    }

    res.json({
      answer: response.text
    });

  } catch (error) {
    console.error("Gemini Error:", error);

    res.status(500).json({
      error: isTemporaryUnavailableError(error)
        ? TEMPORARY_ERROR_MESSAGE
        : "Failed to get a response from Gemini."
    });
  }
});

app.post("/api/conversations", async (req, res) => {
  try {
    const { title, messages } = req.body;
    if (typeof title !== "string" || !Array.isArray(messages)) {
      return res.status(400).json({
        error: "Please provide a title and messages array.",
      });
    }

    const now = new Date();
    const conversation = {
      title,
      messages,
      createdAt: now,
      updatedAt: now,
    };
    const collection = await getConversationsCollection();
    const result = await collection.insertOne(conversation);

    return res.status(201).json(
      toConversationResponse({
        ...conversation,
        _id: result.insertedId,
      }),
    );
  } catch (error) {
    return handleMongoError(res, error);
  }
});

app.get("/api/conversations", async (req, res) => {
  try {
    const collection = await getConversationsCollection();
    const conversations = await collection
      .find({})
      .sort({ updatedAt: -1 })
      .toArray();
    return res.json(conversations.map(toConversationResponse));
  } catch (error) {
    return handleMongoError(res, error);
  }
});

app.get("/api/conversations/:id", async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid conversation ID." });
  }

  try {
    const collection = await getConversationsCollection();
    const conversation = await collection.findOne({
      _id: new ObjectId(req.params.id),
    });
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found." });
    }
    return res.json(toConversationResponse(conversation));
  } catch (error) {
    return handleMongoError(res, error);
  }
});

app.patch("/api/conversations/:id", async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid conversation ID." });
  }

  const { title, messages } = req.body;
  if (
    (title !== undefined && typeof title !== "string") ||
    (messages !== undefined && !Array.isArray(messages)) ||
    (title === undefined && messages === undefined)
  ) {
    return res.status(400).json({
      error: "Provide a title and/or messages array.",
    });
  }

  try {
    const collection = await getConversationsCollection();
    const update = { $set: { updatedAt: new Date() } };
    if (title !== undefined) {
      update.$set.title = title;
    }
    if (messages !== undefined) {
      update.$push = { messages: { $each: messages } };
    }

    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      update,
      { returnDocument: "after" },
    );
    if (!result) {
      return res.status(404).json({ error: "Conversation not found." });
    }
    return res.json(toConversationResponse(result));
  } catch (error) {
    return handleMongoError(res, error);
  }
});

app.delete("/api/conversations/:id", async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: "Invalid conversation ID." });
  }

  try {
    const collection = await getConversationsCollection();
    const result = await collection.deleteOne({
      _id: new ObjectId(req.params.id),
    });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Conversation not found." });
    }
    return res.status(204).send();
  } catch (error) {
    return handleMongoError(res, error);
  }
});

app.listen(PORT, () => {
  console.log(`tutorAi server running on port ${PORT}`);
});