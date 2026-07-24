"use client";

import { createElement, useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Editorial 风格滚动渐入动画
 *
 * 支持 stagger（子元素错峰）和单元素渐入两种模式。
 * 用 is-visible class 触发 CSS transition。
 */
export function EditorialReveal({
  children,
  className,
  stagger = false,
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  /** 是否启用子元素错峰渐入 */
  stagger?: boolean;
  /** 渐入延迟（毫秒） */
  delay?: number;
  as?: "div" | "section" | "article" | "li" | "span" | "ul" | "ol";
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // 尊重 prefers-reduced-motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("is-visible");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const target = entry.target as HTMLElement;
            if (delay > 0) {
              target.style.transitionDelay = `${delay}ms`;
            }
            target.classList.add("is-visible");
            observer.unobserve(target);
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  return createElement(
    Tag,
    {
      ref,
      className: cn(stagger ? "pbl-stagger" : "pbl-editorial-reveal", className),
    },
    children,
  );
}
