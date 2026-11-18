# AGENT_SETUP — ตั้งค่าและรันทีม Agent (โจทย์ A)

เอกสารนี้บอกวิธีตั้งค่าเครื่องมือ agent ทั้งหมดที่ใช้ในงานนี้ ให้คนอื่นทำซ้ำได้: sub-agent, git worktree, skill, plugin (Stop hook), MCP server และขั้นตอนตรวจก่อนคอมมิท
กติกาการทำงานของทีมอยู่ใน [`HARNESS.md`](HARNESS.md) · คำสั่งถาวรสำหรับ agent อยู่ใน [`CLAUDE.md`](CLAUDE.md)

## สรุป: เครื่องมือ AI ที่ใช้ และตำแหน่งของแต่ละส่วน

| ส่วน | ตำแหน่ง | รายละเอียด |
|---|---|---|
| **เครื่องมือ AI** | Claude Code (desktop app + CLI `claude -p` สำหรับเดโม hook/MCP) | ข้อ 1 |
| **Sub-agent** (5) | [`.claude/agents/`](.claude/agents/) — `strategy-optimizer.md`, `backend-mcp.md`, `qa-reviewer.md`, `code-reviewer.md`, `committer.md` | ข้อ 2 |
| **Skill** (2) | [`.claude/skills/game-queue-optimization/SKILL.md`](.claude/skills/game-queue-optimization/SKILL.md), [`.claude/skills/game-queue-quality-check/SKILL.md`](.claude/skills/game-queue-quality-check/SKILL.md) | ข้อ 5 |
| **Plugin** (Stop hook) | [`plugins/inblack-guard/`](plugins/inblack-guard/) — manifest `.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/run-tests.js` · marketplace [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json) · เปิดใช้ใน [`.claude/settings.json`](.claude/settings.json) | ข้อ 6 |
| **MCP server** | [`mcp/server.js`](mcp/server.js) (Streamable HTTP, `http://localhost:3000/mcp`, `npm run mcp`) · ลงทะเบียนใน [`.mcp.json`](.mcp.json) · เทสต์ [`mcp/test/mcp.test.js`](mcp/test/mcp.test.js) | ข้อ 7 |
| **Tools** (MCP, 3) | [`mcp/tools/run_scenario.js`](mcp/tools/run_scenario.js), [`mcp/tools/score_plan.js`](mcp/tools/score_plan.js), [`mcp/tools/explain_order.js`](mcp/tools/explain_order.js) (ส่วนกลาง: [`mcp/tools/common.js`](mcp/tools/common.js)) | ข้อ 7 |
| **API** (GitHub REST) | [`harness/reports/build-site-data.js`](harness/reports/build-site-data.js) เรียก `GET /repos/{owner}/{repo}/actions/workflows/{file}/runs` และ `/actions/runs/{id}/artifacts` · รันใน [`.github/workflows/pages.yml`](.github/workflows/pages.yml) ด้วย `GITHUB_TOKEN` | ข้อ 8 |
| **Log** | [`AGENT_LOG/`](AGENT_LOG/) | ข้อ 9 |

## 1. สิ่งที่ต้องมี

