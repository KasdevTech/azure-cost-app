# Azure Cost Management App (FastAPI + React)

## 🔧 Backend Setup

1. Navigate to `backend/`
2. Copy `.env.example` to `.env` and fill in your Azure credentials.
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Run FastAPI:
   ```bash
   uvicorn main:app --reload
   ```

## 🌐 Frontend Setup

1. Navigate to `frontend/`
2. Install Node modules:
   ```bash
   npm install
   ```
3. Start React:
   ```bash
   npm start
   ```

React app runs on port 3000 and FastAPI on 8000.

Make sure CORS is configured properly.
# azure-cost-app
