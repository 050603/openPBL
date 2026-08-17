from __future__ import annotations

import hashlib
import json
import math
import textwrap
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Callable, Iterable

import matplotlib as mpl
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, FancyArrowPatch, FancyBboxPatch, Polygon, Rectangle
from PIL import Image, ImageDraw, ImageFont


PACK_DIR = Path(__file__).resolve().parents[1]
SVG_DIR = PACK_DIR / "svg"
PNG_DIR = PACK_DIR / "png"
PDF_DIR = PACK_DIR / "pdf"

INK = "#20364D"
MUTED = "#66788A"
LINE = "#A8B4C0"
PAPER = "#FFFFFF"
SOFT = "#F5F7FA"
BLUE = "#2E6FB6"
BLUE_L = "#EAF2FA"
TEAL = "#14868B"
TEAL_L = "#E7F4F3"
AMBER = "#B97816"
AMBER_L = "#FFF3D8"
RED = "#B95043"
RED_L = "#FBECEA"
PURPLE = "#7156A4"
PURPLE_L = "#F1ECF8"
GREEN = "#3E8363"
GREEN_L = "#EAF4EE"
SLATE = "#5E7084"
SLATE_L = "#EEF2F5"

mpl.rcParams.update(
    {
        "font.family": "Arial",
        "font.size": 8,
        "text.color": INK,
        "axes.edgecolor": LINE,
        "axes.labelcolor": INK,
        "svg.fonttype": "none",
        "pdf.fonttype": 42,
        "ps.fonttype": 42,
        "savefig.facecolor": PAPER,
        "figure.facecolor": PAPER,
    }
)


def canvas(height: float = 4.6):
    fig, ax = plt.subplots(figsize=(7.2, height), dpi=150)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    return fig, ax


def wrap(value: str, width: int) -> str:
    return "\n".join(
        textwrap.fill(part, width=width, break_long_words=False, break_on_hyphens=False)
        for part in value.split("\n")
    )


def label(
    ax,
    x: float,
    y: float,
    text: str,
    *,
    size: float = 7.5,
    weight: str = "normal",
    color: str = INK,
    ha: str = "center",
    va: str = "center",
    z: int = 5,
    linespacing: float = 1.14,
    **kwargs,
):
    return ax.text(
        x,
        y,
        text,
        fontsize=size,
        fontweight=weight,
        color=color,
        ha=ha,
        va=va,
        zorder=z,
        linespacing=linespacing,
        **kwargs,
    )


def box(
    ax,
    x: float,
    y: float,
    w: float,
    h: float,
    *,
    title: str = "",
    body: str = "",
    face: str = PAPER,
    edge: str = LINE,
    lw: float = 1.0,
    radius: float = 0.012,
    title_size: float = 8.2,
    body_size: float = 6.7,
    title_color: str = INK,
    body_color: str = MUTED,
    linestyle: str = "solid",
    align: str = "center",
    z: int = 2,
):
    patch = FancyBboxPatch(
        (x, y),
        w,
        h,
        boxstyle=f"round,pad=0.006,rounding_size={radius}",
        linewidth=lw,
        edgecolor=edge,
        facecolor=face,
        linestyle=linestyle,
        zorder=z,
    )
    ax.add_patch(patch)
    tx = x + w / 2 if align == "center" else x + 0.018
    ha = "center" if align == "center" else "left"
    body_rendered = wrap(body, max(14, round(w * 128))) if body else ""
    if title and body:
        label(ax, tx, y + h * 0.79, title, size=title_size, weight="bold", color=title_color, ha=ha)
        label(ax, tx, y + h * 0.37, body_rendered, size=body_size, color=body_color, ha=ha)
    elif title:
        label(ax, tx, y + h / 2, title, size=title_size, weight="bold", color=title_color, ha=ha)
    elif body:
        label(ax, tx, y + h / 2, body_rendered, size=body_size, color=body_color, ha=ha)
    return patch


def pill(
    ax,
    x: float,
    y: float,
    w: float,
    h: float,
    text: str,
    *,
    face: str = SOFT,
    edge: str = LINE,
    color: str = INK,
    size: float = 6.6,
    weight: str = "bold",
):
    box(ax, x, y, w, h, face=face, edge=edge, radius=h / 2.2, lw=0.8)
    label(ax, x + w / 2, y + h / 2, text, size=size, weight=weight, color=color)


def arrow(
    ax,
    start: tuple[float, float],
    end: tuple[float, float],
    *,
    color: str = SLATE,
    lw: float = 1.1,
    style: str = "-|>",
    dashed: bool = False,
    rad: float = 0.0,
    label_text: str | None = None,
    label_offset: tuple[float, float] = (0, 0),
    z: int = 1,
):
    patch = FancyArrowPatch(
        start,
        end,
        arrowstyle=style,
        mutation_scale=8,
        linewidth=lw,
        color=color,
        linestyle=(0, (3, 2)) if dashed else "solid",
        connectionstyle=f"arc3,rad={rad}",
        shrinkA=1.5,
        shrinkB=1.5,
        zorder=z,
    )
    ax.add_patch(patch)
    if label_text:
        mx = (start[0] + end[0]) / 2 + label_offset[0]
        my = (start[1] + end[1]) / 2 + label_offset[1]
        label(
            ax,
            mx,
            my,
            label_text,
            size=6.1,
            color=MUTED,
            bbox={"facecolor": PAPER, "edgecolor": "none", "pad": 1.2},
        )
    return patch


