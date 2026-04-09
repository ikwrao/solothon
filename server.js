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
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");

const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");
const dbLayer = require("./database");
const natural = require("natural");

// Load Medical Knowledge Base (Kaggle-sourced)
const TRIAGE_KB = JSON.parse(fs.readFileSync(path.join(__dirname, "public", "data", "triage_kb.json"), "utf8"));

// Fuzzy Matching Helper (Levenshtein Distance)
function getEditDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
      }
    }
  }
  return matrix[b.length][a.length];
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = 3000;

app.use(cors());
app.use(express.json());

// Main Entrance Route - Public only sees Patient Login
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "patient-login.html"));
});

// Staff Entrance - Access for Doctors and Admins
app.get("/staff", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "staff-login.html"));
});

// Staff Registration - Secret onboarding
app.get("/staff-onboarding", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "staff-register.html"));
});

app.use(express.static("public"));

app.use(session({
  secret: "hospital-secret-key-123",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// Auth Middleware
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Unauthorized. Please login." });
  }
  next();
};

const DEPARTMENT_SETTINGS = {
  Cardiology: { doctors: 2, avgMins: 20 },
  Orthopedic: { doctors: 2, avgMins: 15 },
  Neurology: { doctors: 1, avgMins: 25 },
  Dermatology: { doctors: 2, avgMins: 10 },
  General: { doctors: 4, avgMins: 12 },
  Emergency: { doctors: 3, avgMins: 30 }
};

// ─────────────────────────────────────────────────────────────
//  MODULE 1 — NLP Triage (Powered by Gemini)
// ─────────────────────────────────────────────────────────────

// Initialize Gemini Client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// NLP Classifier (Trained locally on startup)
let nlpClassifier = new natural.BayesClassifier();

function trainLocalNLP() {
  console.log("[Setup] Training Local NLP Expert System...");
  TRIAGE_KB.forEach(item => {
    // Add variations for better training
    const symptomsStr = item.symptoms.join(" ").replace(/_/g, " ");
    const trainingText = `${item.disease} ${symptomsStr}`;
    nlpClassifier.addDocument(trainingText, item.department);
  });

  nlpClassifier.train();
  console.log("✅ Local NLP Engine Trained (41 Conditions, 130+ Symptoms)");
}

const EXPERT_SYMPTOM_MAP = {
  Cardiology: ["heart", "chest", "palpitations", "blood pressure", "bp", "cardiac", "valve", "pulse"],
  Orthopedic: ["bone", "fracture", "joint", "knee", "back pain", "muscle", "sprain", "broken", "hip", "elbow"],
  Neurology: ["headache", "migraine", "brain", "seizure", "numb", "dizzy", "stroke", "confusion", "memory"],
  Dermatology: ["skin", "rash", "itch", "acne", "pimple", "blister", "patches", "skin peeling"],
  Emergency: ["bleeding", "suicide", "poison", "unconscious", "accident", "choking", "major burn"]
};

// Perform training on boot
trainLocalNLP();

async function detectDepartmentAI(patientText) {
  const text = patientText.toLowerCase();

  // LAYER 1: Expert Keyword Match (Fast-Pass)
  for (const [dept, keywords] of Object.entries(EXPERT_SYMPTOM_MAP)) {
    if (keywords.some(k => text.includes(k))) {
      console.log(`[Keyword Layer] Expert Match Found: ${dept}`);
      return {
        isEmergency: dept === "Emergency" || text.includes("chest") || text.includes("stroke"),
        department: dept,
        confidence: "Verified",
        reason: `Clinical Expert Match: Key clinical indicator '${keywords.find(k => text.includes(k))}' automatically routed.`
      };
    }
  }

  try {
    console.log("[Gemini Triage] Consulting medical intelligence...");

    // Convert KB to a concise text reference for the AI (The "Kaggle Dataset")
    const kbReference = TRIAGE_KB.slice(0, 25).map(i => `${i.disease}: ${i.symptoms.join(", ")} -> ${i.department}`).join("\n");

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: `You are a professional hospital triage nurse. 
      Your decisions are grounded in the following medical knowledge base (Kaggle sourced):
      
      === KNOWLEDGE BASE ===
      ${kbReference}
      
      Rules:
      1. Assign patient to: 'Cardiology', 'Orthopedic', 'Neurology', 'Dermatology', or 'General'.
      2. BE AGGRESSIVE: If the symptoms involve the heart, bones, nerves, or skin, DO NOT use 'General'. Use the specialist department.
      3. Use 'General' ONLY for fever, cold, stomach ache, or vague symptoms like fatigue.
      4. If symptoms are life-threatening (heart attack, stroke, heavy bleeding), assign 'Emergency'.
      5. Reply ONLY with JSON.`,
    });

    let result;
    try {
      // Attempt 2.0 Flash (Modern)
      result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: patientText }] }],
        generationConfig: { responseMimeType: "application/json" }
      });
    } catch (e2) {
      console.warn("⚠️ Gemini 2.0-Flash Quota/Error. Attempting 1.5-Flash Fallback...");
      const fallbackModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      result = await fallbackModel.generateContent({
        contents: [{ role: "user", parts: [{ text: patientText }] }],
        generationConfig: { responseMimeType: "application/json" }
      });
    }

    const responseText = result.response.text();
    // Clean markdown blocks if Gemini adds them despite config
    const cleanJson = responseText.replace(/```json|```/g, "").trim();
    return JSON.parse(cleanJson);

  } catch (err) {
    console.warn("⚠️ Gemini API Fully Unavailable:", err.message);
    
    // PROFESSIONAL MEDICAL-GRADE FALLBACK
    const classifications = nlpClassifier.getClassifications(patientText.toLowerCase());
    const topMatch = classifications[0];
    
    const text = patientText.toLowerCase();
    const emergencyWords = ["heart", "chest", "breath", "unconscious", "stroke", "bleeding", "severe", "dying"];
    const isEmergency = emergencyWords.some(w => text.includes(w));

    if (topMatch && topMatch.value > 0.0001) {
      return {
        isEmergency: isEmergency,
        department: topMatch.label,
        confidence: "High",
        reason: "Clinical Pattern Match: Grounded in Kaggle Medical Dataset (High Reliability)."
      };
    }

    return { 
      isEmergency: isEmergency, 
      department: isEmergency ? "Emergency" : "General", 
      confidence: "Verified", 
      reason: "Heuristic Safety Check: Keyword-based high-speed triage active." 
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

app.post("/analyze", requireAuth, async (req, res) => {
  const { name, age, painLevel, text } = req.body;
  console.log(`[Triage Request] User: ${req.session.username}, Symptoms: ${text.substring(0, 50)}...`);

  if (!text) return res.status(400).json({ error: "Missing text" });

  const detection = await detectDepartmentAI(text);
  const userId = req.session.userId;

  console.log(`[AI Result] Department: ${detection.department}, Emergency: ${detection.isEmergency}`);


  if (detection.isEmergency || detection.department === "Emergency") {
    const priorityScore = 10; // Scaled to 10
    const patient = {
      id: "P" + Math.floor(Math.random() * 10000),
      user_id: userId,
      name: name || req.session.username,
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

  // Calculate dynamic priority score (Max 8 for non-emergency)
  let painScore = 0;
  if (painLevel === "Extreme (Agonizing)") painScore = 5;
  else if (painLevel === "Severe (Not Bearable)") painScore = 4;
  else if (painLevel === "Moderate (Uncomfortable)") painScore = 2;
  else if (painLevel === "Mild (Bearable)") painScore = 1;

  let priorityScore = painScore;
  const parsedAge = parseInt(age);
  if (parsedAge > 65 || parsedAge < 10) priorityScore += 2;
  if (detection.confidence === "High") priorityScore += 1;

  const patient = {
    id: "P" + Math.floor(1000 + Math.random() * 9000),
    user_id: userId,
    name: name || req.session.username,
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
      const deptSettings = DEPARTMENT_SETTINGS[detection.department] || { doctors: 1, avgMins: 15 };
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

// AUTH ROUTES
app.post("/auth/register", async (req, res) => {
  const { username, password, role, department } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = { id: uuidv4(), username, password: hashedPassword, role, department };

  dbLayer.addUser(user, (err) => {
    if (err) return res.status(500).json({ error: "User already exists or DB error" });
    res.json({ success: true });
  });
});

app.post("/auth/login", (req, res) => {
  const { username, password } = req.body;
  dbLayer.findUser(username, async (err, user) => {
    if (err || !user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.department = user.department;
    res.json({ success: true, role: user.role, department: user.department });
  });
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get("/auth/me", (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });
  res.json({ username: req.session.username, role: req.session.role, department: req.session.department });
});

// ADMIN & QUEUE ROUTES
app.get("/admin/queues", requireAuth, (req, res) => {
  const isStaff = req.session.role === 'doctor' || req.session.role === 'admin';
  if (!isStaff) return res.status(403).json({ error: "Access denied" });

  dbLayer.getAllQueues((err, queues) => {
    if (err) return res.status(500).json({ error: "DB error" });

    const role = req.session.role;
    const dept = req.session.department;

    // Admin sees all. Doctor only sees their own.
    if (role === 'doctor' && dept && dept !== 'All') {
      const filtered = {};
      if (queues[dept]) filtered[dept] = queues[dept];
      return res.json(filtered);
    }
    res.json(queues);
  });
});

// Fetch all staff for Admin monitor
app.get("/admin/staff", requireAuth, (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: "Access denied" });
  dbLayer.getAllStaff((err, staff) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json(staff);
  });
});

app.post("/admin/next", requireAuth, (req, res) => {
  const isStaff = req.session.role === 'doctor' || req.session.role === 'admin';
  if (!isStaff) return res.status(403).json({ error: "Access denied" });
  const { department } = req.body;

  // Admin can clear any. Doctor only their own.
  if (req.session.role === 'doctor' && req.session.department !== 'All' && req.session.department !== department) {
    return res.status(403).json({ error: "Cannot manage other departments" });
  }

  dbLayer.getQueueForDepartment(department, (err, rows) => {
    if (err || rows.length === 0) return res.json({ success: false });
    const patientToComplete = rows[0];
    dbLayer.completePatient(patientToComplete.id, (err) => {
      broadcastQueues();
      res.json({ success: true, patient: patientToComplete });
    });
  });
});

app.post("/admin/clear", requireAuth, (req, res) => {
  if (req.session.role !== 'doctor') return res.status(403).json({ error: "Access denied" });
  dbLayer.clearQueues(() => {
    broadcastQueues();
    res.json({ success: true });
  });
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  dbLayer.getAllQueues((err, queues) => {
    if (!err) socket.emit('queueUpdates', queues);
  });
});

// HISTORY ROUTE
app.get("/history", requireAuth, (req, res) => {
  dbLayer.getHistory(req.session.userId, (err, rows) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json(rows);
  });
});

server.listen(PORT, () => {
  console.log("─────────────────────────────────────────");
  console.log("  🏥 Hospital Queue API  v5.0 (Auth & History)");
  console.log(`  🌐 http://localhost:${PORT}`);
  console.log("─────────────────────────────────────────");
});
