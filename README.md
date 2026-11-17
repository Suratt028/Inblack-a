# inblack-a — INBLACK GAMING โจทย์ A: ตัวจัดคิวออเดอร์เติมเกม

ระบบตัดสินว่าออเดอร์เติมเกมที่ชำระเงินแล้วตัวไหนจะได้ทำ เริ่มเมื่อไร และใช้ supplier เจ้าไหน เพื่อให้ได้คะแนนตามสูตรของโจทย์สูงที่สุด
งานทั้งหมดสร้างโดยทีม AI agent (Claude Code sub-agents) ภายใต้กติกาใน [`HARNESS.md`](HARNESS.md) และ [`CLAUDE.md`](CLAUDE.md)

**เว็บ:** https://suratt028.github.io/Inblack-a/ — ผลการจัดคิว · replay · ทีม agent (ข้อมูลสร้างโดย GitHub Actions จากการรันจริง)

## ผลลัพธ์

ข้อมูลสุ่ม 10 ชุด (held-out seed 1–10) ชุดละราว 300 ออเดอร์ · ค่ากลางคะแนน % · ที่มา: [`harness/benchmarks/latest.json`](harness/benchmarks/latest.json) (commit `acb18ec`, generator lock `b2a5da2`)

| กลยุทธ์ | ฐาน SLA = paid | ฐาน SLA = arrive | ผิดกติกา / ส่งซ้ำ (ปกติ + strict) |
|---|---|---|---|
| วิธีมาก่อนได้ก่อน (`fcfs`) | 59.16 % | 57.96 % | 0 / 0 |
| **ระบบของเรา (`hybrid`, ค่าเริ่มต้น)** | **73.77 %** | **72.57 %** | **0 / 0 ทุก seed** |

เกณฑ์ของโจทย์: ค่ากลาง ≥ 65 % และไม่มีออเดอร์ซ้ำ / รายการผิดกติกา — ผ่านทั้งสองฐาน SLA
วิธีคิดและ 3 กรณีที่ยังเสียคะแนน: [`STRATEGY.md`](STRATEGY.md)

## เริ่มใช้งาน

ต้องมี Node.js 20 ขึ้นไป

```bash
npm ci
```

```bash
npm test
```

จัดคิว (คำสั่งตามโจทย์) แล้วดูคะแนนและสาเหตุที่เสียคะแนน:

```bash
node src/planner.js harness/scenarios/seed-1.json plan.json
```

```bash
node harness/score.js harness/scenarios/seed-1.json plan.json
```

| คำสั่ง | ทำอะไร |
|---|---|
| `node src/planner.js scenario.json plan.json [--strategy fcfs\|hybrid\|…] [--explain reasons.json]` | สร้าง `plan.json` (ค่าเริ่มต้น `hybrid`; `--strategy fcfs` = baseline) |
| `node harness/score.js scenario.json plan.json [--sla-basis paid\|arrive] [--strict] [--json]` | คะแนน, คะแนน %, กำไร, รายการผิดกติกา และ 10 ออเดอร์ที่เสียคะแนนมากที่สุด |
| `node harness/generator.js --seed N [--out file]` | สุ่ม scenario แบบกำหนด seed ได้ (config ถูกล็อกที่ commit `b2a5da2`) |
| `npm run bench` | ทุกกลยุทธ์ × seed จูน 101–110 และ held-out 1–10 × ฐาน paid/arrive × ตัวตรวจปกติ/strict → `harness/benchmarks/` |
| `npm run mcp` | MCP server ที่ `http://localhost:3000/mcp` (tool `run_scenario`, `score_plan`, `explain_order`) |
| `node harness/reports/build-site-data.js --out site/data --no-api` | สร้างข้อมูลเว็บในเครื่อง (ใน CI ดึงประวัติ run ผ่าน GitHub REST API) |

## รูปแบบไฟล์ (ตามโจทย์)

`scenario.json`
```json
{ "orders":   [{ "id":"O1", "arrive_minute":10, "paid_minute":12, "game":"rov", "value_thb":430, "vip":false, "sla_minutes":10 }],
  "staff":    [{ "from":480, "to":1020, "count":2 }],
  "suppliers":[{ "id":"S1", "games":["rov"], "wallet_thb":45000, "cost_pct":0.94, "outages":[[300,420]] }] }
```
`plan.json`
```json
{ "assignments": [{ "order_id":"O1", "supplier_id":"S1", "start_minute":12 }] }
```
เวลาเป็นนาทีของวัน 0–1440 · `paid_minute: null` = ยังไม่ชำระ · ข้อที่โจทย์ไม่ระบุ ตีความไว้ใน [`harness/DECISIONS_INPUT.md`](harness/DECISIONS_INPUT.md) (D1–D15)

## โครงสร้าง

```
inblack-a/
├─ src/planner.js            planner + src/strategies/, src/search/, src/model/ (ไม่ import จาก harness/)
├─ harness/                  generator, validator, scorer, score.js, benchmark.js, tests/, tasks/, reviews/, reports/
├─ mcp/                      MCP server (official SDK, Streamable HTTP) + tools + tests
├─ site/                     index.html, replay.html, team.html (ข้อมูลจาก data/*.json ที่ Actions สร้าง)
├─ .github/workflows/        pages.yml — test → secret scan → benchmark → REST API history → deploy Pages
├─ .claude/                  agents/ (5 sub-agent), skills/ (2 skill), settings.json
├─ plugins/inblack-guard/    plugin ที่มี Stop hook — ไม่ให้จบงานเมื่อเทสต์ไม่ผ่าน
├─ HARNESS.md  STRATEGY.md  DECISIONS.md  AGENT_SETUP.md  CLAUDE.md
└─ AGENT_LOG/                เหตุการณ์จริง: agent ที่ถูกเรียก, hook ที่บล็อก, งานที่ถูกตีกลับ, ผลเทสต์, MCP calls
```

## เอกสาร

| ไฟล์ | เนื้อหา |
|---|---|
| [`HARNESS.md`](HARNESS.md) | วิธีแบ่งงาน กันงานชน และตัดสินว่ากลยุทธ์ไหนดีกว่า |
| [`STRATEGY.md`](STRATEGY.md) | กลยุทธ์ `hybrid` เทียบ FCFS และ 3 กรณีที่ยังเสียคะแนน |
| [`DECISIONS.md`](DECISIONS.md) | จุดที่ผู้ใช้ไม่เชื่อ agent (ผู้ใช้เขียนเอง) |
| [`AGENT_SETUP.md`](AGENT_SETUP.md) | วิธีตั้งค่าและรันทีม agent, skill, plugin, MCP |
| [`CLAUDE.md`](CLAUDE.md) | คำสั่งถาวรสำหรับ agent รวม commit gate |
| [`PLAN.md`](PLAN.md) | แผนและตารางความเป็นเจ้าของไฟล์ |
| [`AGENT_LOG/`](AGENT_LOG/) | log จริงทุกขั้น · ตาราง hash เดิม → hash ที่เผยแพร่: [`hash-map.md`](AGENT_LOG/hash-map.md) |

## ความปลอดภัย

repo สาธารณะ: ไม่มี token หรือรหัสผ่านในไฟล์ คอมมิท หรือ log · Actions ใช้ `GITHUB_TOKEN` เท่านั้น (สิทธิ์แยกตาม job) · workflow มี secret scan ที่แสดงเฉพาะชื่อไฟล์