def number_dot(ax, x: float, y: float, value: str, color: str = BLUE):
    ax.add_patch(Circle((x, y), 0.018, facecolor=color, edgecolor=PAPER, linewidth=0.8, zorder=7))
    label(ax, x, y, value, size=6.6, weight="bold", color=PAPER, z=8)


def panel_label(ax, text: str):
    label(ax, 0.012, 0.975, text, size=9.5, weight="bold", ha="left", va="top")


def footer_note(ax, text: str, *, color: str = MUTED, dashed: bool = False):
    box(
        ax,
        0.025,
        0.025,
        0.95,
        0.075,
        body=text,
        face=SOFT if not dashed else PAPER,
        edge=LINE,
        body_color=color,
        body_size=6.6,
        linestyle=(0, (4, 2)) if dashed else "solid",
        radius=0.01,
        lw=0.8,
    )


def validate_bounds(fig, slug: str):
    fig.canvas.draw()
    renderer = fig.canvas.get_renderer()
    fb = fig.bbox
    problems: list[str] = []
    for item in fig.findobj(match=mpl.text.Text):
        if not item.get_visible() or not item.get_text().strip():
            continue
        bb = item.get_window_extent(renderer=renderer)
        if bb.x0 < fb.x0 - 2 or bb.y0 < fb.y0 - 2 or bb.x1 > fb.x1 + 2 or bb.y1 > fb.y1 + 2:
            problems.append(item.get_text().replace("\n", " ")[:70])
    if problems:
        raise RuntimeError(f"{slug}: text outside canvas: {problems}")


def export(fig, slug: str):
    validate_bounds(fig, slug)
    SVG_DIR.mkdir(parents=True, exist_ok=True)
    PNG_DIR.mkdir(parents=True, exist_ok=True)
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    fig.savefig(SVG_DIR / f"{slug}.svg", format="svg", dpi=300)
    fig.savefig(PDF_DIR / f"{slug}.pdf", format="pdf", dpi=300)
    fig.savefig(PNG_DIR / f"{slug}.png", format="png", dpi=300)
    plt.close(fig)


def fig01_conjecture_map():
    fig, ax = canvas(4.35)
    panel_label(ax, "A")
    headers = [
        (0.03, 0.79, 0.15, "Educational tension", RED, RED_L),
        (0.225, 0.79, 0.17, "High-level conjecture", PURPLE, PURPLE_L),
        (0.44, 0.79, 0.18, "Embodied mechanisms", BLUE, BLUE_L),
        (0.665, 0.79, 0.14, "Mediating processes", TEAL, TEAL_L),
        (0.85, 0.79, 0.12, "Outcomes to test", GREEN, GREEN_L),
    ]
    for x, y, w, text, edge, face in headers:
        box(ax, x, y, w, 0.09, title=wrap(text, 20), face=face, edge=edge, title_size=7.5)

    content = [
        (
            0.03,
            0.27,
            0.15,
            0.47,
            "Performance ≠ learning",
            "Generative help may improve the current artifact while displacing explanation, verification, and independent performance.",
            RED,
            RED_L,
        ),
        (
            0.225,
            0.27,
            0.17,
            0.47,
            "Bounded co-agency",
            "Useful AI support can coexist with learning when curriculum, sequence, delegation, evidence, and consequential authority are explicit.",
            PURPLE,
            PURPLE_L,
        ),
        (
            0.44,
            0.27,
            0.18,
            0.47,
            "Executable design",
            "Role-aware curriculum graph\nTeach → practice → feedback → assess\nGap-specific remediation\nWhitelisted reversible edits\nTyped evidence gates",
            BLUE,
            BLUE_L,
        ),
        (
            0.665,
            0.27,
            0.14,
            0.47,
            "Expected activity",
            "Relevant scaffolding\nProductive struggle\nStudent verification\nTraceable iteration\nTeacher orchestration",
            TEAL,
            TEAL_L,
        ),
        (
            0.85,
            0.27,
            0.12,
            0.47,
            "Proximal / distal",
            "Evidence-chain fidelity\nCalibrated control\nUnaided transfer\nOwnership\nTeacher workload",
            GREEN,
            GREEN_L,
        ),
    ]
    for x, y, w, h, title, body, edge, face in content:
        box(
            ax,
            x,
            y,
            w,
            h,
            title=wrap(title, 22),
            body=body,
            face=face,
            edge=edge,
            title_size=8.0,
            body_size=6.45,
        )
    for left, right in [(0.18, 0.225), (0.395, 0.44), (0.62, 0.665), (0.805, 0.85)]:
        arrow(ax, (left + 0.005, 0.765), (right - 0.005, 0.765), dashed=left >= 0.62)

    box(
        ax,
        0.03,
        0.135,
        0.59,
        0.085,
        title="Current study: formative design-fidelity audit",
        body="ADRs + source contracts + targeted regression tests; no human outcome claim",
        face=SLATE_L,
        edge=SLATE,
        title_size=7.3,
        body_size=6.2,
    )
    box(
        ax,
        0.665,
        0.135,
        0.305,
        0.085,
        title="Future empirical studies",
        body="Co-design → feasibility → comparative effectiveness",
        face=PAPER,
        edge=GREEN,
        linestyle=(0, (4, 2)),
        title_size=7.3,
        body_size=6.2,
    )
    label(ax, 0.5, 0.055, "Solid arrows: implemented theory-to-mechanism links    Dashed arrows: educational conjectures requiring classroom evidence", size=6.2, color=MUTED)
    return fig


