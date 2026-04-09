const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function testSimple() {
  console.log("Testing Gemini 2.5 Simple Call...");
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent("Say 'API is Online'");
    console.log("Response:", result.response.text());
  } catch (err) {
    console.error("API Failure:", err.message);
    if (err.status) console.error("Status:", err.status);
    console.error("Stack:", err.stack);
  }
}

testSimple();
