# Intelligent Hospital Triage & Queue Management System 🏥

A high-performance, full-stack medical application designed to automate patient check-ins and optimize Outpatient Department (OPD) routing. This system uses a **Locally Hosted NLP Expert System** trained on extensive medical datasets to ensure accurate patient-to-department mapping with zero reliance on external cloud processing for its core logic.

---

## 🌟 Key Features

### 🧠 Pattern-Based Triage Engine
The heart of the system is a locally trained **NLP Expert System**. 
- **Grounding**: Trained on professional medical datasets (Kaggle-sourced) covering **240+ clinical conditions** and **130+ distinct symptoms**.
- **Expert Keyword Mapping**: Features a "Fast-Pass" clinical dictionary for instantaneous routing of critical conditions (Cardiology, Orthopedics, etc.).
- **High Reliability**: Operates entirely within the hospital's local infrastructure, ensuring 100% uptime and data privacy.

### ⏱️ Real-Time Queue Orchestration
- **Live Sync**: Powered by WebSockets to broadcast patient arrivals to the Admin Dashboard in milliseconds.
- **Dynamic ETA**: Automatically calculates wait times based on the number of active medical staff and current department load.
- **Digital Tickets**: Patients receive a unique digital identifier with their live queue position and estimated time of consultation.

### 👩‍⚕️ Admin & Staff Control Center
- **Master Roster**: Real-time visibility of medical staff status.
- **Queue Management**: Efficient "Call Next Patient" workflow for doctors.
- **Patient History**: Persistent tracking of past visits for improved clinical context.

---

## 🏗️ Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Backend** | Node.js, Express.js |
| **Frontend** | Pure HTML5, CSS3 (Inter Clinical Design System), Vanilla JS |
| **Real-Time** | Socket.io |
| **Database** | SQLite (Persistent Storage) |
| **NLP Expert System** | Natural NLP Library (Naive Bayes implementation) |
| **Data Source** | Kaggle Medical Condition-Symptom Repository |

---

## 🚀 Installation & Setup

### Prerequisites
- Node.js (v18.0 or higher)
- npm

### 1. Clone & Install
```bash
git clone <repository-url>
cd solothon
npm install
```

### 2. Run the System
The local NLP engine will automatically train on the clinical datasets upon startup.
```bash
node server.js
```
The application will be live at `http://localhost:3000`.

---

## 📂 Project Structure
- `/server.js` - Main backend logic & expert system orchestration.
- `/public/data/` - Clinical datasets used for NLP grounding.
- `/public/` - Clinical-grade minimalist UI (Inter typography).
- `/database.js` - SQLite persistence layer.

---

## ⚖️ License
This project is developed for hackathon demonstration purposes. 
*Privacy Note: By using a local NLP engine, patient data remains within the local server environment at all times.*