def fig02_system_architecture():
    fig, ax = canvas(5.05)
    panel_label(ax, "B")
    actors = [
        (0.10, "Teacher workspace", "design · orchestrate · adjudicate", BLUE, BLUE_L),
        (0.405, "Student workspace", "learn · create · verify · submit", TEAL, TEAL_L),
        (0.71, "Audit / research view", "trace · reproduce · analyse", PURPLE, PURPLE_L),
    ]
    for x, title, body, edge, face in actors:
        box(ax, x, 0.83, 0.19, 0.105, title=title, body=body, face=face, edge=edge, title_size=7.6, body_size=6.1)

    layer_specs = [
        (0.69, 0.105, "Experience & interaction", "Next.js interfaces  ·  OpenMAIC player/canvas  ·  companion studio  ·  realtime whiteboard", BLUE, BLUE_L),
        (0.535, 0.105, "Application orchestration", "course-design Agent  ·  durable generation worker  ·  classroom runtime  ·  companion runtime  ·  teacher support engine", PURPLE, PURPLE_L),
        (0.38, 0.105, "Pedagogical policy", "curriculum roles  ·  instructional sequence  ·  prerequisite router  ·  stage policy  ·  reversible operation policy", AMBER, AMBER_L),
        (0.225, 0.105, "Evidence & domain state", "learning events  ·  typed evidence  ·  artifact snapshots  ·  AI contributions  ·  signals  ·  directives  ·  evaluations", TEAL, TEAL_L),
    ]
    for y, h, title, body, edge, face in layer_specs:
        box(ax, 0.08, y, 0.84, h, face=face, edge=edge, radius=0.012, lw=1.0)
        box(ax, 0.09, y + 0.015, 0.18, h - 0.03, title=wrap(title, 18), face=PAPER, edge=edge, title_size=7.2, lw=0.8)
        label(ax, 0.295, y + h / 2, wrap(body, 96), size=6.2, color=INK, ha="left")

    box(ax, 0.08, 0.055, 0.51, 0.105, title="Platform services", body="PostgreSQL · Redis · WebSocket/tldraw sync · persistent files · Nginx · monitoring · backups", face=SLATE_L, edge=SLATE, title_size=7.4, body_size=6.15)
    box(ax, 0.62, 0.055, 0.30, 0.105, title="External model services", body="LLM · image/video · TTS · search\nprovider credentials encrypted at rest", face=RED_L, edge=RED, title_size=7.4, body_size=6.15)

    for x in (0.195, 0.50, 0.805):
        arrow(ax, (x, 0.83), (x, 0.805), color=LINE, lw=0.9)
    for y1, y2 in [(0.69, 0.64), (0.535, 0.485), (0.38, 0.33), (0.225, 0.16)]:
        arrow(ax, (0.955, y1 + 0.053), (0.955, y2 + 0.053), color=BLUE, lw=1.0, label_text="commands", label_offset=(0.025, 0))
        arrow(ax, (0.045, y2 + 0.053), (0.045, y1 + 0.053), color=TEAL, lw=1.0, label_text="evidence", label_offset=(-0.022, 0))
    arrow(ax, (0.72, 0.16), (0.72, 0.225), color=RED, lw=0.9)
    label(ax, 0.5, 0.012, "Modular monolith: pedagogical constraints are executable policies inside one auditable application boundary", size=6.3, color=MUTED)
    return fig


def fig03_authority_topology():
    fig, ax = canvas(4.9)
    panel_label(ax, "C")
    x0 = 0.035
    widths = [0.145, 0.145, 0.145, 0.155, 0.33]
    xs = [x0]
    for w in widths[:-1]:
        xs.append(xs[-1] + w)
    headers = [
        ("Authority domain", SLATE, SLATE_L),
        ("Teacher", BLUE, BLUE_L),
        ("Student", TEAL, TEAL_L),
        ("AI / system", AMBER, AMBER_L),
        ("Executable safeguard", PURPLE, PURPLE_L),
    ]
    for i, (text, edge, face) in enumerate(headers):
        box(ax, xs[i], 0.84, widths[i] - 0.008, 0.085, title=wrap(text, 20), face=face, edge=edge, title_size=7.1, lw=0.8)

    rows = [
        ("Curricular", "approve / revise", "context is represented", "draft graph + semantic review", "typed roles and directed dependency edges", BLUE, BLUE_L),
        ("Instructional", "set intent and edit", "explain, practise, respond", "sequence content and feedback", "practice remains ungraded; one terminal assessment", TEAL, TEAL_L),
        ("Adaptive", "inspect / intervene", "complete the full lesson", "route from specific evidence", "one item and one resource per prerequisite gap", AMBER, AMBER_L),
        ("Productive", "observe process", "frame, verify, undo, submit", "apply whitelisted draft edits", "before/after provenance + version conflict protection", PURPLE, PURPLE_L),
        ("Evaluative", "make consequential judgment", "submit evidence and defend", "validate, surface risk, recommend", "AI cannot complete stages or become final assessor", RED, RED_L),
    ]
    y = 0.70
    for ri, row in enumerate(rows):
        name, teacher, student, ai, safeguard, edge, face = row
        bg = PAPER if ri % 2 == 0 else SOFT
        ax.add_patch(Rectangle((0.035, y - 0.015), 0.93, 0.13, facecolor=bg, edgecolor="none", zorder=0))
        pill(ax, xs[0] + 0.008, y + 0.012, widths[0] - 0.025, 0.052, name, face=face, edge=edge, color=edge, size=6.6)
        texts = [teacher, student, ai, safeguard]
        for ci, value in enumerate(texts, start=1):
            label(ax, xs[ci] + (widths[ci] - 0.008) / 2, y + 0.039, wrap(value, 24 if ci == 4 else 18), size=6.15, color=INK)
        ax.plot([0.035, 0.965], [y - 0.015, y - 0.015], color=LINE, lw=0.55, zorder=1)
        y -= 0.135

    box(ax, 0.035, 0.04, 0.93, 0.09, title="Non-delegable consequential authority", body="AI cannot submit a student's work, complete a stage, confirm a teacher decision, or make the final evaluation.", face=RED_L, edge=RED, title_color=RED, title_size=7.4, body_size=6.4)
    return fig


