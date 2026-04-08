document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("departmentsContainer");
  const clearBtn = document.getElementById("clearAllBtn");
  const socket = io();

  const DEPARTMENTS = ["Cardiology", "Orthopedic", "Neurology", "Dermatology", "General", "Emergency"];

  // Render Skeleton
  function renderSkeleton() {
    container.innerHTML = "";
    DEPARTMENTS.forEach(dept => {
      const card = document.createElement("div");
      card.className = "dept-card";
      card.id = `dept-${dept}`;
      
      card.innerHTML = `
        <div class="dept-header">
          <span class="dept-name">${dept}</span>
          <span class="queue-count" id="count-${dept}">0 waiting</span>
        </div>
        <div class="patient-list" id="list-${dept}">
          <p style="color: grey; text-align: center; margin-top: 20px;">Empty</p>
        </div>
        <button class="next-btn" id="btn-${dept}" disabled onclick="callNext('${dept}')">Call Next Patient</button>
      `;
      container.appendChild(card);
    });
  }

  window.callNext = async (department) => {
    try {
      const res = await fetch("/admin/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department })
      });
      const data = await res.json();
      if(!data.success) alert("Failed to call next patient.");
    } catch(err) {
      console.error(err);
    }
  };

  clearBtn.addEventListener("click", async () => {
      if(confirm("Are you sure you want to clear ALL queues?")) {
        await fetch("/admin/clear", { method: "POST" });
      }
  });

  socket.on('queueUpdates', (queues) => {
    DEPARTMENTS.forEach(dept => {
      const waitList = queues[dept] || [];
      const listEl = document.getElementById(`list-${dept}`);
      const countEl = document.getElementById(`count-${dept}`);
      const btnEl = document.getElementById(`btn-${dept}`);

      countEl.textContent = `${waitList.length} waiting`;
      
      if(waitList.length === 0) {
        listEl.innerHTML = `<p style="color: grey; text-align: center; margin-top: 20px;">Empty</p>`;
        btnEl.disabled = true;
      } else {
        btnEl.disabled = false;
        listEl.innerHTML = waitList.map(p => `
          <div class="patient-card ${p.department === 'Emergency' ? 'emergency' : ''}">
            <div class="p-header">
              <span class="p-id">${p.id}</span>
              <span class="p-score">Score: ${p.priorityScore}</span>
            </div>
            <div class="p-name">${p.name} (Age: ${p.age || '?'})</div>
            <div class="p-details">Pain: ${p.painLevel || 0}/10</div>
          </div>
        `).join("");
      }
    });
  });

  renderSkeleton();
});
