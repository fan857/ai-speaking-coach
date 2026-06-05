import cors from "cors";
import express from "express";

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/api/health", (request, response) => {
  response.json({
    status: "ok",
    service: "ai-speaking-coach-backend",
    timestamp: new Date().toISOString()
  });
});

app.listen(port, () => {
  console.log(`AI Speaking Coach backend is running on http://localhost:${port}`);
});