def fig04_adaptive_path():
    fig, ax = canvas(4.35)
    panel_label(ax, "D")
    widths = [0.17, 0.145, 0.145, 0.16, 0.17, 0.09]
    x_positions = [0.025]
    for current_width in widths[:-1]:
        x_positions.append(x_positions[-1] + current_width + 0.012)
    raw_steps = [
        ("1", "Role-aware\ncurriculum graph", "", BLUE, BLUE_L),
        ("2", "Prerequisite\ndiagnostic", "one informative item per approved prerequisite", AMBER, AMBER_L),
        ("3", "Gap-specific\nremediation", "one micro-resource per diagnosed gap", AMBER, AMBER_L),
        ("4", "Full main lesson", "explain → example → ungraded practice → feedback", TEAL, TEAL_L),
        ("5", "Terminal mastery\nassessment", "one graded assessment; items tagged to lesson targets", BLUE, BLUE_L),
        ("6", "Optional\nenrichment", "mastery + time; ungraded; no post-test", SLATE, SLATE_L),
    ]
    steps = [(x, w, *spec) for x, w, spec in zip(x_positions, widths, raw_steps)]
    for x, w, n, title, body, edge, face in steps:
        if n == "1":
            box(ax, x, 0.39, w, 0.43, face=face, edge=edge)
            label(ax, x + w / 2, 0.735, title, size=7.4, weight="bold")
            label(ax, x + w / 2, 0.445, "prerequisite ≠ lesson\n≠ extension", size=5.7, color=MUTED)
        else:
            box(ax, x, 0.39, w, 0.43, title=title, body=body, face=face, edge=edge, title_size=7.2, body_size=5.85)
        number_dot(ax, x + 0.02, 0.79, n, edge)
    for a, b in zip(steps[:-1], steps[1:]):
        arrow(ax, (a[0] + a[1] + 0.003, 0.605), (b[0] - 0.005, 0.605), color=SLATE, lw=1.0)

    # Typed graph inside the first step.
    nodes = [
        (0.055, 0.535, "P1", AMBER, AMBER_L),
        (0.055, 0.645, "P2", AMBER, AMBER_L),
        (0.125, 0.59, "L1", BLUE, BLUE_L),
        (0.17, 0.505, "L2", BLUE, BLUE_L),
        (0.17, 0.67, "E1", SLATE, SLATE_L),
    ]
    for x, y, n, edge, face in nodes:
        ax.add_patch(Circle((x, y), 0.021, facecolor=face, edgecolor=edge, linewidth=0.9, zorder=5))
        label(ax, x, y, n, size=5.8, weight="bold", color=edge, z=6)
    for s, e, dashed in [((0.076, 0.542), (0.105, 0.575), False), ((0.076, 0.638), (0.105, 0.605), False), ((0.145, 0.575), (0.158, 0.52), False), ((0.145, 0.605), (0.158, 0.655), True)]:
        arrow(ax, s, e, color=SLATE, lw=0.9, dashed=dashed, z=3)

    # No-gap skip and return-to-main-lesson logic.
    diagnostic = steps[1]
    remediation = steps[2]
    lesson = steps[3]
    arrow(ax, (diagnostic[0] + diagnostic[1] / 2, 0.39), (lesson[0] + lesson[1] / 2, 0.31), color=TEAL, lw=1.0, rad=0.12, label_text="no diagnosed gap", label_offset=(0, -0.015))
    arrow(ax, (remediation[0] + remediation[1] / 2, 0.39), (lesson[0] + lesson[1] / 2, 0.31), color=AMBER, lw=1.0, rad=0.10, label_text="after gap repair", label_offset=(0, 0.012))
    box(ax, 0.52, 0.135, 0.31, 0.125, title="Invariant", body="Every learner returns to the full main lesson; lesson targets are never pretested as prerequisites.", face=TEAL_L, edge=TEAL, title_size=6.8, body_size=5.75)
    box(ax, 0.025, 0.135, 0.42, 0.125, title="Curricular validity checks", body="expected before class · necessary for access · diagnostically observable · semantically reviewed", face=BLUE_L, edge=BLUE, title_size=6.8, body_size=5.7)
    label(ax, 0.5, 0.06, "P = prerequisite node   L = lesson target   E = optional extension   Solid edge = required prerequisite   Dashed edge = helpful support", size=6.2, color=MUTED)
    return fig


