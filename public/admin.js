document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("departmentsContainer");
  const clearBtn = document.getElementById("clearAllBtn");
  const userWelcome = document.getElementById("userWelcome");
  const logoutBtn = document.getElementById("logoutBtn");
  const socket = io();

  let userDept = 'All';
  let userRole = 'doctor';

  const DEPARTMENTS = ["Cardiology", "Orthopedic", "Neurology", "Dermatology", "General", "Emergency"];

  // Auth check
  async function checkAuth() {
    const res = await fetch('/auth/me');
    if (res.status !== 200) {
      window.location.href = 'staff-login.html';
      return;
    }
    const user = await res.json();
    if (user.role !== 'doctor' && user.role !== 'admin') {
      window.location.href = 'index.html';
      return;
    }
    
    userWelcome.textContent = `Hello, ${user.role === 'admin' ? 'Admin' : 'Dr.'} ${user.username}`;
    userDept = user.department;
    userRole = user.role;

    if (userRole === 'admin') {
        const staffSec = document.getElementById("staffSection");
        if(staffSec) staffSec.classList.remove("hidden");
        loadStaffRoster();
    }

    renderSkeleton();
  }

  checkAuth();

  logoutBtn.addEventListener('click', async () => {
    await fetch('/auth/logout', { method: 'POST' });
    window.location.href = 'staff-login.html';
  });

  // Render Skeleton
  function renderSkeleton() {
    container.innerHTML = "";
    DEPARTMENTS.forEach(dept => {
      // Admin sees everything. Doctor only sees their own.
      if (userRole !== 'admin' && userDept !== 'All' && userDept !== dept) return;
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
      if (userRole !== 'admin' && userDept !== 'All' && userDept !== dept) return;
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

  async function loadStaffRoster() {
    try {
      const res = await fetch('/admin/staff');
      const staff = await res.json();
      const listEl = document.getElementById('staffList');
      if (listEl) {
        listEl.innerHTML = staff.map(s => `
          <div class="staff-pill ${s.role}">
            <div class="staff-info">
              <strong>${s.username}</strong>
              <span>${s.department}</span>
            </div>
            <span class="role-tag">${s.role}</span>
          </div>
        `).join("");
      }
    } catch (err) { console.error(err); }
  }

  renderSkeleton();
});
