import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COURSE_COVER_GENERATION_SPEC,
  buildCourseCoverPrompt,
  requestCourseCoverImage,
  requestCourseCoverImageAtEndpoint,
} from "@/lib/course-cover";

const course = {
  name: "校园雨水花园",
  subject: "科学与地理",
  grade: "八年级",
  summary: "调查校园积水问题，设计能够收集和净化雨水的微型花园。",
  drivingQuestion: "怎样减少教学楼周边积水并改善校园生态？",
  expectedOutcome: "可实施的雨水花园模型与说明方案",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("course cover generation", () => {
  it("uses the course name as the primary visual subject and preserves course context", () => {
    const prompt = buildCourseCoverPrompt(course);

    expect(prompt).toContain('PRIMARY COURSE THEME: "校园雨水花园"');
    expect(prompt).toContain("Subject: 科学与地理");
    expect(prompt).toContain("Learners: 八年级");
    expect(prompt).toContain(course.drivingQuestion);
    expect(prompt.indexOf(course.name)).toBeLessThan(prompt.indexOf(course.subject));
    expect(prompt).not.toContain("abstract or representational");
  });

  it("keeps one art direction, composition and output size for every course", () => {
    const first = buildCourseCoverPrompt(course);
    const second = buildCourseCoverPrompt({
      ...course,
      name: "会呼吸的古建筑",
      subject: "历史与工程",
      drivingQuestion: "古建筑如何适应当地气候？",
    });

    for (const fixedInstruction of [
      "modern editorial vector illustration",
      "consistent OpenPBL course-cover visual system",
      "one clear focal scene",
      "teal, sky blue, warm amber and coral",
      "16:9 landscape composition",
      "NO TEXT",
    ]) {
      expect(first).toContain(fixedInstruction);
      expect(second).toContain(fixedInstruction);
    }
  });

  it("sends the fixed 16:9 generation contract to the image API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ result: { url: "https://example.test/course-cover.webp" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestCourseCoverImage(course)).resolves.toBe(
      "https://example.test/course-cover.webp",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject(COURSE_COVER_GENERATION_SPEC);
    expect(body.prompt).toContain(course.name);
    expect(body.negativePrompt).toContain("text");
  });

  it("supports an absolute endpoint for background quick generation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ result: { url: "https://cdn.example.test/quick-cover.webp" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestCourseCoverImageAtEndpoint(
      course,
      "https://openpbl.example.test/api/openmaic/generate/image",
    )).resolves.toBe("https://cdn.example.test/quick-cover.webp");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openpbl.example.test/api/openmaic/generate/image",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