def fig05_evidence_lifecycle():
    fig, ax = canvas(5.15)
    panel_label(ax, "E")
    stages = [
        ("Project\nlaunch", "Teacher leads", "project intent", BLUE, BLUE_L),
        ("Knowledge\nbuilding", "AI teaches; student practises", "knowledge transfer + terminal mastery", AMBER, AMBER_L),
        ("Proposal", "Student leads; teacher calibrates", "plan version + teacher confirmation", PURPLE, PURPLE_L),
        ("Project\nmaking", "Student makes/tests; AI bounded", "artifact version + test result + revision decision", TEAL, TEAL_L),
        ("Showcase", "Student submits; teacher evaluates", "final artifact +\nclaim · evidence ·\nlimitation + defence", RED, RED_L),
        ("Reflection\n& transfer", "Student explains change", "causal reflection chain + transfer response", GREEN, GREEN_L),
    ]
    left = 0.027
    gap = 0.012
    w = (0.946 - 5 * gap) / 6
    for i, (title, actor, evidence, edge, face) in enumerate(stages):
        x = left + i * (w + gap)
        pill(ax, x + 0.012, 0.82, w - 0.024, 0.05, f"Stage {i + 1}", face=face, edge=edge, color=edge, size=6.4)
        box(ax, x, 0.57, w, 0.21, title=title, body=actor, face=face, edge=edge, title_size=7.7, body_size=5.9)
        box(ax, x, 0.27, w, 0.23, title="Evidence", body=wrap(evidence, 23), face=PAPER, edge=edge, title_size=6.8, body_size=5.9)
        pill(ax, x + 0.018, 0.17, w - 0.036, 0.052, "EVIDENCE READY", face=SLATE_L, edge=SLATE, color=SLATE, size=5.0)
        if i < len(stages) - 1:
            arrow(ax, (x + w + 0.001, 0.675), (x + w + gap - 0.003, 0.675), color=SLATE, lw=0.9)
            arrow(ax, (x + w + 0.001, 0.385), (x + w + gap - 0.003, 0.385), color=edge, lw=0.8)

    arrow(ax, (0.89, 0.13), (0.10, 0.13), color=GREEN, lw=1.0, rad=-0.17, label_text="reflection informs the next project", label_offset=(0, -0.005))
    footer_note(ax, "Stage progress is derived from structurally complete evidence and human judgment—not from time-on-page, file presence, or an AI declaration of completion.")
    return fig


def fig06_reversible_delegation():
    fig, ax = canvas(5.3)
    panel_label(ax, "F")
    lanes = [
        (0.10, "Student", TEAL, TEAL_L),
        (0.31, "Shared workspace", BLUE, BLUE_L),
        (0.52, "Companion agent", AMBER, AMBER_L),
        (0.73, "Operation policy & log", PURPLE, PURPLE_L),
        (0.92, "Teacher", RED, RED_L),
    ]
    for x, name, edge, face in lanes:
        pill(ax, x - 0.075, 0.90, 0.15, 0.05, name, face=face, edge=edge, color=edge, size=6.7)
        ax.plot([x, x], [0.12, 0.89], color=LINE, lw=0.75, linestyle=(0, (3, 3)), zorder=0)

    events = [
        (0.82, 0.10, 0.31, "1  Seed idea + explicit bounded task", TEAL, False),
        (0.73, 0.31, 0.52, "2  Current field + version + stage policy", BLUE, False),
        (0.64, 0.52, 0.73, "3  Structured patch + explanation", AMBER, False),
        (0.55, 0.73, 0.31, "4  allowlist · scope · conflict check", PURPLE, False),
        (0.46, 0.31, 0.10, "5  Visible before/after change", BLUE, False),
        (0.37, 0.31, 0.73, "6  Provenance: role · task · time · evidence", PURPLE, False),
        (0.28, 0.10, 0.31, "7  Inspect · verify · accept / revise / undo", TEAL, False),
        (0.19, 0.10, 0.92, "8  Final submission and defence", RED, False),
    ]
    for y, x1, x2, txt, color, dashed in events:
        direction = 1 if x2 > x1 else -1
        arrow(ax, (x1 + direction * 0.006, y), (x2 - direction * 0.006, y), color=color, lw=1.0, dashed=dashed)
        label(ax, (x1 + x2) / 2, y + 0.025, txt, size=6.0, color=INK, bbox={"facecolor": PAPER, "edgecolor": "none", "pad": 0.8})

    box(ax, 0.63, 0.475, 0.20, 0.05, title="Atomic field update", face=PURPLE_L, edge=PURPLE, title_size=6.2)
    box(ax, 0.61, 0.225, 0.24, 0.05, title="Stale undo is blocked after a newer edit", face=RED_L, edge=RED, title_size=6.0)
    box(ax, 0.16, 0.105, 0.68, 0.06, body="Only the student can submit. Only the teacher can make consequential readiness and evaluation decisions.", face=RED_L, edge=RED, body_color=RED, body_size=6.6)
    label(ax, 0.5, 0.045, "Productive delegation = explicit request + bounded target + visible source + conflict protection + reversible action + retained human consequence", size=6.25, color=MUTED)
    return fig


