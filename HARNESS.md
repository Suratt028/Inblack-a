# HARNESS.md — วิธีทำงานของทีม Agent (โจทย์ A)

เอกสารนี้ตอบ 3 คำถามของขั้นที่ 1: **แบ่งงานอย่างไร · กันงานชนอย่างไร · ตัดสินอย่างไรว่ากลยุทธ์ไหนดีกว่า**
กติกาธุรกิจและการตีความที่โจทย์ไม่ระบุ อยู่ใน `CLAUDE.md`, `PLAN.md` §2 และ `harness/DECISIONS_INPUT.md` (D1–D15)

---

## 1. ทีม

| บทบาท | Sub-agent (`.claude/agents/`) | Worktree · Branch | งานหลัก |
|---|---|---|---|
| กลยุทธ์ | `strategy-optimizer` | `harness/worktrees/strategy` · `agent/strategy` | `src/**`, `STRATEGY.md` |
| เครื่องมือ/ตัวคิดคะแนน | `backend-mcp` | `harness/worktrees/backend` · `agent/backend` | `harness/{generator,validator,scorer,score,benchmark}.js`, `harness/{lib,scenarios,benchmarks,reports}/**`, `mcp/**`, `.github/workflows/**`, `package.json` |
| เทสต์ + รีวิว | `qa-reviewer` | `harness/worktrees/qa` · `agent/qa` | `harness/tests/**`, `harness/reviews/**`, `harness/WRONG_CASES.md` — ตีกลับงานได้ |
| ประตูก่อนคอมมิท | `code-reviewer` | อ่านอย่างเดียว | ตรวจ diff + รันเทสต์ทุกขั้น ให้ `VERDICT: PASS/FAIL` |
| คอมมิท | `committer` | `main` | คอมมิทเฉพาะเมื่อได้ PASS |
| Lead (เซสชันหลัก) | — | `main` | แจกงาน, merge, `CLAUDE.md`, `.mcp.json`, `.claude/**`, `plugins/**`, `site/**`, `HARNESS.md`, `README.md`, `AGENT_SETUP.md`, `PLAN.md`, `harness/DECISIONS_INPUT.md`, `AGENT_LOG/**` |
| ผู้ใช้ | — | — | ตัดสินใจ และเขียน `DECISIONS.md` เอง |

ตารางนี้สรุปจาก `PLAN.md` §3 — ถ้าขัดกัน **`PLAN.md` §3 เป็นตัวจริง**
Agent 3 ตัวแรกคือทีมหลักตามโจทย์ แยกคนละ worktree: `strategy-optimizer` (กลยุทธ์), `backend-mcp` (ตัวคิดคะแนน/เครื่องมือ), `qa-reviewer` (เทสต์ + รีวิว) อีก 2 ตัวเป็นประตูตรวจก่อนคอมมิท

## 2. วิธีแบ่งงาน

- งานแต่ละชิ้นคือไฟล์ `harness/tasks/Txx.md` มีตาราง: `id`, `owner`, `files owned`, `dependencies`, `status`, `branch` + เกณฑ์ผ่าน, หลักฐานเทสต์ (ใส่เฉพาะผลรันจริง), ประวัติ
- สถานะ: `planned` → `claimed` → `in_progress` → `review` → `done` หรือ `rejected` (แล้วกลับไป `in_progress`)
- แบ่งตาม **ความเป็นเจ้าของไฟล์** (ตารางข้อ 1 และ `PLAN.md` §3): 1 ไฟล์มีเจ้าของคนเดียว งานที่ต้องแก้ไฟล์ของคนอื่นต้องเปิดเป็น task ใหม่ให้เจ้าของไฟล์
- งานที่ไม่ขึ้นต่อกันปล่อยให้ทำพร้อมกันเป็น "wave" (ดู `PLAN.md` §5) เช่น T02/T03 (backend) ∥ T04 (qa) ∥ T05 (strategy)
- **เทสต์ตามสเปกเขียนแยกจากโค้ด:** qa-reviewer เขียนเทสต์จาก `DECISIONS_INPUT.md` โดยไม่เปิดโค้ด scorer และ planner ห้าม import จาก `harness/` ตัว planner กับ scorer จึงตรวจกันเองได้จริง

