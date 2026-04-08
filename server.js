// ============================================================
//   Hospital Queue & Department Prediction System  v4.0
//   Improvements:
//     - Gemini API (gemini-2.5-flash) for AI Triage
//     - SQLite Database for backend persistence
//     - Real-Time Wait Times via WebSockets (Socket.io)
// ============================================================

require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const { GoogleGenerativeAI } = require("@google/generative-ai");

const dbLayer = require("./database");

const app  = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const DEPARTMENT_SETTINGS = {
  Cardiology:   { doctors: 2, avgMins: 20 },
  Orthopedic:   { doctors: 2, avgMins: 15 },
  Neurology:    { doctors: 1, avgMins: 25 },
  Dermatology:  { doctors: 2, avgMins: 10 },
  General:      { doctors: 4, avgMins: 12 },
  Emergency:    { doctors: 3, avgMins: 30 }
};

// ─────────────────────────────────────────────────────────────
//  MODULE 1 — NLP Triage (Powered by Gemini)
// ─────────────────────────────────────────────────────────────

// Initialize Gemini Client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function detectDepartmentAI(patientText) {
  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      systemInstruction: "You are a hospital triage AI. Your job is to assign the patient to one of these departments based on their complaint: 'Cardiology', 'Orthopedic', 'Neurology', 'Dermatology', 'Emergency', or 'General'. A heart attack, severe bleeding, or stroke should go to 'Emergency'. Provide a short reason and a confidence level ('High', 'Medium', 'Low').",
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: patientText }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            isEmergency: { type: "boolean" },
            department: { type: "string" },
            confidence: { type: "string" },
            reason: { type: "string" }
          },
          required: ["isEmergency", "department", "confidence", "reason"]
        }
      }
    });
    
    const responseText = result.response.text();
    return JSON.parse(responseText);
  } catch (err) {
    console.error("Gemini API Error details:", err);
    // Fallback in case of API failure
    return { 
      isEmergency: false, 
      department: "General", 
      confidence: "Low", 
      reason: "API Fallback (System Error)" 
    };
  }
}

// ─────────────────────────────────────────────────────────────
//  ROUTES
// ─────────────────────────────────────────────────────────────

function broadcastQueues() {
  dbLayer.getAllQueues((err, queues) => {
    if (!err) io.emit('queueUpdates', queues);
  });
}

// Ensure at startup queues are cleared for clean hackathon demo
dbLayer.clearQueues(() => console.log('Queues cleared on startup.'));

app.post("/analyze", async (req, res) => {
  const { name, age, painLevel, text } = req.body;
  if (!text) return res.status(400).json({ error: "Missing text" });

  const detection = await detectDepartmentAI(text);

  if (detection.isEmergency || detection.department === "Emergency") {
    const priorityScore = 1000;
    const patient = {
      id: "P" + Math.floor(Math.random()*10000),
      name: name || "Anonymous",
      age: parseInt(age) || 0,
      painLevel: painLevel || "Extreme (Agonizing)",
      complaint: text,
      department: "Emergency",
      priorityScore: priorityScore,
      createdAt: Date.now()
    };
    
    dbLayer.addPatient(patient, (err) => {
      if (!err) broadcastQueues();
      return res.status(200).json({
        priority: "🚨 Emergency",
        department: "Emergency",
        patientId: patient.id,
        severityScore: priorityScore,
        reason: detection.reason
      });
    });
    return;
  }

  // Calculate dynamic priority score
  let painScore = 0;
  if (painLevel === "Extreme (Agonizing)") painScore = 10;
  else if (painLevel === "Severe (Not Bearable)") painScore = 8;
  else if (painLevel === "Moderate (Uncomfortable)") painScore = 5;
  else if (painLevel === "Mild (Bearable)") painScore = 2;

  let priorityScore = painScore * 2;
  const parsedAge = parseInt(age);
  if (parsedAge > 65) priorityScore += 10;
  if (parsedAge < 10) priorityScore += 10;
  if (detection.confidence === "High") priorityScore += 5;

  const patient = {
    id: "P" + Math.floor(1000 + Math.random()*9000),
    name: name || "Anonymous",
    age: parsedAge || 0,
    painLevel: painLevel || "Unknown",
    complaint: text,
    department: detection.department || "General",
    priorityScore: priorityScore,
    createdAt: Date.now()
  };

  dbLayer.addPatient(patient, (err) => {
    if (err) return res.status(500).json({ error: "DB Error" });
    
    broadcastQueues();

    dbLayer.getQueueForDepartment(detection.department, (err, rows) => {
      const dbRows = rows || [];
      const position = dbRows.findIndex(r => r.id === patient.id) + 1;
      const deptSettings = DEPARTMENT_SETTINGS[detection.department] || {doctors: 1, avgMins: 15};
      const waitTime = Math.ceil(((position === 0 ? 1 : position) / deptSettings.doctors) * deptSettings.avgMins);

      res.status(200).json({
        department: detection.department,
        confidence: detection.confidence,
        reason: detection.reason,
        waitTime: Math.max(1, waitTime),
        yourPosition: position === 0 ? 1 : position,
        patientsInQueue: dbRows.length,
        patientId: patient.id,
        priorityScore: priorityScore,
        avgMins: deptSettings.avgMins,
        doctors: deptSettings.doctors
      });
    });
  });
});

app.get("/admin/queues", (req, res) => {
  dbLayer.getAllQueues((err, queues) => {
    if(err) return res.status(500).json({error: "DB error"});
    res.json(queues);
  });
});

app.post("/admin/next", (req, res) => {
    const { department } = req.body;
    dbLayer.getQueueForDepartment(department, (err, rows) => {
        if(err || rows.length === 0) return res.json({ success: false });
        const patientToComplete = rows[0];
        dbLayer.completePatient(patientToComplete.id, (err) => {
            broadcastQueues();
            res.json({ success: true, patient: patientToComplete });
        });
    });
});

app.post("/admin/clear", (req, res) => {
  dbLayer.clearQueues(() => {
    broadcastQueues();
    res.json({success:true});
  });
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  dbLayer.getAllQueues((err, queues) => {
    if(!err) socket.emit('queueUpdates', queues);
  });
});

server.listen(PORT, () => {
  console.log("─────────────────────────────────────────");
  console.log("  🏥 Hospital Queue API  v4.0 (Gemini AI)");
  console.log(`  🌐 http://localhost:${PORT}`);
  console.log("─────────────────────────────────────────");
});