def fig07_orchestration_loop():
    fig, ax = canvas(4.7)
    panel_label(ax, "G")
    sources = ["instruction", "workspace", "assessment", "collaboration", "teacher action"]
    for i, name in enumerate(sources):
        pill(ax, 0.035, 0.76 - i * 0.115, 0.145, 0.052, name, face=SLATE_L, edge=SLATE, color=SLATE, size=6.1)
        arrow(ax, (0.18, 0.786 - i * 0.115), (0.235, 0.57), color=LINE, lw=0.7)

    box(ax, 0.235, 0.45, 0.17, 0.24, title="Idempotent event log", body="type · student · stage · time · content reference · duration · metadata", face=BLUE_L, edge=BLUE, title_size=7.5, body_size=6.1)
    box(ax, 0.45, 0.45, 0.17, 0.24, title="Scoped analysis", body="deduplicate\nfilter active scope\ncompare progress evidence\ncount prior AI attempts", face=PURPLE_L, edge=PURPLE, title_size=7.5, body_size=6.1)
    box(ax, 0.665, 0.45, 0.17, 0.24, title="Attention signals", body="stagnation\nno progress\nartifact gap\nrepeated unresolved help\nclass common issue", face=AMBER_L, edge=AMBER, title_size=7.5, body_size=5.95)
    for a, b in [((0.405, 0.57), (0.45, 0.57)), ((0.62, 0.57), (0.665, 0.57))]:
        arrow(ax, a, b, color=SLATE, lw=1.0)

    box(ax, 0.28, 0.19, 0.22, 0.15, title="AI: policy-bounded scaffold", body="one current action · student seed required for high-impact help · no final answer", face=TEAL_L, edge=TEAL, title_size=7.2, body_size=6.0)
    box(ax, 0.58, 0.19, 0.25, 0.15, title="Teacher: professional judgment", body="inspect evidence · issue directive · patrol / individual guidance / whole-class teaching", face=RED_L, edge=RED, title_size=7.2, body_size=6.0)
    arrow(ax, (0.75, 0.45), (0.41, 0.34), color=TEAL, lw=1.0, rad=0.12, label_text="first-line support", label_offset=(-0.03, 0.0))
    arrow(ax, (0.79, 0.45), (0.70, 0.34), color=RED, lw=1.0, rad=-0.05, label_text="unresolved / high impact", label_offset=(0.03, 0.0))
    arrow(ax, (0.39, 0.19), (0.27, 0.18), color=TEAL, lw=0.9, rad=0.12)
    arrow(ax, (0.70, 0.19), (0.27, 0.18), color=RED, lw=0.9, rad=-0.12)
    box(ax, 0.085, 0.12, 0.22, 0.06, title="New evidence", body="student action · artifact · test · teacher record", face=GREEN_L, edge=GREEN, title_size=6.1, body_size=5.1)
    arrow(ax, (0.085, 0.15), (0.035, 0.33), color=GREEN, lw=0.9, rad=-0.18)
    footer_note(ax, "Signals prioritise attention; they do not infer motivation, ability, or learning from activity traces alone.", color=RED)
    return fig


def fig08_generation_pipeline():
    fig, ax = canvas(5.0)
    panel_label(ax, "H")
    stages = [
        ("Teacher brief", "quick or advanced input\nconstraints + learner context", BLUE, BLUE_L),
        ("Course positioning", "goals · driving question\nproject outcome", PURPLE, PURPLE_L),
        ("Knowledge structure", "lesson targets + prerequisites\ntyped graph + semantic review", AMBER, AMBER_L),
        ("PjBL blueprint", "artifact · assessment\nsix stages + timing + roles", TEAL, TEAL_L),
        ("Scene outlines", "deep-interaction sequence\none terminal assessment", BLUE, BLUE_L),
        ("Adaptive branches", "diagnostic + one-to-one repair\ntime-gated enrichment", AMBER, AMBER_L),
        ("Page generation", "checkpoint per page\nresume only missing or changed", PURPLE, PURPLE_L),
        ("Classroom package", "media + TTS + resources\npersist + publish", GREEN, GREEN_L),
    ]
    positions = [(0.04, 0.64), (0.275, 0.64), (0.51, 0.64), (0.745, 0.64), (0.745, 0.35), (0.51, 0.35), (0.275, 0.35), (0.04, 0.35)]
    w, h = 0.195, 0.19
    for i, ((title, body, edge, face), (x, y)) in enumerate(zip(stages, positions), 1):
        box(ax, x, y, w, h, face=face, edge=edge)
        label(ax, x + 0.045, y + h * 0.79, wrap(title, 22), size=6.9, weight="bold", ha="left")
        label(ax, x + w / 2, y + h * 0.37, wrap(body, 28), size=5.85, color=MUTED)
        number_dot(ax, x + 0.018, y + h - 0.018, str(i), edge)
    for i in range(3):
        arrow(ax, (positions[i][0] + w, positions[i][1] + h / 2), (positions[i + 1][0], positions[i + 1][1] + h / 2), color=SLATE, lw=1.0)
    arrow(ax, (0.842, 0.64), (0.842, 0.54), color=SLATE, lw=1.0)
    for i in range(4, 7):
        arrow(ax, (positions[i][0], positions[i][1] + h / 2), (positions[i + 1][0] + w, positions[i + 1][1] + h / 2), color=SLATE, lw=1.0)

    box(ax, 0.18, 0.175, 0.64, 0.095, title="Managed Agent review and correction", body="deterministic structure gates + AI semantic review; bounded recovery retains completed checkpoints", face=RED_L, edge=RED, title_size=7.2, body_size=6.0)
    for x in [0.372, 0.607, 0.842]:
        arrow(ax, (x, 0.64), (0.62, 0.27), color=RED, lw=0.65, dashed=True, rad=0.05)
    box(ax, 0.04, 0.055, 0.92, 0.075, title="Durable control plane", body="PostgreSQL job state · page fingerprints · concurrency limiter · safe error classification · background worker · automatic persistence", face=SLATE_L, edge=SLATE, title_size=6.9, body_size=5.95)
    label(ax, 0.5, 0.015, "Quick and advanced preparation share the same generators and quality contracts; quick mode changes interaction, not educational standards.", size=6.15, color=MUTED)
    return fig


