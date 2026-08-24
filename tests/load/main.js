import http from "k6/http";
import ws from "k6/ws";
import exec from "k6/execution";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import encoding from "k6/encoding";

const BASE_URL = required("BASE_URL").replace(/\/+$/, "");
const ORIGIN = new URL(BASE_URL).origin;
const WS_URL = BASE_URL.replace(/^http/, "ws");
const ADMIN_TOKEN = required("LOAD_TEST_ADMIN_TOKEN");
const SCENARIO = __ENV.SCENARIO || "smoke";

const writeDuration = new Trend("openpbl_write_duration", true);
const websocketDelivery = new Trend("openpbl_websocket_delivery", true);
const consistencyFailures = new Rate("openpbl_consistency_failures");
const duplicateAcks = new Counter("openpbl_duplicate_acks");
const orderedEvents = new Rate("openpbl_ordered_events");

const scenarioProfiles = {
  smoke: {
    students: 5,
    teachers: 1,
    studentExecutor: { executor: "constant-vus", vus: 5, duration: "3m" },
    teacherExecutor: { executor: "constant-vus", vus: 1, duration: "3m" },
  },
  target: {
    students: 80,
    teachers: 3,
    studentExecutor: {
      executor: "ramping-vus",
      startVUs: 5,
      stages: [
        { duration: "10m", target: 80 },
        { duration: "30m", target: 80 },
      ],
      gracefulRampDown: "30s",
    },
    teacherExecutor: { executor: "constant-vus", vus: 3, duration: "40m" },
  },
  stress: {
    students: 120,
    teachers: 3,
    studentExecutor: {
      executor: "ramping-vus",
      startVUs: 80,
      stages: [
        { duration: "10m", target: 100 },
        { duration: "10m", target: 120 },
        { duration: "15m", target: 120 },
        { duration: "5m", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
    teacherExecutor: { executor: "constant-vus", vus: 3, duration: "40m" },
  },
  soak: {
    students: 80,
    teachers: 3,
    studentExecutor: { executor: "constant-vus", vus: 80, duration: "2h" },
    teacherExecutor: { executor: "constant-vus", vus: 3, duration: "2h" },
  },
};

const profile = scenarioProfiles[SCENARIO];
if (!profile) throw new Error(`Unknown SCENARIO: ${SCENARIO}`);

export const options = {
  scenarios: {
    students: {
      ...profile.studentExecutor,
      exec: "studentFlow",
      tags: { role: "student", profile: SCENARIO },
    },
    teachers: {
      ...profile.teacherExecutor,
      exec: "teacherFlow",
      tags: { role: "teacher", profile: SCENARIO },
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.005"],
    "http_req_duration{kind:read}": ["p(95)<300"],
    openpbl_write_duration: ["p(95)<500"],
    openpbl_websocket_delivery: ["p(95)<1000"],
    openpbl_consistency_failures: ["rate==0"],
    openpbl_ordered_events: ["rate==1"],
  },
  tags: {
    testid: `${SCENARIO}-${__ENV.GIT_SHA || "unknown"}`,
    scenario_profile: SCENARIO,
  },
  setupTimeout: "2m",
  teardownTimeout: "2m",
};

export function setup() {
  const runId = uuid();
  const response = http.post(
    `${BASE_URL}/api/load-test/runs`,
    JSON.stringify({
      runId,
      studentCount: profile.students,
      teacherCount: profile.teachers,
    }),
    {
      headers: adminHeaders(),
      tags: { name: "load-test setup", kind: "admin" },
      timeout: "60s",
    },
  );
  if (response.status !== 201) {
    throw new Error(`Fixture setup failed (${response.status}): ${response.body}`);
  }
  const fixture = response.json();
  return {
    ...fixture,
    metadata: {
      profile: SCENARIO,
      gitSha: __ENV.GIT_SHA || "unknown",
      imageVersion: __ENV.IMAGE_VERSION || "unknown",
      serverSpecs: __ENV.SERVER_SPECS || "unknown",
      startedAt: new Date().toISOString(),
    },
  };
}

const studentSessions = {};
let teacherLoggedIn = false;
let teacherCursor = "0";
let teacherSequence = 0;

export function studentFlow(fixture) {
  const index = (exec.vu.idInTest - 1) % fixture.students.length;
  let session = studentSessions[index];
  if (!session) {
    session = joinStudent(fixture, index);
    studentSessions[index] = session;
    uploadFixture(fixture, session, index);
  }

  const state = getState(fixture.course.id);
  if (state) session.cursor = state.eventCursor || session.cursor;

  const presence = http.put(
    `${BASE_URL}/api/courses/${fixture.course.id}/presence`,
    null,
    requestParams("presence heartbeat", "write"),
  );
  check(presence, { "presence accepted": (r) => r.status === 200 });

  const requestId = uuid();
  const progressAck = sendAction(fixture.course.id, {
    requestId,
    action: {
      type: "UPDATE_STUDENT_PROGRESS",
      payload: {
        courseId: fixture.course.id,
        studentId: session.studentId,
        stageKey: "load-test",
        value: Math.min(100, (session.sequence % 100) + 1),
      },
    },
  });

  if (progressAck) {
    const duplicate = sendAction(fixture.course.id, {
      requestId,
      action: {
        type: "UPDATE_STUDENT_PROGRESS",
        payload: {
          courseId: fixture.course.id,
          studentId: session.studentId,
          stageKey: "load-test",
          value: Math.min(100, (session.sequence % 100) + 1),
        },
      },
    });
    const idempotent =
      duplicate &&
      duplicate.eventCursor === progressAck.eventCursor &&
      duplicate.courseVersion === progressAck.courseVersion;
    consistencyFailures.add(!idempotent);
    if (idempotent) duplicateAcks.add(1);
    session.cursor = progressAck.eventCursor;
  }

  const submissionId = uuid();
  const now = new Date().toISOString();
  sendAction(fixture.course.id, {
    requestId: uuid(),
    action: {
      type: "UPSERT_SUBMISSION",
      payload: {
        courseId: fixture.course.id,
        submission: {
          id: submissionId,
          courseId: fixture.course.id,
          studentId: session.studentId,
          studentName: session.studentName,
          stageKey: "load-test",
          type: "evidence",
          title: `k6 evidence ${session.sequence}`,
          content: `run=${fixture.runId};sequence=${session.sequence}`,
          createdAt: now,
          updatedAt: now,
        },
      },
    },
  });

  recoverEvents(fixture.course.id, session);
  observeWebSocket(fixture.course.id, "student");
  session.sequence += 1;
  sleep(1);
}

export function teacherFlow(fixture) {
  const teachers = fixture.teachers?.length ? fixture.teachers : [fixture.teacher];
  const teacher = teachers[(exec.vu.idInTest - 1) % teachers.length];
  if (!teacherLoggedIn) {
    const response = http.post(
      `${BASE_URL}/api/auth/login`,
      JSON.stringify(teacher),
      requestParams("teacher login", "auth"),
    );
    check(response, { "teacher login accepted": (r) => r.status === 200 });
    if (response.status !== 200) return;
    teacherLoggedIn = true;
  }

  const state = getState(fixture.course.id);
  if (!state) return;
  teacherCursor = state.eventCursor || teacherCursor;

  const now = new Date().toISOString();
  const response = timedPost(
    `${BASE_URL}/api/courses/${fixture.course.id}/actions`,
    {
      requestId: uuid(),
      expectedVersion: state.courseVersion,
      action: {
        type: "UPSERT_ANNOUNCEMENT",
        payload: {
          courseId: fixture.course.id,
          announcement: {
            id: `k6-teacher-${exec.vu.idInTest}`,
            title: "k6 teacher operation",
            content: `run=${fixture.runId};sequence=${teacherSequence}`,
            createdAt: now,
            updatedAt: now,
            replies: [],
          },
        },
      },
    },
    "teacher action",
    true,
  );
  check(response, {
    "teacher write accepted or conflicted cleanly": (r) =>
      r.status === 200 || r.status === 409,
  });
  if (response.status === 200) {
    teacherCursor = response.json("eventCursor") || teacherCursor;
  }
  const cursorRef = { cursor: teacherCursor };
  recoverEvents(fixture.course.id, cursorRef);
  teacherCursor = cursorRef.cursor;
  observeWebSocket(fixture.course.id, "teacher");
  teacherSequence += 1;
  sleep(5);
}

export function teardown(fixture) {
  if (!fixture?.runId) return;
  const response = http.del(
    `${BASE_URL}/api/load-test/runs/${fixture.runId}`,
    null,
    { headers: adminHeaders(), timeout: "60s" },
  );
  check(response, { "isolated fixture cleanup succeeded": (r) => r.status === 204 });
}

function joinStudent(fixture, index) {
  const student = fixture.students[index];
  const response = http.post(
    `${BASE_URL}/api/auth/join`,
    JSON.stringify({
      requestId: uuid(),
      inviteCode: fixture.course.inviteCode,
      studentName: student.name,
    }),
    requestParams("student join", "auth"),
  );
  check(response, { "student join accepted": (r) => r.status === 200 });
  if (response.status !== 200) {
    throw new Error(`Student join failed (${response.status}): ${response.body}`);
  }
  return {
    studentId: response.json("user.studentId"),
    studentName: student.name,
    cursor: "0",
    sequence: 0,
  };
}

function getState(courseId) {
  const response = http.get(
    `${BASE_URL}/api/courses/${courseId}/state`,
    requestParams("course state", "read"),
  );
  check(response, { "course state loaded": (r) => r.status === 200 });
  return response.status === 200 ? response.json() : null;
}

function sendAction(courseId, envelope) {
  const response = timedPost(
    `${BASE_URL}/api/courses/${courseId}/actions`,
    envelope,
    envelope.action.type,
  );
  check(response, { "student write acknowledged": (r) => r.status === 200 });
  return response.status === 200 ? response.json() : null;
}

function timedPost(url, body, name, allowConflict = false) {
  const started = Date.now();
  const response = http.post(
    url,
    JSON.stringify(body),
    {
      ...requestParams(name, "write"),
      ...(allowConflict
        ? { responseCallback: http.expectedStatuses(200, 409) }
        : {}),
    },
  );
  writeDuration.add(Date.now() - started, { name });
  return response;
}

function recoverEvents(courseId, session) {
  const response = http.get(
    `${BASE_URL}/api/courses/${courseId}/events?after=${session.cursor || "0"}&limit=500`,
    requestParams("event recovery", "read"),
  );
  if (response.status !== 200) {
    consistencyFailures.add(true);
    return;
  }
  const events = response.json("events") || [];
  let previous = BigInt(session.cursor || "0");
  let ordered = true;
  for (const event of events) {
    const cursor = BigInt(event.cursor);
    if (cursor <= previous) ordered = false;
    previous = cursor;
  }
  orderedEvents.add(ordered);
  consistencyFailures.add(!ordered);
  session.cursor = response.json("nextCursor") || session.cursor;
}

function observeWebSocket(courseId, role) {
  const jar = http.cookieJar();
  const cookies = jar.cookiesForURL(BASE_URL);
  const cookieHeader = Object.entries(cookies)
    .flatMap(([name, values]) => values.map((value) => `${name}=${value}`))
    .join("; ");
  const response = ws.connect(
    `${WS_URL}/ws?role=${role}`,
    {
      headers: { Origin: ORIGIN, Cookie: cookieHeader },
      tags: { name: "course websocket", role },
    },
    (socket) => {
      socket.on("open", () => {
        socket.send(JSON.stringify({ type: "subscribe", courseId }));
      });
      socket.on("message", (raw) => {
        let message;
        try {
          message = JSON.parse(raw);
        } catch {
          consistencyFailures.add(true);
          return;
        }
        if (message.type === "course-event" && message.event?.at) {
          websocketDelivery.add(Math.max(0, Date.now() - Date.parse(message.event.at)));
        }
      });
      socket.setTimeout(() => socket.close(), 10_000);
    },
  );
  check(response, { "websocket upgraded": (r) => r?.status === 101 });
}

function uploadFixture(fixture, session, index) {
  const onePixelPng = encoding.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "std",
  );
  const response = http.post(
    `${BASE_URL}/api/uploads`,
    {
      file: http.file(onePixelPng, `k6-${index}.png`, "image/png"),
      courseId: fixture.course.id,
    },
    {
      headers: { Origin: ORIGIN },
      tags: { name: "small upload", kind: "upload" },
      timeout: "30s",
    },
  );
  check(response, { "small upload accepted": (r) => r.status === 201 });
}

function requestParams(name, kind) {
  return {
    headers: {
      "Content-Type": "application/json",
      Origin: ORIGIN,
      "X-Request-Id": uuid(),
    },
    tags: { name, kind },
    timeout: "30s",
  };
}

function adminHeaders() {
  return {
    Authorization: `Bearer ${ADMIN_TOKEN}`,
    "Content-Type": "application/json",
    Origin: ORIGIN,
    "X-Request-Id": uuid(),
  };
}

function required(name) {
  const value = __ENV[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function uuid() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function handleSummary(data) {
  const metadata = {
    scenario: SCENARIO,
    gitSha: __ENV.GIT_SHA || "unknown",
    imageVersion: __ENV.IMAGE_VERSION || "unknown",
    serverSpecs: __ENV.SERVER_SPECS || "unknown",
    generatedAt: new Date().toISOString(),
  };
  const report = { metadata, summary: data };
  const escaped = JSON.stringify(report).replaceAll("<", "\\u003c");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>OpenPBL ${SCENARIO} load report</title>
<style>body{font:14px system-ui;margin:2rem;max-width:1100px}pre{white-space:pre-wrap;background:#f5f5f5;padding:1rem}</style>
</head><body><h1>OpenPBL ${SCENARIO} load report</h1>
<p>Git ${metadata.gitSha}; image ${metadata.imageVersion}; server ${metadata.serverSpecs}</p>
<pre id="report"></pre><script>const data=${escaped};document.getElementById("report").textContent=JSON.stringify(data,null,2)</script>
</body></html>`;
  return {
    [`/reports/${SCENARIO}-summary.json`]: JSON.stringify(report, null, 2),
    [`/reports/${SCENARIO}-report.html`]: html,
    stdout: `OpenPBL ${SCENARIO} report written to tests/load/reports.\n`,
  };
}
