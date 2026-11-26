const express = require("express");
const Database = require("better-sqlite3");
const path = require("path");

const SKILLS = ["Mason","Carpenter","Electrician","Plumber","Painter","Farm labour","Driver","Cook / Helper","Loader","Cleaner","Tailor","Welder"];

const app = express();
app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

// ---------- Database ----------
const db = new Database(process.env.DB_PATH || path.join(__dirname, "data.db"));
db.exec(`
CREATE TABLE IF NOT EXISTS jobs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT, skill TEXT, town TEXT, wage INTEGER, job_date TEXT,
  owner TEXT, phone TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS workers(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, phone TEXT, town TEXT, availability_date TEXT, wage INTEGER, skills TEXT,
  created TEXT DEFAULT CURRENT_TIMESTAMP
);
`);
const jobColumns = db.prepare("PRAGMA table_info(jobs)").all();
if (!jobColumns.some(column => column.name === "job_date")) {
  db.exec("ALTER TABLE jobs ADD COLUMN job_date TEXT");
}
const workerColumns = db.prepare("PRAGMA table_info(workers)").all();
if (!workerColumns.some(column => column.name === "availability_date")) {
  db.exec("ALTER TABLE workers ADD COLUMN availability_date TEXT");
}
db.exec(`
CREATE INDEX IF NOT EXISTS idx_jobs_skill_id ON jobs(skill, id DESC);
CREATE INDEX IF NOT EXISTS idx_workers_phone ON workers(phone);
`);
// Demo data on first run only
if (db.prepare("SELECT COUNT(*) c FROM jobs").get().c === 0) {
  const j = db.prepare("INSERT INTO jobs(title,skill,town,wage,job_date,owner,phone) VALUES(?,?,?,?,?,?,?)");
  const today = db.prepare("SELECT date('now', 'localtime') AS today").get().today;
  j.run("Need 2 masons for wall work","Mason","Puttur",800,today,"R. Shetty","9800000001");
  j.run("Arecanut harvesting help","Farm labour","Sullia",600,today,"K. Gowda","9800000002");
  j.run("House painting, 2 rooms","Painter","Puttur",700,today,"S. Rao","9800000003");
  const w = db.prepare("INSERT INTO workers(name,phone,town,availability_date,wage,skills) VALUES(?,?,?,?,?,?)");
  w.run("Ramesh","9700000001","Puttur",today,750,JSON.stringify(["Mason","Loader"]));
  w.run("Lakshmi","9700000002","Sullia",today,550,JSON.stringify(["Farm labour","Cook / Helper"]));
}

// ---------- Helpers ----------
const text = (v, max) => (typeof v === "string" && v.trim().length > 0 && v.trim().length <= max) ? v.trim() : null;
const num = (v, min, max) => (Number.isInteger(+v) && +v >= min && +v <= max) ? +v : null;
const phone = v => (typeof v === "string" && /^[0-9]{10}$/.test(v)) ? v : null;
const date = v => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const parsed = new Date(v + "T00:00:00.000Z");
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== v) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lastDate = new Date(today);
  lastDate.setDate(lastDate.getDate() + 30);
  const localDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return v >= localDate(today) && v <= localDate(lastDate) ? v : null;
};

// ---------- Jobs ----------
app.get("/api/jobs", (req, res) => {
  const skill = String(req.query.skill || ""), town = String(req.query.town || "");
  const rows = db.prepare(`
    SELECT *,
      60 + CASE
        WHEN trim(?) = '' OR lower(town) = lower(trim(?)) THEN 40
        WHEN instr(lower(town), lower(trim(?))) > 0
          OR instr(lower(trim(?)), lower(town)) > 0 THEN 20
        ELSE 0
      END AS score
    FROM jobs
    WHERE (? = '' OR skill = ?)
    ORDER BY score DESC, id DESC
  `).all(town, town, town, town, skill, skill);
  res.json(rows);
});