def fig09_research_programme():
    fig, ax = canvas(4.65)
    panel_label(ax, "I")
    cols = [
        (0.04, "Study A — current", "Design & fidelity", "Artifact", "ADRs · source contracts · schemas · targeted tests", "Claim ceiling", "Mechanisms are executable and auditable", BLUE, BLUE_L),
        (0.365, "Study B — next", "Classroom feasibility", "2–4 classes", "logs · versions · observation · interviews · stimulated recall · adverse events", "Claim ceiling", "Mechanisms are understandable and enacted", TEAL, TEAL_L),
        (0.69, "Study C — later", "Comparative effects", "Cluster-randomised / matched", "generic GenAI vs guarded no-edit vs full reversible delegation", "Primary outcome", "Delayed unaided transfer", PURPLE, PURPLE_L),
    ]
    for x, phase, title, sample, evidence, ceiling_title, ceiling, edge, face in cols:
        pill(ax, x + 0.04, 0.84, 0.22, 0.055, phase, face=face, edge=edge, color=edge, size=6.7)
        box(ax, x, 0.34, 0.27, 0.45, face=face, edge=edge)
        label(ax, x + 0.025, 0.735, title, size=7.5, weight="bold", color=INK, ha="left")
        label(ax, x + 0.025, 0.665, sample, size=6.6, weight="bold", color=edge, ha="left")
        label(ax, x + 0.025, 0.565, wrap(evidence, 34), size=5.9, color=INK, ha="left")
        ax.plot([x + 0.02, x + 0.25], [0.49, 0.49], color=edge, lw=0.7)
        label(ax, x + 0.025, 0.455, ceiling_title, size=6.2, weight="bold", color=MUTED, ha="left")
        label(ax, x + 0.025, 0.39, wrap(ceiling, 30), size=6.25, color=INK, ha="left")
    arrow(ax, (0.31, 0.57), (0.355, 0.57), color=SLATE, lw=1.2)
    arrow(ax, (0.635, 0.57), (0.68, 0.57), color=SLATE, lw=1.2)
    box(ax, 0.17, 0.19, 0.66, 0.085, title="Evidence must advance before claims advance", body="implementation fidelity  →  enactment / feasibility  →  mechanism evidence  →  learning and workload effects", face=RED_L, edge=RED, title_color=RED, title_size=7.3, body_size=6.15)
    footer_note(ax, "Pre-register outcomes and adverse events; freeze code, prompts, model versions, schemas, and data definitions before classroom deployment.")
    return fig


def fig10_mechanism_model():
    fig, ax = canvas(5.0)
    panel_label(ax, "J")
    headers = [
        (0.04, 0.18, "Design feature", BLUE, BLUE_L),
        (0.285, 0.18, "Proximal mechanism", TEAL, TEAL_L),
        (0.53, 0.18, "Observable process", AMBER, AMBER_L),
        (0.775, 0.18, "Outcome to estimate", PURPLE, PURPLE_L),
    ]
    for x, w, text, edge, face in headers:
        box(ax, x, 0.86, w, 0.07, title=text, face=face, edge=edge, title_size=7.0, lw=0.8)
    rows = [
        ("Curriculum-anchored\nadaptation", "Relevant support without\npremature tracking", "routing validity · gap repair\nfull-lesson participation", "unaided mastery\nand transfer"),
        ("Teach–practice–feedback\nbefore terminal assessment", "Productive struggle +\nfeedback use", "attempts · explanations\nhint use · error correction", "conceptual achievement\nwithout dependence"),
        ("Explicit, reversible\nAI delegation", "Verification + calibrated\nepistemic control", "accept · modify · undo\nsource checking · revision", "artifact quality + agency\n+ ownership"),
        ("Evidence visibility +\nteacher final authority", "Teacher attention reaches\nactionable needs", "signal accuracy · uptake\nintervention timing", "orchestration quality\n+ workload"),
    ]
    y0 = 0.70
    colors = [(BLUE, BLUE_L), (TEAL, TEAL_L), (AMBER, AMBER_L), (RED, RED_L)]
    for ri, row in enumerate(rows):
        y = y0 - ri * 0.155
        edge, face = colors[ri]
        values = [row[0], row[1], row[2], row[3]]
        for ci, value in enumerate(values):
            x, w, *_ = headers[ci]
            box(ax, x, y, w, 0.105, body=value, face=face if ci == 0 else PAPER, edge=edge if ci == 0 else LINE, body_color=INK, body_size=6.2, radius=0.008, lw=0.85)
            if ci < 3:
                nx, *_ = headers[ci + 1]
                arrow(ax, (x + w + 0.005, y + 0.052), (nx - 0.005, y + 0.052), color=edge, lw=0.85, dashed=True)

    box(ax, 0.04, 0.035, 0.915, 0.075, title="Moderators and equity checks", body="prior knowledge · age / grade · task complexity · AI literacy · teacher enactment · language and accessibility · model reliability", face=SLATE_L, edge=SLATE, title_size=6.8, body_size=5.95)
    label(ax, 0.5, 0.135, "Dashed arrows are testable causal conjectures—not results of the current artifact audit.", size=6.25, weight="bold", color=RED)
    return fig


