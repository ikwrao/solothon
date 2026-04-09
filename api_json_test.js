const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function testJSON() {
  console.log("Testing Gemini 2.5 JSON Mode...");
  try {
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash",
        systemInstruction: "Always answer in JSON format."
    });
    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: "Respond with {'status': 'ok'}" }] }],
        generationConfig: {
            responseMimeType: "application/json"
        }
    });
    console.log("Response:", result.response.text());
  } catch (err) {
    console.error("JSON Mode Failure:", err.message);
  }
}

testJSON();
