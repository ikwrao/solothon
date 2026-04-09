const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function testPro() {
  console.log("Testing Gemini 2.5 PRO...");
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
    const result = await model.generateContent("Say 'Pro mode active'");
    console.log("Response:", result.response.text());
  } catch (err) {
    console.error("Pro Mode Failure:", err.message);
  }
}

testPro();
