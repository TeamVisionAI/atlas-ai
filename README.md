# Atlas AI

**AI-powered recruiting platform for Team Vision**

[![Version](https://img.shields.io/badge/version-0.2.0-blue.svg)](https://github.com/TeamVisionAI/atlas-ai)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/express-5.x-lightgrey.svg)](https://expressjs.com/)
[![License](https://img.shields.io/badge/license-ISC-orange.svg)](LICENSE)

---

## Mission

Atlas AI automates and streamlines the recruiting workflow for Team Vision. The platform evaluates candidates against defined business rules, determines next actions, and provides a modular API foundation for future integrations with databases, automation workflows, and a frontend dashboard.

---

## Current Version

**0.2.0** — Sprint 2: Recruiting Engine

---

## Architecture

Atlas AI follows a layered Express.js architecture designed for clarity and extensibility:

```
Client / Integrations
        │
        ▼
   Express Server (server.js)
        │
        ├── Routes        → HTTP endpoint handlers
        ├── Services      → Business logic (recruiting rules)
        └── Middleware    → CORS, JSON parsing
```

| Layer | Responsibility |
|-------|----------------|
| **Routes** | Define API endpoints and request/response handling |
| **Services** | Encapsulate recruiting business rules and evaluation logic |
| **Server** | Application bootstrap, middleware, and route registration |

Future planned layers include database persistence (Supabase), workflow automation (n8n), and a frontend client.

---

## Folder Structure

```
atlas-ai/
├── backend/
│   ├── server.js                 # Application entry point
│   ├── routes/
│   │   ├── health.js             # Health check endpoint
│   │   ├── info.js               # Application metadata endpoint
│   │   └── recruit.js            # Candidate evaluation endpoint
│   └── services/
│       └── recruitingEngine.js   # Recruiting business logic
├── database/                     # Database schemas & migrations (planned)
├── docs/                         # Project documentation (planned)
├── frontend/                     # Web client (planned)
├── n8n/                          # Workflow automation (planned)
├── supabase/                     # Supabase configuration (planned)
├── package.json
└── README.md
```

---

## Current Sprint

### Sprint 2 — Recruiting Engine

Building the core candidate evaluation engine with Team Vision recruiting rules:

- Work authorization qualification (English & Spanish keyword support)
- Interview type determination (In Person vs. Zoom based on city)
- Human review flagging for edge cases
- REST API for candidate evaluation

---

## Completed Features

| Feature | Description | Status |
|---------|-------------|--------|
| Express Backend | Node.js server with CORS and JSON middleware | ✅ Done |
| Health Check | Service uptime and status monitoring | ✅ Done |
| App Info API | Sprint metadata and server timestamp | ✅ Done |
| Recruiting Engine | Work authorization & interview type evaluation | ✅ Done |
| Candidate API | `POST /api/recruit` candidate evaluation endpoint | ✅ Done |

### Recruiting Engine Rules

- **Interview Type** — Candidates in Miami-area cities (Miami, Doral, Hialeah, Homestead, Kendall, Coral Gables, Miami Lakes) are scheduled for **In Person** interviews; all others receive **Zoom** interviews.
- **Work Authorization** — Evaluates candidate work status and returns qualification status, human review flags, and recommended next actions.

---

## Next Sprint

### Sprint 3 — Infrastructure & Integration (Planned)

| Area | Focus |
|------|-------|
| **Database** | Candidate persistence and evaluation history |
| **Supabase** | Backend-as-a-service integration |
| **Frontend** | Recruiter dashboard and candidate management UI |
| **n8n** | Workflow automation for interview scheduling |

---

## How to Run

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- npm

### Installation

```bash
git clone https://github.com/TeamVisionAI/atlas-ai.git
cd atlas-ai
npm install
```

### Environment Variables

Create a `.env` file in the project root (optional):

```env
PORT=3000
```

### Development

Start the server with hot reload:

```bash
npm run dev
```

### Production

```bash
npm start
```

The server runs at **http://localhost:3000** by default.

---

## Available API Endpoints

### `GET /`

Root endpoint — confirms the backend is running.

**Response:**

```json
{
  "app": "Atlas AI",
  "version": "0.1.0",
  "status": "running",
  "message": "🚀 Atlas AI Backend Running"
}
```

---

### `GET /health`

Health check — returns service status and uptime.

**Response:**

```json
{
  "status": "healthy",
  "service": "Atlas AI",
  "uptime": 123.456
}
```

---

### `GET /api/info`

Application metadata — sprint, feature, and environment details.

**Response:**

```json
{
  "app": "Atlas AI",
  "version": "0.2.0",
  "sprint": "Sprint 2",
  "feature": "Recruiting Engine",
  "status": "Running",
  "environment": "Development",
  "timestamp": "2026-07-13T19:06:57.502Z"
}
```

---

### `POST /api/recruit`

Evaluate a candidate against Team Vision recruiting rules.

**Request Body:**

```json
{
  "name": "Jane Doe",
  "city": "Miami",
  "state": "FL",
  "occupation": "Software Engineer",
  "workStatus": "US Citizen"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Candidate full name |
| `city` | string | Candidate city (used for interview type) |
| `state` | string | Candidate state |
| `occupation` | string | Candidate occupation |
| `workStatus` | string | Work authorization status (also accepts `workAuthorization`) |

**Response:**

```json
{
  "success": true,
  "result": {
    "qualified": true,
    "interviewType": "In Person",
    "humanReview": false,
    "reviewReason": null,
    "nextAction": "Schedule Interview",
    "candidate": {
      "name": "Jane Doe",
      "city": "Miami",
      "state": "FL",
      "occupation": "Software Engineer",
      "workStatus": "US Citizen"
    }
  }
}
```

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| Node.js | Runtime |
| Express 5 | HTTP server framework |
| dotenv | Environment variable management |
| cors | Cross-origin resource sharing |
| nodemon | Development hot reload |

---

## Contributing

This project is maintained by [Team Vision AI](https://github.com/TeamVisionAI). For issues and feature requests, please use the [GitHub Issues](https://github.com/TeamVisionAI/atlas-ai/issues) tracker.

---

## License

[ISC](LICENSE)