- Node.js 20 ขึ้นไป · Git · [Claude Code](https://claude.com/claude-code) (CLI หรือ desktop app) ที่ล็อกอินแล้ว
- clone repo แล้วเปิด Claude Code ที่ root ของ repo จากนั้น `npm ci`
- **Windows:** เครื่องมือ Bash ของ Claude Code ต้องหา Git Bash เจอ ถ้า Git ไม่ได้ติดตั้งที่ตำแหน่งปกติ ให้ตั้ง `CLAUDE_CODE_GIT_BASH_PATH` เป็น path ของ `bash.exe` ใน `env` ของ `~/.claude/settings.json` แล้วปิดเปิดแอปใหม่ (ปัญหานี้เกิดจริงระหว่างทำงาน — ดู `AGENT_LOG/agent-executions.md`)

## 2. Sub-agent (`.claude/agents/`)

Claude Code โหลดไฟล์เหล่านี้อัตโนมัติเมื่อเปิดเซสชันใน repo (frontmatter: `name`, `description`, `tools`)

| agent | หน้าที่ | ไฟล์ที่เขียนได้ (PLAN.md §3) |
|---|---|---|
| `strategy-optimizer` | planner และกลยุทธ์ | `src/**`, `STRATEGY.md` |
| `backend-mcp` | generator, validator, scorer, benchmark, MCP, workflow | `harness/{generator,validator,scorer,score,benchmark}.js`, `harness/{lib,scenarios,benchmarks,reports}/**`, `mcp/**`, `.github/workflows/**`, `package.json` |
| `qa-reviewer` | เขียนเทสต์จากสเปก รีวิว และตีกลับงานพร้อมหลักฐาน | `harness/tests/**`, `harness/reviews/**`, `harness/WRONG_CASES.md` |
| `code-reviewer` | ประตูก่อนคอมมิท อ่านอย่างเดียว ตอบ `VERDICT: PASS/FAIL` | — |
| `committer` | คอมมิทเฉพาะเมื่อได้ PASS, push เฉพาะเมื่อผู้ใช้สั่ง | — |

Lead (เซสชันหลัก) เป็นเจ้าของ `CLAUDE.md`, `.mcp.json`, `.claude/**`, `.claude-plugin/**`, `plugins/**`, `site/**`, `PLAN.md`, `HARNESS.md`, `README.md`, `AGENT_SETUP.md`, `harness/DECISIONS_INPUT.md` และ `AGENT_LOG/**` · ผู้ใช้เขียน `DECISIONS.md` เอง

## 3. Worktree และการจองงาน

แต่ละ agent ทำงานใน worktree และ branch ของตัวเอง (`harness/worktrees/` ถูก ignore) · branch `agent/*` อยู่ในเครื่องเท่านั้น (push แค่ `main`) จึงสร้างใหม่จาก `main`:

```bash
git worktree add -b agent/strategy harness/worktrees/strategy main
```

```bash
git worktree add -b agent/backend harness/worktrees/backend main
```

```bash
git worktree add -b agent/qa harness/worktrees/qa main
```

ก่อนส่งงานรอบใหม่ ให้ branch ตามทัน `main` ก่อน: ใน worktree นั้นรัน `git merge --ff-only main`

1. **จองงาน:** Lead ตั้ง `status: claimed` ใน `harness/tasks/Txx.md` แล้วคอมมิทบน `main` ก่อนส่งงาน
2. **ทำงาน:** agent คอมมิทบน branch ของตัวเอง (`Step: N` + Co-Authored-By, ไม่มี Reviewed-by) และอัปเดตไฟล์ task ของตัวเอง
3. **รีวิว:** `qa-reviewer` เขียนผลใน `harness/reviews/Txx-review.md` — `REJECT` = ส่งกลับให้เจ้าของแก้บน branch เดิม (บันทึกใน `AGENT_LOG/rejected-work.md`)
4. **merge:** ตรวจขอบเขตไฟล์ (`git diff --name-only main...agent/<x>`) → `code-reviewer` PASS บนผลที่ merge แล้ว → `git merge --no-ff` เพื่อให้เห็นงานขนานใน `git log --graph`

## 4. ประตูก่อนคอมมิท (ทุกขั้น)

1. ห้ามคอมมิทขณะ `npm test` ไม่ผ่าน
2. `code-reviewer` ต้องให้ `VERDICT: PASS` (แก้ได้ไม่เกิน 3 รอบ แล้วถามผู้ใช้)
3. `committer` คอมมิทแบบ Conventional Commits พร้อม `Step:` และ `Reviewed-by: code-reviewer (PASS)` · push เฉพาะ `main` เมื่อผู้ใช้สั่ง

## 5. Skill (`.claude/skills/`)

| skill | ใช้เมื่อ |
|---|---|
| `game-queue-optimization` | ปรับ planner ให้ได้คะแนนสูงขึ้น: กติกาที่ห้ามละเมิด, จูนบน seed 101–110 เท่านั้น, ทีละไอเดีย |
| `game-queue-quality-check` | ตรวจก่อนรีวิว/merge: เทสต์, ขอบเขต import, ทุก seed × ทั้งสองฐาน × ตัวตรวจปกติ/strict, รายงานแบบ `QUALITY: PASS/FAIL` |

Claude Code โหลด skill ในโฟลเดอร์นี้เองเมื่อเปิดเซสชัน · หลักฐานการใช้จริง: `AGENT_LOG/hook-events.md`

## 6. Plugin `inblack-guard` (Stop hook)

`plugins/inblack-guard/` มี manifest (`.claude-plugin/plugin.json`) และ `hooks/hooks.json` ที่เรียก `hooks/run-tests.js` ตอน agent จะจบงาน (event `Stop`):
รัน `npm test` → ถ้าไม่ผ่าน เขียนบันทึกลง `AGENT_LOG/hook-events.md`, แจ้งเหตุผลกลับไปที่ agent และ exit 2 เพื่อไม่ให้จบงาน

`.claude/settings.json` ประกาศ marketplace ในเครื่อง (`.claude-plugin/marketplace.json`, path `./`) และเปิด `inblack-guard@inblack` ไว้แล้ว — ถ้า Claude Code ยังไม่เห็น plugin ให้รัน:

```bash
claude plugin marketplace add ./ --scope project
```

```bash
claude plugin install inblack-guard@inblack --scope project
```

```bash
claude plugin list
```

(ต้องเห็น `inblack-guard@inblack` · `Status: ✔ enabled` แล้วเปิดเซสชันใหม่) · หลักฐานที่ hook หยุดงานจริง: `AGENT_LOG/hook-events.md`

## 7. MCP server

`npm run mcp` เปิด server (official `@modelcontextprotocol/sdk`, Streamable HTTP) ที่ `http://localhost:3000/mcp` · `.mcp.json` ลงทะเบียนไว้ในชื่อ `inblack-queue` และ `.claude/settings.json` เปิด `enableAllProjectMcpServers`

```bash
npm run mcp
```

```bash
claude mcp list
```

(ต้องเห็น `inblack-queue … ✔ Connected` — ต้องเปิด server ไว้ก่อนเริ่มเซสชัน)

| tool | input หลัก | ได้อะไร |
|---|---|---|
| `run_scenario` | `seed` หรือ `scenario` / `scenario_path`, `strategy`, `sla_basis`, `strict` | รัน planner + scorer: คะแนน %, counts, ออเดอร์ที่เสียคะแนนมากสุด |
| `score_plan` | scenario + `plan` / `plan_path` | คะแนนของแผนที่ส่งมา + รายการผิดกติกา |
| `explain_order` | scenario, `order_id`, (`plan`) | สถานะ, supplier, เวลา, deadline, ค่าปรับ และเหตุผลของออเดอร์นั้น |

ทุก call เขียน log หนึ่งบรรทัด (JSON) ไปที่ stderr · เทสต์ด้วย client จริง: `mcp/test/mcp.test.js` (initialize, ping, tools/list, tools/call) · หลักฐาน agent เรียกจริง: `AGENT_LOG/mcp-calls.md`

## 8. GitHub Actions และเว็บ

`.github/workflows/pages.yml` รันเมื่อ push `main`: `npm test` → secret scan → `benchmark.js` → `build-site-data.js` (ดึงผล run ก่อนหน้าด้วย GitHub REST API มาทำกราฟ) → deploy GitHub Pages
ต้องเปิด Pages ของ repo แบบ source = GitHub Actions ครั้งเดียว · ใช้ `GITHUB_TOKEN` เท่านั้น ไม่ต้องตั้ง secret เพิ่ม

## 9. Log

ทุกเหตุการณ์จริงบันทึกใน `AGENT_LOG/`: `agent-executions.md` (agent ที่ถูกเรียก), `rejected-work.md`, `hook-events.md`, `mcp-calls.md`, `test-results.md`, `prompts.md` · ห้ามมี token, รหัสผ่าน หรือข้อมูลส่วนตัว