## 3. วิธีกันงานชน

1. **จองงาน:** Lead เป็นคนเดียวที่จองบน `main` — ก่อนส่งงานให้ agent, Lead ตั้ง `owner` + `status: claimed` ในไฟล์ task แล้วคอมมิทบน `main` งานที่ `status` ไม่ใช่ `planned` แล้วห้ามแจกซ้ำ จากนั้น agent อัปเดต `in_progress` / `review` / หลักฐานเทสต์ ในไฟล์ task ของตัวเองบน branch ของตัวเอง (เข้ามาตอน merge) และ Lead เปลี่ยน `done` / `rejected` ตอน merge (ตรงกับ `PLAN.md` §3)
2. **แยก worktree:** แต่ละ agent ทำใน `git worktree` + branch ของตัวเอง ไม่แก้ไฟล์บน `main` โดยตรง
3. **ตรวจขอบเขตตอน merge:** Lead รัน `git diff --name-only main...agent/<x>` เทียบกับตารางเจ้าของไฟล์ ถ้าแตะไฟล์นอกขอบเขต = ตีกลับอัตโนมัติ
4. **ประตู merge:** rebase บน `main` → `npm test` ผ่านทั้งหมด → มีบันทึกรีวิวใน `harness/reviews/` → `code-reviewer` PASS → `git merge --no-ff` (เก็บประวัติการทำงานขนานให้เห็นใน `git log --graph`)

## 4. วิธีตัดสินว่ากลยุทธ์ไหนดีกว่า

- รัน `npm run bench` บน seed ชุดเดียวกัน: **ชุดจูน 101–110** และ **ชุด held-out 1–10** (เลข seed ตาม `CLAUDE.md`; การแยกสองชุดตาม D15) — `harness/benchmark.js` จะมาใน T07 ค่า config ของ generator ถูกล็อกด้วย commit hash ตั้งแต่ Checkpoint 2 เพื่อไม่ให้จูนข้อมูลเข้าหา planner
- **เงื่อนไขบังคับ (gate):** ทุก seed ต้องมี duplicates = 0 และ violations = 0 ทั้งตัวตรวจปกติ (half-open) และตัวตรวจเข้มงวด (D10 — planner ต้องเว้นระยะ 1 นาทีจากขอบ shift/outage/วัน) ถ้าไม่ผ่านถือว่าแพ้ ไม่ว่าคะแนนจะเท่าไร
- **ตัววัดหลัก:** median คะแนน% บนชุด held-out สูงกว่าชนะ ถ้าเสมอให้ดูคะแนน% ต่ำสุด รายงานทั้งสองฐาน SLA (`paid` และ `arrive`, D1)
- เปรียบเทียบกับ baseline FCFS (มาก่อนได้ก่อน) เสมอ เป้าคือ median ≥ 65%
- ห้ามแก้ scorer/validator เพื่อให้คะแนนสูงขึ้น การแก้ scorer ต้องมาจาก task ของ backend-mcp ที่ qa-reviewer รีวิวแล้วเท่านั้น

## 5. ขั้นตอนตีกลับ

1. qa-reviewer (หรือ Lead ตอน merge) ให้ verdict `REJECT` พร้อมหลักฐาน (เทสต์ที่พัง, บรรทัดใน diff)
2. เปลี่ยน `status: rejected` ในไฟล์ task + เขียนเหตุผลในส่วนประวัติ + บันทึกใน `harness/reviews/` และ `AGENT_LOG/rejected-work.md`
3. เจ้าของงานแก้บน branch เดิม → ส่งกลับเป็น `review` → รีวิวซ้ำจนผ่าน แล้วจึง merge

## 6. Log

ทุกเหตุการณ์จริงบันทึกใน `AGENT_LOG/` (agent ที่ถูกเรียก, hook ที่บล็อก, งานที่ถูกตีกลับ, ผลเทสต์) ห้ามมี token หรือรหัสผ่านใน log
