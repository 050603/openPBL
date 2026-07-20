import type { CSSProperties } from "react";

/**
 * openPBL 品牌 Logo
 *
 * 基于用户重新绘制的官方 Logo（位于 public/brand/）：
 * - icon      仅图标（239×244，方形）
 * - text      仅文字（408×119，横版）
 * - horizontal 横版（625×215，图标 + 文字横向）
 * - vertical  竖版（349×333，图标 + 文字纵向）
 *
 * 所有 PNG 均带 alpha 通道，可在深 / 浅背景上通用。
 */
export type OpenPblLogoVariant = "icon" | "text" | "horizontal" | "vertical";

export type OpenPblLogoProps = {
  /** Logo 形态，默认 horizontal */
  variant?: OpenPblLogoVariant;
  /** Logo 显示高度（px），宽度按原始比例自动计算 */
  height?: number;
  className?: string;
  style?: CSSProperties;
  /** 是否带光晕动画（用于深色 Hero） */
  glow?: boolean;
};

const RATIOS: Record<OpenPblLogoVariant, number> = {
  icon: 239 / 244,
  text: 408 / 119,
  horizontal: 625 / 215,
  vertical: 349 / 333,
};

const SOURCES: Record<OpenPblLogoVariant, string> = {
  icon: "/brand/logo-icon.png",
  text: "/brand/logo-text.png",
  horizontal: "/brand/logo-horizontal.png",
  vertical: "/brand/logo-vertical.png",
};

export function OpenPblLogo({
  variant = "horizontal",
  height = 40,
  className,
  style,
  glow = false,
}: OpenPblLogoProps) {
  const width = Math.round(height * RATIOS[variant]);
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 0,
        ...style,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={SOURCES[variant]}
        alt="openPBL"
        width={width}
        height={height}
        style={{
          height,
          width,
          display: "block",
          filter: glow
            ? "drop-shadow(0 0 24px rgba(99, 102, 241, 0.45)) drop-shadow(0 0 48px rgba(139, 92, 246, 0.28))"
            : undefined,
          transition: "filter 0.4s ease",
        }}
        draggable={false}
      />
    </span>
  );
}

/**
 * 仅图标的 Logo Mark —— 适合顶栏 / 头像位
 */
export function OpenPblLogoMark({
  size = 32,
  className,
  style,
  glow = false,
}: {
  size?: number;
  className?: string;
  style?: CSSProperties;
  glow?: boolean;
}) {
  return (
    <OpenPblLogo
      variant="icon"
      height={size}
      className={className}
      style={style}
      glow={glow}
    />
  );
}