app.post("/api/jobs", (req, res) => {
  const b = req.body || {};
  const d = {
    title: text(b.title, 60), skill: SKILLS.includes(b.skill) ? b.skill : null,
    town: text(b.town, 40), wage: num(b.wage, 100, 5000), job_date: date(b.job_date),
    owner: text(b.owner, 50), phone: phone(b.phone)
  };
  const bad = Object.keys(d).find(k => d[k] === null);
  if (bad) return res.status(400).json({ error: "Please check the field: " + bad });
  db.prepare("INSERT INTO jobs(title,skill,town,wage,job_date,owner,phone) VALUES(?,?,?,?,?,?,?)")
    .run(d.title, d.skill, d.town, d.wage, d.job_date, d.owner, d.phone);
  res.status(201).json({ ok: true });
});

// ---------- Workers ----------
app.get("/api/workers", (req, res) => {
  const skill = String(req.query.skill || ""), town = String(req.query.town || "");
  const availableOn = String(req.query.availableOn || "");
  if (availableOn && !date(availableOn)) {
    return res.status(400).json({ error: "Choose an availability date within the next 30 days." });
  }
  const rows = db.prepare(`
    SELECT workers.*,
      60 + CASE
        WHEN trim(?) = '' OR lower(town) = lower(trim(?)) THEN 40
        WHEN instr(lower(town), lower(trim(?))) > 0
          OR instr(lower(trim(?)), lower(town)) > 0 THEN 20
        ELSE 0
      END AS score
    FROM workers
    WHERE (? = '' OR EXISTS (
      SELECT 1 FROM json_each(workers.skills) AS worker_skill
      WHERE worker_skill.value = ?
    ))
    AND (? = '' OR availability_date <= ?)
    ORDER BY score DESC, id DESC
  `).all(town, town, town, town, skill, skill, availableOn, availableOn)
    .map(row => ({ ...row, skills: JSON.parse(row.skills) }));
  res.json(rows);
});

app.post("/api/workers", (req, res) => {
  const b = req.body || {};
  const skills = Array.isArray(b.skills) ? b.skills.filter(s => SKILLS.includes(s)) : [];
  const d = {
    name: text(b.name, 50), phone: phone(b.phone), town: text(b.town, 40),
    availability_date: date(b.availability_date),
    wage: num(b.wage, 100, 5000), skills: skills.length ? skills : null
  };
  const bad = Object.keys(d).find(k => d[k] === null);
  if (bad) return res.status(400).json({ error: "Please check the field: " + bad });
  const saveWorker = db.transaction(() => {
    const existing = db.prepare("SELECT id FROM workers WHERE phone = ? ORDER BY id DESC LIMIT 1").get(d.phone);
    if (existing) {
      db.prepare("UPDATE workers SET name = ?, town = ?, availability_date = ?, wage = ?, skills = ? WHERE id = ?")
        .run(d.name, d.town, d.availability_date, d.wage, JSON.stringify(d.skills), existing.id);
      return true;
    }
    db.prepare("INSERT INTO workers(name,phone,town,availability_date,wage,skills) VALUES(?,?,?,?,?,?)")
      .run(d.name, d.phone, d.town, d.availability_date, d.wage, JSON.stringify(d.skills));
    return false;
  });
  const updated = saveWorker();
  res.status(updated ? 200 : 201).json({ ok: true, updated });
});

const otpRateLimits = new Map();
const otpRateLimitWindow = 15 * 60 * 1000;
let lastOtpRateLimitCleanup = 0;
function isOtpRateLimited(key, maxRequests) {
  const now = Date.now();
  if (now - lastOtpRateLimitCleanup > otpRateLimitWindow) {
    for (const [entry, limit] of otpRateLimits) {
      if (limit.resetAt <= now) otpRateLimits.delete(entry);
    }
    lastOtpRateLimitCleanup = now;
  }
  let limit = otpRateLimits.get(key);
  if (!limit || limit.resetAt <= now) {
    limit = { count: 0, resetAt: now + otpRateLimitWindow };
    otpRateLimits.set(key, limit);
  }
  if (limit.count >= maxRequests) return true;
  limit.count++;
  return false;
}

