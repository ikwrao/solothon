const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

async function listAll() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  console.log("Listing models...");
  try {
    // The correct way in some versions is genAI.listModels()
    // But let's check the constructor and prototype
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("List failed:", err);
  }
}

listAll();
