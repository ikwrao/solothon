const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function testSchema() {
  console.log("Testing Gemini 2.5 Schema Mode...");
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: "Respond with {'status': 'ok'}" }] }],
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "object",
                properties: {
                    status: { type: "string" }
                },
                required: ["status"]
            }
        }
    });
    console.log("Response:", result.response.text());
  } catch (err) {
    console.error("Schema Mode Failure:", err.message);
  }
}

testSchema();