FIGURES: list[tuple[str, Callable[[], mpl.figure.Figure], str]] = [
    ("fig01_openpbl_conjecture_map", fig01_conjecture_map, "Educational conjecture map"),
    ("fig02_openpbl_system_architecture", fig02_system_architecture, "Layered system architecture"),
    ("fig03_openpbl_authority_topology", fig03_authority_topology, "Five-domain authority topology"),
    ("fig04_openpbl_adaptive_path", fig04_adaptive_path, "Curriculum-anchored adaptive path"),
    ("fig05_openpbl_evidence_lifecycle", fig05_evidence_lifecycle, "Evidence-gated six-stage lifecycle"),
    ("fig06_openpbl_reversible_delegation", fig06_reversible_delegation, "Reversible AI delegation sequence"),
    ("fig07_openpbl_orchestration_loop", fig07_orchestration_loop, "Learning analytics and teacher orchestration loop"),
    ("fig08_openpbl_generation_pipeline", fig08_generation_pipeline, "Durable course-generation pipeline"),
    ("fig09_openpbl_research_programme", fig09_research_programme, "Staged empirical research programme"),
    ("fig10_openpbl_mechanism_model", fig10_mechanism_model, "Hypothesised mechanism model"),
]


def make_contact_sheet() -> Path:
    cards: list[tuple[str, str, Image.Image]] = []
    thumb_w = 1120
    for slug, _, title in FIGURES:
        image = Image.open(PNG_DIR / f"{slug}.png").convert("RGB")
        scale = thumb_w / image.width
        resampling = getattr(Image, "Resampling", Image)
        thumb = image.resize((thumb_w, round(image.height * scale)), resampling.LANCZOS)
        cards.append((slug, title, thumb))
    row_h = max(img.height for _, _, img in cards) + 100
    sheet = Image.new("RGB", (thumb_w * 2 + 120, row_h * 5 + 60), "white")
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 28)
        small = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 22)
    except OSError:
        font = ImageFont.load_default()
        small = font
    for i, (slug, title, image) in enumerate(cards):
        col = i % 2
        row = i // 2
        x = 40 + col * (thumb_w + 40)
        y = 35 + row * row_h
        draw.text((x, y), f"{i + 1:02d}  {title}", fill=INK, font=font)
        draw.text((x, y + 36), slug, fill=MUTED, font=small)
        sheet.paste(image, (x, y + 70))
    path = PACK_DIR / "openpbl_figure_contact_sheet.png"
    sheet.save(path, dpi=(200, 200))
    return path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_outputs() -> dict:
    report: dict[str, object] = {"figures": [], "errors": []}
    for slug, _, title in FIGURES:
        svg = SVG_DIR / f"{slug}.svg"
        png = PNG_DIR / f"{slug}.png"
        pdf = PDF_DIR / f"{slug}.pdf"
        ET.parse(svg)
        svg_text = svg.read_text(encoding="utf-8")
        image = Image.open(png)
        item = {
            "slug": slug,
            "title": title,
            "png_px": [image.width, image.height],
            "svg_editable_text": "<text" in svg_text,
            "bytes": {"svg": svg.stat().st_size, "png": png.stat().st_size, "pdf": pdf.stat().st_size},
            "sha256": {"svg": sha256(svg), "png": sha256(png), "pdf": sha256(pdf)},
        }
        if image.width < 2000:
            report["errors"].append(f"{slug}: PNG width below 2000 px")
        if "<text" not in svg_text:
            report["errors"].append(f"{slug}: SVG text was converted to paths")
        report["figures"].append(item)
    report["counts"] = {"svg": len(list(SVG_DIR.glob("*.svg"))), "png": len(list(PNG_DIR.glob("*.png"))), "pdf": len(list(PDF_DIR.glob("*.pdf")))}
    return report


def main():
    for slug, builder, _ in FIGURES:
        export(builder(), slug)
    contact_sheet = make_contact_sheet()
    report = verify_outputs()
    report["contact_sheet"] = str(contact_sheet)
    (PACK_DIR / "build_manifest.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if report["errors"]:
        raise SystemExit("\n".join(report["errors"]))
    print(json.dumps({"counts": report["counts"], "contact_sheet": str(contact_sheet)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
