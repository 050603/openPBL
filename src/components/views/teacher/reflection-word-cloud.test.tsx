import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ReflectionWordCloud } from "./reflection-word-cloud";

const mocks = vi.hoisted(() => ({
  layout: vi.fn(),
}));

vi.mock("@visx/wordcloud", () => ({
  Wordcloud: ({ children, fontSize, random, words }: {
    children: (words: Array<{ text: string; x: number; y: number; size: number; rotate: number }>) => ReactNode;
    fontSize: (word: { text: string }) => number;
    random: () => number;
    words: Array<{ text: string }>;
  }) => {
    mocks.layout({ fontSize, random, words });
    return <svg>{children(words.map((word) => ({ ...word, x: 0, y: 0, size: 20, rotate: 0 })))}</svg>;
  },
}));

describe("ReflectionWordCloud", () => {
  it("opens a term from keyboard activation with its student count", () => {
    const onSelect = vi.fn();
    render(<ReflectionWordCloud onSelect={onSelect} terms={[{ label: "证据", value: 3 }]} />);

    const word = screen.getByRole("button", { name: "证据，涉及 3 名学生" });
    fireEvent.keyDown(word, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith({ label: "证据", value: 3 });
  });

  it("keeps layout inputs stable when an equivalent terms array is passed again", () => {
    const { rerender } = render(
      <ReflectionWordCloud onSelect={vi.fn()} seed="gains" terms={[{ label: "证据", value: 3 }]} />,
    );
    const first = mocks.layout.mock.lastCall?.[0];

    rerender(<ReflectionWordCloud onSelect={vi.fn()} seed="gains" terms={[{ label: "证据", value: 3 }]} />);
    const second = mocks.layout.mock.lastCall?.[0];

    expect(second.words).toBe(first.words);
    expect(second.fontSize).toBe(first.fontSize);
    expect(second.random).toBe(first.random);
  });
});
