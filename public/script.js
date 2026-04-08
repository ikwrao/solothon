document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("complaintForm");
  const submitBtn = document.getElementById("submitBtn");
  const btnText = document.querySelector(".btn-text");
  const loader = document.querySelector(".loader");
  
  const formSection = document.getElementById("formSection");
  const resultPanel = document.getElementById("resultPanel");
  const resetBtn = document.getElementById("resetBtn");
  
  const checkinView = document.getElementById("checkinView");
  const rightInsightsPanel = document.getElementById("rightInsightsPanel");

  const emergencyAlert = document.getElementById("emergencyAlert");
  const emergencyTicketId = document.getElementById("emergencyTicketId");
  const standardResult = document.getElementById("standardResult");
  
  // Ticket fields
  const ticketId = document.getElementById("ticketId");
  const deptValue = document.getElementById("deptValue");
  const priorityValue = document.getElementById("priorityValue");
  const waitTimeValue = document.getElementById("waitTimeValue");
  const queuePos = document.getElementById("queuePos");
  const totalQueue = document.getElementById("totalQueue");
  const confidencePill = document.getElementById("confidencePill");
  const reasonText = document.getElementById("reasonText");

  const liveStatsContainer = document.getElementById("liveStatsContainer");

  let currentPatientId = null;
  let currentDepartment = null;
  let currentAvgMins = 15;
  let currentDoctors = 1;

  const DEPT_SETTINGS = {
    Cardiology: { doctors: 2, avg: 20 },
    Orthopedic: { doctors: 2, avg: 15 },
    Neurology: { doctors: 1, avg: 25 },
    Dermatology: { doctors: 2, avg: 10 },
    General: { doctors: 4, avg: 12 },
    Emergency: { doctors: 3, avg: 30 }
  };

  // Initialize Socket.io
  const socket = io();

  socket.on('queueUpdates', (queues) => {
    updateLiveInsights(queues);

    // If the user has an active ticket, update their position
    if (currentPatientId && currentDepartment && standardResult && !standardResult.classList.contains("hidden")) {
      const deptQueue = queues[currentDepartment] || [];
      const pos = deptQueue.findIndex(p => p.id === currentPatientId) + 1;
      
      totalQueue.textContent = `${deptQueue.length}`;

      if (pos > 0) {
        queuePos.textContent = pos;
        const newWaitTime = Math.ceil((pos / currentDoctors) * currentAvgMins);
        waitTimeValue.textContent = `${Math.max(1, newWaitTime)}`;
      } else {
        queuePos.textContent = "CALLED";
        queuePos.style.color = "#10b981";
        waitTimeValue.textContent = "0";
        
        const liveInd = document.querySelector(".live-indicator");
        if (liveInd) {
          liveInd.innerHTML = "✅ READY TO ENTER";
          liveInd.style.color = "#10b981";
        }
      }
    }
  });

  function updateLiveInsights(queues) {
    liveStatsContainer.innerHTML = "";
    const depts = Object.keys(DEPT_SETTINGS);
    depts.forEach(dept => {
      const count = (queues[dept] || []).length;
      const settings = DEPT_SETTINGS[dept];
      const waitTime = Math.ceil((count / settings.doctors) * settings.avg);
      const item = document.createElement("div");
      item.className = "stat-item";
      item.innerHTML = `
        <span class="stat-dept">${dept}</span>
        <span class="stat-time">${waitTime > 0 ? waitTime + 'm wait' : 'No wait'}</span>
      `;
      liveStatsContainer.appendChild(item);
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("patientName").value;
    const age = document.getElementById("patientAge").value;
    const painLevel = document.getElementById("painLevel").value;
    const text = document.getElementById("complaintText").value;
    
    btnText.classList.add("hidden");
    loader.classList.remove("hidden");
    submitBtn.disabled = true;
    
    try {
      const response = await fetch("/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, age, painLevel, text })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Triage failed");
      
      displayResults(data);
      
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      btnText.classList.remove("hidden");
      loader.classList.add("hidden");
      submitBtn.disabled = false;
    }
  });

  function displayResults(data) {
    formSection.classList.add("hidden");
    resultPanel.classList.remove("hidden");
    resultPanel.classList.add("fade-in-up");
    
    currentPatientId = data.patientId;
    currentDepartment = data.department;
    currentAvgMins = data.avgMins || 15;
    currentDoctors = data.doctors || 1;
    
    if (data.priority === "🚨 Emergency" || data.department === "Emergency") {
      emergencyAlert.classList.remove("hidden");
      standardResult.classList.add("hidden");
      emergencyTicketId.textContent = `ID: ${data.patientId}`;
    } else {
      emergencyAlert.classList.add("hidden");
      standardResult.classList.remove("hidden");
      
      ticketId.textContent = data.patientId;
      deptValue.textContent = data.department;
      priorityValue.textContent = data.priorityScore || 0;
      waitTimeValue.textContent = data.waitTime || "0";
      queuePos.textContent = data.yourPosition || "1";
      totalQueue.textContent = data.patientsInQueue || "0";
      
      confidencePill.textContent = `Confidence: ${data.confidence}`;
      confidencePill.className = "pill"; 
      if (data.confidence === "High") confidencePill.classList.add("high");
      else if (data.confidence === "Medium") confidencePill.classList.add("medium");
      else confidencePill.classList.add("low");
      
      reasonText.textContent = data.reason || "";
    }
  }

  resetBtn.addEventListener("click", () => {
    form.reset();
    currentPatientId = null;
    currentDepartment = null;
    
    resultPanel.classList.add("hidden");
    resultPanel.classList.remove("fade-in-up");
    formSection.classList.remove("hidden");
    
    // Reset ticket header
    const liveInd = document.querySelector(".live-indicator");
    if (liveInd) {
      liveInd.innerHTML = "🔴 LIVE Position";
      liveInd.style.color = "#fbbf24";
    }
  });

  // EMERGENCY MODAL LOGIC
  const emergencyModal = document.getElementById("emergencyModal");
  const emergencyTrigger = document.getElementById("emergencyTrigger");
  const closeEmergency = document.getElementById("closeEmergency");
  const acknowledgeBtn = document.getElementById("acknowledgeBtn");

  function openEmergencyModal() {
    emergencyModal.classList.remove("hidden");
    document.body.style.overflow = "hidden"; // Prevent scrolling
  }

  function closeEmergencyModal() {
    emergencyModal.classList.add("hidden");
    document.body.style.overflow = "auto";
  }

  if (emergencyTrigger) emergencyTrigger.addEventListener("click", openEmergencyModal);
  if (closeEmergency) closeEmergency.addEventListener("click", closeEmergencyModal);
  if (acknowledgeBtn) acknowledgeBtn.addEventListener("click", closeEmergencyModal);

  // Close on outside click
  window.addEventListener("click", (e) => {
    if (e.target === emergencyModal) closeEmergencyModal();
  });
});
