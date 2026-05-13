const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("de api werkt");
});

app.get("/bikes", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM bikes");
    res.json(rows);
  } catch (error) {
    console.error("DATABASE FOUT:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(3001, () => {
  console.log("Server draait op poort 3001");
});