function deletionOtpLimited(req, phoneNumber, action) {
  const requestLimit = action === "request" ? 10 : 20;
  const phoneLimit = action === "request" ? 3 : 10;
  return isOtpRateLimited(`${action}:ip:${req.ip}`, requestLimit) ||
    isOtpRateLimited(`${action}:phone:${phoneNumber}`, phoneLimit);
}

function twilioVerifyConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_VERIFY_SERVICE_SID
  );
}

async function callTwilioVerify(endpoint, fields) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${encodeURIComponent(serviceSid)}/${endpoint}`,
    {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams(fields)
    }
  );
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

app.post("/api/workers/delete/request", async (req, res) => {
  const phoneNumber = phone(req.body && req.body.phone);
  if (!phoneNumber) return res.status(400).json({ error: "Enter a valid 10-digit phone number." });
  if (!twilioVerifyConfigured()) {
    return res.status(503).json({ error: "Profile deletion is temporarily unavailable. Please try again later." });
  }
  if (deletionOtpLimited(req, phoneNumber, "request")) {
    return res.status(429).json({ error: "Too many code requests. Please try again later." });
  }

  const countryCode = process.env.PHONE_COUNTRY_CODE || "+91";
  if (!/^\+[1-9][0-9]{0,2}$/.test(countryCode)) {
    console.error("PHONE_COUNTRY_CODE must be a country calling code in +digits format.");
    return res.status(500).json({ error: "Profile deletion is temporarily unavailable." });
  }

  try {
    const { response } = await callTwilioVerify("Verifications", {
      To: `${countryCode}${phoneNumber}`,
      Channel: "sms"
    });
    if (!response.ok) {
      console.error("Twilio Verify could not send a deletion code. HTTP status:", response.status);
      return res.status(502).json({ error: "Could not send a verification code. Check the phone number and try again." });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error("Twilio Verify request failed:", error.message);
    res.status(502).json({ error: "Could not send a verification code. Please try again." });
  }
});

app.post("/api/workers/delete/confirm", async (req, res) => {
  const phoneNumber = phone(req.body && req.body.phone);
  const code = typeof (req.body && req.body.code) === "string" && /^[0-9]{4,10}$/.test(req.body.code)
    ? req.body.code
    : null;
  if (!phoneNumber || !code) {
    return res.status(400).json({ error: "Enter a valid phone number and verification code." });
  }
  if (!twilioVerifyConfigured()) {
    return res.status(503).json({ error: "Profile deletion is temporarily unavailable. Please try again later." });
  }
  if (deletionOtpLimited(req, phoneNumber, "confirm")) {
    return res.status(429).json({ error: "Too many verification attempts. Please try again later." });
  }

  const countryCode = process.env.PHONE_COUNTRY_CODE || "+91";
  if (!/^\+[1-9][0-9]{0,2}$/.test(countryCode)) {
    console.error("PHONE_COUNTRY_CODE must be a country calling code in +digits format.");
    return res.status(500).json({ error: "Profile deletion is temporarily unavailable." });
  }

  try {
    const { response, data } = await callTwilioVerify("VerificationCheck", {
      To: `${countryCode}${phoneNumber}`,
      Code: code
    });
    if (response.status === 400 || response.status === 404 ||
        (response.ok && data.status !== "approved")) {
      return res.status(400).json({ error: "That code is invalid or expired. Request a new code and try again." });
    }
    if (!response.ok) {
      console.error("Twilio Verify could not check a deletion code. HTTP status:", response.status);
      return res.status(502).json({ error: "Could not verify the code. Please try again." });
    }
    const result = db.prepare("DELETE FROM workers WHERE phone = ?").run(phoneNumber);
    if (!result.changes) {
      return res.status(404).json({ error: "No worker profile was found for that phone number." });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error("Twilio Verify check failed:", error.message);
    res.status(502).json({ error: "Could not verify the code. Please try again." });
  }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT);