# -*- coding: utf-8 -*-
"""Builds the Coverboard feature guide PDF (colourful, interactive)."""
import sys
from datetime import date
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, Flowable, Frame, KeepTogether, NextPageTemplate,
                                PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle,
                                CondPageBreak)
from reportlab.platypus.tableofcontents import TableOfContents

import content as C

# ── Fonts ──────────────────────────────────────────────────────────────
SUP = "/System/Library/Fonts/Supplemental/"
pdfmetrics.registerFont(TTFont("Arial", SUP + "Arial.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Bold", SUP + "Arial Bold.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Italic", SUP + "Arial Italic.ttf"))
pdfmetrics.registerFont(TTFont("Arial-BoldItalic", SUP + "Arial Bold Italic.ttf"))
pdfmetrics.registerFont(TTFont("Mono", SUP + "Courier New.ttf"))
pdfmetrics.registerFont(TTFont("Mono-Bold", SUP + "Courier New Bold.ttf"))
pdfmetrics.registerFontFamily("Arial", normal="Arial", bold="Arial-Bold", italic="Arial-Italic", boldItalic="Arial-BoldItalic")
pdfmetrics.registerFontFamily("Mono", normal="Mono", bold="Mono-Bold", italic="Mono", boldItalic="Mono-Bold")

# ── Palette ────────────────────────────────────────────────────────────
INK = HexColor("#111827")
MUTED = HexColor("#4B5563")
FAINT = HexColor("#9CA3AF")
LINE = HexColor("#E5E7EB")
BRAND = HexColor("#2563EB")
BRAND_DARK = HexColor("#1E3A8A")
PAPER = HexColor("#F9FAFB")
LINK = HexColor("#1D4ED8")
AMBER_BG = HexColor("#FFFBEB")
AMBER_LINE = HexColor("#F59E0B")
AMBER_INK = HexColor("#92400E")
CH = {cid: HexColor(col) for cid, _, col, _ in C.CHAPTERS}
CH_TITLE = {cid: t for cid, t, _, _ in C.CHAPTERS}
CH_INTRO = {cid: i for cid, _, _, i in C.CHAPTERS}
DIAGRAM_COLOR = HexColor("#4F46E5")


def tint(c, f):
    """Mix a colour with white (f=0 → colour, f=1 → white)."""
    return colors.Color(c.red + (1 - c.red) * f, c.green + (1 - c.green) * f, c.blue + (1 - c.blue) * f)


# ── Styles ─────────────────────────────────────────────────────────────
S = {
    "body": ParagraphStyle("body", fontName="Arial", fontSize=9.5, leading=13.5, textColor=INK),
    "small": ParagraphStyle("small", fontName="Arial", fontSize=8.2, leading=11, textColor=MUTED),
    "tiny": ParagraphStyle("tiny", fontName="Arial", fontSize=7.4, leading=9.5, textColor=MUTED),
    "h1": ParagraphStyle("h1", fontName="Arial-Bold", fontSize=22, leading=27, textColor=INK, spaceAfter=6),
    "h2": ParagraphStyle("h2", fontName="Arial-Bold", fontSize=14, leading=18, textColor=INK, spaceBefore=4, spaceAfter=6),
    "label": ParagraphStyle("label", fontName="Arial-Bold", fontSize=7.6, leading=10, textColor=MUTED),
    "cardtitle": ParagraphStyle("cardtitle", fontName="Arial-Bold", fontSize=12.5, leading=15.5, textColor=colors.white),
    "badge": ParagraphStyle("badge", fontName="Arial-Bold", fontSize=7.4, leading=9.5, textColor=colors.white, alignment=2),
    "bullet": ParagraphStyle("bullet", fontName="Arial", fontSize=9, leading=12.6, textColor=INK, leftIndent=10, bulletIndent=0),
    "code": ParagraphStyle("code", fontName="Mono", fontSize=8, leading=10.5, textColor=INK),
    "codenote": ParagraphStyle("codenote", fontName="Arial", fontSize=8.2, leading=10.5, textColor=MUTED),
    "ref": ParagraphStyle("ref", fontName="Arial", fontSize=8.6, leading=11.8, textColor=INK, leftIndent=10, bulletIndent=0),
    "watch": ParagraphStyle("watch", fontName="Arial", fontSize=8.6, leading=12, textColor=AMBER_INK),
    "toc1": ParagraphStyle("toc1", fontName="Arial-Bold", fontSize=10.5, leading=15, textColor=INK, leftIndent=0),
    "toc2": ParagraphStyle("toc2", fontName="Arial", fontSize=8.8, leading=12, textColor=MUTED, leftIndent=14),
    "cell": ParagraphStyle("cell", fontName="Arial", fontSize=8.4, leading=11, textColor=INK),
    "cellb": ParagraphStyle("cellb", fontName="Arial-Bold", fontSize=8.4, leading=11, textColor=INK),
    "cellc": ParagraphStyle("cellc", fontName="Arial-Bold", fontSize=8.4, leading=11, textColor=colors.white, alignment=TA_CENTER),
}

PAGE_W, PAGE_H = A4
MARGIN = 16 * mm
CONTENT_W = PAGE_W - 2 * MARGIN


def link(url, text, color="#1D4ED8"):
    return f'<a href="{escape(url)}" color="{color}"><u>{escape(text)}</u></a>'


def code_link(path):
    return f'<a href="{escape(C.REPO + path)}" color="#1D4ED8">{escape(path)}</a>'


def feat_link(fid):
    f = next(x for x in C.FEATURES if x["id"] == fid)
    col = C_HEX[f["ch"]]
    return f'<a href="#f_{fid}" color="{col}"><b>{escape(f["title"])}</b></a>'


C_HEX = {cid: col for cid, _, col, _ in C.CHAPTERS}


# ── Document with TOC + bookmarks ──────────────────────────────────────
class GuideDoc(BaseDocTemplate):
    def __init__(self, path, **kw):
        super().__init__(path, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN,
                         topMargin=22 * mm, bottomMargin=18 * mm,
                         title="Coverboard — Feature Guide",
                         author="Coverboard", subject="Every feature, where it lives in the code, and the law behind it",
                         **kw)
        frame = Frame(MARGIN, 18 * mm, CONTENT_W, PAGE_H - 40 * mm, id="f", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        cover_frame = Frame(0, 0, PAGE_W, PAGE_H, id="c", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates([
            PageTemplate(id="cover", frames=[cover_frame], onPage=draw_cover),
            PageTemplate(id="normal", frames=[frame], onPage=draw_page),
        ])
        self.current_chapter = None

    def afterFlowable(self, fl):
        key = getattr(fl, "_bookmark", None)
        if not key:
            return
        level, text, name = key
        self.canv.bookmarkPage(name)
        self.canv.addOutlineEntry(text, name, level=level, closed=level == 0)
        if getattr(fl, "_toc", True):
            self.notify("TOCEntry", (level, text, self.page, name))
        if getattr(fl, "_sets_chapter", False):
            self.current_chapter = fl._chapter

    def beforeDocument(self):
        # multiBuild runs several passes; don't carry the last chapter over.
        self.current_chapter = None


class Anchor(Flowable):
    """Zero-size flowable that registers a bookmark/TOC entry."""
    def __init__(self, level, text, name, toc=True, chapter=None, sets_chapter=None):
        super().__init__()
        self._bookmark = (level, text, name)
        self._toc = toc
        self._chapter = chapter
        # Top-level anchors start a section: they set (or clear) the header colour.
        self._sets_chapter = (level == 0) if sets_chapter is None else sets_chapter
        self.width = self.height = 0

    def draw(self):
        pass


def draw_page(canv, doc):
    canv.saveState()
    ch = doc.current_chapter
    color = CH.get(ch, BRAND) if ch else BRAND
    # Top colour band
    canv.setFillColor(color)
    canv.rect(0, PAGE_H - 9 * mm, PAGE_W, 9 * mm, stroke=0, fill=1)
    canv.setFillColor(colors.white)
    canv.setFont("Arial-Bold", 8.5)
    canv.drawString(MARGIN, PAGE_H - 6 * mm, "COVERBOARD  ·  FEATURE GUIDE")
    title = CH_TITLE.get(ch, "") if ch else ""
    if title:
        canv.setFont("Arial", 8.5)
        canv.drawRightString(PAGE_W - MARGIN - 26 * mm, PAGE_H - 6 * mm, title)
    # "Contents" link (top right)
    canv.setFont("Arial-Bold", 8.5)
    canv.drawRightString(PAGE_W - MARGIN, PAGE_H - 6 * mm, "↑ Contents")
    canv.linkRect("", "toc", (PAGE_W - MARGIN - 22 * mm, PAGE_H - 9 * mm, PAGE_W - MARGIN, PAGE_H), relative=0, thickness=0)
    # Footer
    canv.setStrokeColor(LINE)
    canv.line(MARGIN, 13 * mm, PAGE_W - MARGIN, 13 * mm)
    canv.setFillColor(FAINT)
    canv.setFont("Arial", 7.5)
    canv.drawString(MARGIN, 9 * mm, f"Generated {date.today().strftime('%d %B %Y')} from the staging branch · links open the code on GitHub")
    canv.drawRightString(PAGE_W - MARGIN, 9 * mm, f"Page {doc.page}")
    canv.restoreState()


def draw_cover(canv, doc):
    canv.saveState()
    # Background bands, one per chapter colour
    canv.setFillColor(BRAND_DARK)
    canv.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    band_h = 9 * mm
    n_ch = len(C.CHAPTERS)
    for i, (cid, _, col, _) in enumerate(C.CHAPTERS):
        canv.setFillColor(HexColor(col))
        canv.rect(0, 40 * mm + (n_ch - 1 - i) * band_h, PAGE_W, band_h, stroke=0, fill=1)
    # Logo tile
    canv.setFillColor(colors.white)
    canv.roundRect(MARGIN + 4 * mm, PAGE_H - 52 * mm, 18 * mm, 18 * mm, 3 * mm, stroke=0, fill=1)
    canv.setFillColor(BRAND)
    canv.setFont("Arial-Bold", 16)
    canv.drawCentredString(MARGIN + 13 * mm, PAGE_H - 45.5 * mm, "CB")
    canv.setFillColor(colors.white)
    canv.setFont("Arial-Bold", 38)
    canv.drawString(MARGIN + 4 * mm, PAGE_H - 78 * mm, "Coverboard")
    canv.setFont("Arial-Bold", 22)
    canv.drawString(MARGIN + 4 * mm, PAGE_H - 92 * mm, "Feature Guide")
    canv.setFont("Arial", 12.5)
    canv.setFillColor(HexColor("#C7D2FE"))
    for i, line in enumerate([
        "Every feature in the app, where it lives in the code,",
        "and the GOV.UK or other reliable source behind it.",
    ]):
        canv.drawString(MARGIN + 4 * mm, PAGE_H - 106 * mm - i * 6.5 * mm, line)
    # Stats
    stats = [
        (str(len(C.FEATURES)), "features"),
        (str(sum(len(f["code"]) for f in C.FEATURES)), "code locations"),
        (str(len(C.R)), "legal & official sources"),
        ("7", "diagrams"),
    ]
    x = MARGIN + 4 * mm
    y = PAGE_H - 140 * mm
    for n, lab in stats:
        canv.setFillColor(colors.Color(1, 1, 1, alpha=0.12))
        canv.roundRect(x, y, 40 * mm, 20 * mm, 2.5 * mm, stroke=0, fill=1)
        canv.setFillColor(colors.white)
        canv.setFont("Arial-Bold", 20)
        canv.drawString(x + 4 * mm, y + 9.5 * mm, n)
        canv.setFont("Arial", 8.5)
        canv.drawString(x + 4 * mm, y + 4 * mm, lab)
        x += 44 * mm
    # Chapter legend on the bands
    canv.setFont("Arial-Bold", 9)
    for i, (cid, title, col, _) in enumerate(C.CHAPTERS):
        canv.setFillColor(colors.white)
        canv.drawString(MARGIN + 4 * mm, 40 * mm + (n_ch - 1 - i) * band_h + 3.2 * mm, f"{i + 1}.  {title}")
    canv.setFillColor(HexColor("#C7D2FE"))
    canv.setFont("Arial", 9)
    canv.drawString(MARGIN + 4 * mm, 26 * mm, f"Generated {date.today().strftime('%d %B %Y')} · staging branch")
    canv.drawString(MARGIN + 4 * mm, 20 * mm, "Interactive: click the contents, cross-links, code paths and references.")
    canv.restoreState()


# ── Flowables ──────────────────────────────────────────────────────────
class ChapterBanner(Flowable):
    def __init__(self, number, title, intro, color):
        super().__init__()
        self.number, self.title, self.intro, self.color = number, title, intro, color
        self.width = CONTENT_W
        p = Paragraph(escape(intro), ParagraphStyle("bi", parent=S["body"], textColor=colors.white, fontSize=10.5, leading=15))
        w, h = p.wrap(CONTENT_W - 16 * mm, 200)
        self.p = p
        self.height = 36 * mm + h

    def draw(self):
        c = self.canv
        c.setFillColor(self.color)
        c.roundRect(0, 0, self.width, self.height, 4 * mm, stroke=0, fill=1)
        c.setFillColor(colors.Color(1, 1, 1, alpha=0.18))
        c.circle(self.width - 18 * mm, self.height - 8 * mm, 26 * mm, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont("Arial-Bold", 10)
        c.drawString(8 * mm, self.height - 11 * mm, f"CHAPTER {self.number}")
        c.setFont("Arial-Bold", 22)
        c.drawString(8 * mm, self.height - 21 * mm, self.title)
        self.p.drawOn(c, 8 * mm, 7 * mm)


class Diagram(Flowable):
    def __init__(self, height, painter):
        super().__init__()
        self.width = CONTENT_W
        self.height = height
        self.painter = painter

    def draw(self):
        c = self.canv
        c.saveState()
        c.setFillColor(PAPER)
        c.setStrokeColor(LINE)
        c.roundRect(0, 0, self.width, self.height, 3 * mm, stroke=1, fill=1)
        self.painter(c, self.width, self.height)
        c.restoreState()


# Drawing helpers (canvas coordinates, origin bottom-left of the diagram)
def box(c, x, y, w, h, title, lines=(), fill="#FFFFFF", stroke="#4F46E5", title_color=None, radius=6, title_size=8.6, line_size=7.2, header=True):
    stroke_c = HexColor(stroke)
    c.setFillColor(HexColor(fill))
    c.setStrokeColor(stroke_c)
    c.setLineWidth(1.1)
    c.roundRect(x, y, w, h, radius, stroke=1, fill=1)
    if header:
        c.setFillColor(stroke_c)
        c.roundRect(x, y + h - 15, w, 15, radius, stroke=0, fill=1)
        c.rect(x, y + h - 15, w, 8, stroke=0, fill=1)
        c.setFillColor(HexColor(title_color) if title_color else colors.white)
        c.setFont("Arial-Bold", title_size)
        c.drawCentredString(x + w / 2, y + h - 11, title)
        ty = y + h - 15 - 10
    else:
        c.setFillColor(INK)
        c.setFont("Arial-Bold", title_size)
        c.drawCentredString(x + w / 2, y + h / 2 + (len(lines) * line_size) / 2 - 2, title)
        ty = y + h / 2 + (len(lines) * line_size) / 2 - 2 - (line_size + 3)
    c.setFillColor(MUTED)
    c.setFont("Arial", line_size)
    for ln in lines:
        if ln.startswith("@"):
            c.setFont("Mono", line_size - 0.4)
            c.drawCentredString(x + w / 2, ty, ln[1:])
            c.setFont("Arial", line_size)
        else:
            c.drawCentredString(x + w / 2, ty, ln)
        ty -= line_size + 2.6


def arrow(c, x1, y1, x2, y2, color="#6B7280", label=None, width=1.2, dash=None, label_dx=0, label_dy=4):
    import math
    col = HexColor(color)
    c.setStrokeColor(col)
    c.setFillColor(col)
    c.setLineWidth(width)
    if dash:
        c.setDash(*dash)
    c.line(x1, y1, x2, y2)
    c.setDash()
    ang = math.atan2(y2 - y1, x2 - x1)
    L = 6
    p = c.beginPath()
    p.moveTo(x2, y2)
    p.lineTo(x2 - L * math.cos(ang - 0.42), y2 - L * math.sin(ang - 0.42))
    p.lineTo(x2 - L * math.cos(ang + 0.42), y2 - L * math.sin(ang + 0.42))
    p.close()
    c.drawPath(p, stroke=0, fill=1)
    if label:
        c.setFont("Arial", 6.6)
        c.setFillColor(MUTED)
        c.drawCentredString((x1 + x2) / 2 + label_dx, (y1 + y2) / 2 + label_dy, label)


def caption(c, w, h, text):
    c.setFillColor(INK)
    c.setFont("Arial-Bold", 10)
    c.drawString(10, h - 16, text)


# ── Diagrams ───────────────────────────────────────────────────────────
def d_architecture(c, w, h):
    caption(c, w, h, "System architecture")
    # People
    box(c, 12, h - 124, 92, 80, "People", ["Staff (phone/browser)", "Managers", "Admins", "Visitors (website)", "— over HTTPS —"], stroke="#2563EB")
    # Vercel container
    vx, vy, vw, vh = 122, 60, 250, h - 92
    c.setStrokeColor(HexColor("#111827")); c.setDash(4, 3); c.setLineWidth(1)
    c.roundRect(vx, vy, vw, vh, 8, stroke=1, fill=0); c.setDash()
    c.setFillColor(INK); c.setFont("Arial-Bold", 8.4)
    c.drawString(vx + 8, vy + vh - 12, "Vercel  ·  region lhr1 (London)")
    box(c, vx + 10, vy + vh - 72, 112, 50, "Pages (React)", ["@src/app/(dashboard)", "@src/app/(auth) …", "@src/components"], stroke="#0D9488")
    box(c, vx + 128, vy + vh - 72, 112, 50, "API routes", ["@src/app/api/**/route.ts", "auth via NextAuth"], stroke="#0D9488")
    box(c, vx + 10, vy + 62, 230, 52, "Business rules  —  src/lib", ["leave-requests/ · shiftCover · regionCover · cover-offers", "uk-compliance · holidayPay · smpCalculator · working-week", "fit-notes · sickness-spells · planFeatures · audit"], stroke="#4F46E5")
    box(c, vx + 10, vy + 10, 112, 44, "Middleware", ["@src/middleware.ts", "route access, plan lock"], stroke="#6B7280")
    box(c, vx + 128, vy + 10, 112, 44, "Cron jobs", ["@vercel.json", "digest · fit notes · deletions"], stroke="#6B7280")
    arrow(c, 104, h - 84, vx + 10, vy + vh - 47, "#2563EB")
    arrow(c, vx + 66, vy + vh - 72, vx + 66, vy + 114, "#4F46E5")
    arrow(c, vx + 184, vy + vh - 72, vx + 184, vy + 114, "#4F46E5")
    # Database
    box(c, vx + 50, 8, 150, 40, "Postgres (Supabase, London)", ["via Prisma — @prisma/schema.prisma"], stroke="#059669")
    arrow(c, vx + 125, vy + 62, vx + 125, 48, "#059669")
    # External services
    ex = vx + vw + 18
    services = [("Stripe", "billing, tax, webhooks", "#EA580C"), ("Resend", "all email", "#DB2777"),
                ("Upstash Redis", "auth rate limits", "#D97706"), ("Sentry", "error tracking", "#E11D48"),
                ("PostHog", "analytics (consent)", "#9333EA"), ("Slack · Jira", "integrations", "#0891B2")]
    sy = h - 50
    for name, sub, col in services:
        box(c, ex, sy, w - ex - 12, 30, name, [sub], stroke=col, title_size=8, line_size=6.8)
        arrow(c, vx + vw, sy + 15, ex, sy + 15, col, width=0.9)
        sy -= 36


def d_codemap(c, w, h):
    caption(c, w, h, "Code map — where things live")
    cols = [
        ("src/app", "#0D9488", ["(auth)  sign-in, sign-up, reset", "(dashboard)  the app", "(onboarding)  setup wizard", "api/  every API route", "guides · tools · pricing", "sitemap.ts · robots.ts"]),
        ("src/components", "#2563EB", ["leave/  requests, cover, fit notes", "dashboard/  cards & widgets", "team/  members, patterns", "reports/  report sections", "calendar/ · cover/ · settings/", "landing/ · layout/ · ui/"]),
        ("src/lib", "#4F46E5", ["leave-requests/  create, review…", "shiftCover · regionCover", "cover-offers · cover-shifts", "uk-compliance · holidayPay", "smpCalculator · working-week", "audit · planFeatures · email"]),
        ("prisma · config", "#059669", ["prisma/schema.prisma", "prisma/migrations/", "src/config/pricing.ts", "next.config.ts (headers)", "vercel.json (region, crons)", "marketing/  SEO guides (.md)"]),
    ]
    cw = (w - 20 - 3 * 10) / 4
    x = 10
    for title, col, items in cols:
        box(c, x, 12, cw, h - 40, title, [], stroke=col, title_size=9.5)
        y = h - 70
        for it in items:
            c.setFillColor(tint(HexColor(col), 0.88))
            c.roundRect(x + 6, y - 4, cw - 12, 18, 4, stroke=0, fill=1)
            c.setFillColor(INK); c.setFont("Arial", 7.1)
            c.drawString(x + 11, y + 2, it)
            y -= 24
        x += cw + 10


def d_datamodel(c, w, h):
    caption(c, w, h, "Data model (main tables)")
    colw = 112
    xs = [10, 10 + (colw + 14), 10 + 2 * (colw + 14), 10 + 3 * (colw + 14)]

    def ent(x, ytop, name, fields, col):
        hh = 18 + 10 * len(fields) + 4
        box(c, x, ytop - hh, colw, hh, name, ["@" + f for f in fields], stroke=col, line_size=6.6, title_size=8)
        return (x, ytop - hh, colw, hh)

    def pt(e, side):
        x, y, ww, hh = e
        return {"r": (x + ww, y + hh / 2), "l": (x, y + hh / 2), "t": (x + ww / 2, y + hh), "b": (x + ww / 2, y)}[side]

    def rel(a, sa, b, sb, label=None, dx=0, dy=3):
        (x1, y1), (x2, y2) = pt(a, sa), pt(b, sb)
        arrow(c, x1, y1, x2, y2, "#6B7280", label, width=0.9, label_dx=dx, label_dy=dy)

    # Column 1 — organisation & leave setup
    org = ent(xs[0], h - 36, "Organization", ["plan, regionsEnabled", "ukBankHolidayRegion", "onboardingCompleted"], "#2563EB")
    lt = ent(xs[0], h - 136, "LeaveType", ["defaultDays", "allowanceUnit", "applyProRata"], "#0D9488")
    lp = ent(xs[0], h - 214, "LeavePolicy", ["countryCode", "annualAllowance"], "#0D9488")
    au = ent(xs[0], h - 268, "AuditLog", ["action, actor", "metadata (org-wide)"], "#0891B2")
    # Column 2 — people & absence
    user = ent(xs[1], h - 36, "User", ["role, employmentType", "daysWorkedPerWeek", "workCountry", "averageWeeklyEarnings", "rightToWorkVerified"], "#2563EB")
    lr = ent(xs[1], h - 150, "LeaveRequest", ["start/endDate, status", "sspDaysPaid, hoursBooked", "evidenceProvided"], "#E11D48")
    fn = ent(xs[1], h - 236, "FitNote", ["coversFrom/To", "receivedOn"], "#E11D48")
    # Column 3 — cover
    rg = ent(xs[2], h - 70, "Region (location)", ["minCover", "coverWeekends/BH"], "#059669")
    st = ent(xs[2], h - 136, "ShiftType", ["start/endTime", "minCoverByWeekday"], "#059669")
    wp = ent(xs[2], h - 202, "WorkPattern", ["userId, weekday", "effectiveFrom/To"], "#059669")
    co = ent(xs[2], h - 268, "CoverOffer", ["user, shift, date", "PENDING → ACCEPTED…"], "#059669")
    # Column 4 — per-person pay data (grouped)
    gx, gtop, gbot = xs[3], h - 70, h - 262
    c.setStrokeColor(HexColor("#D97706")); c.setDash(3, 2); c.setLineWidth(0.9)
    c.roundRect(gx - 4, gbot, colw + 8, gtop - gbot + 12, 6, stroke=1, fill=0); c.setDash()
    c.setFillColor(HexColor("#92400E")); c.setFont("Arial-Bold", 7.6)
    c.drawString(gx, gtop + 2, "Per person (pay & hours)")
    we = ent(gx, gtop - 6, "WeeklyEarning", ["grossEarnings", "isZeroPayWeek"], "#D97706")
    wh = ent(gx, gtop - 66, "UserWeeklyHours", ["weekStartDate", "hoursWorked"], "#D97706")
    cb = ent(gx, gtop - 126, "LeaveCarryOverBalance", ["daysCarried, expiresAt"], "#D97706")

    rel(org, "r", user, "l", "people", dy=5)
    rel(org, "b", lt, "t", "leave types", dx=24, dy=0)
    rel(lt, "b", lp, "t", "per country", dx=24, dy=0)
    rel(user, "b", lr, "t", "books", dx=16, dy=0)
    rel(lr, "b", fn, "t", "fit notes", dx=20, dy=0)
    rel(user, "r", rg, "l", "works at", dy=6)
    rel(rg, "b", st, "t", "shifts", dx=14, dy=0)
    rel(st, "b", wp, "t", "worked by", dx=20, dy=0)
    rel(wp, "b", co, "t", "extra cover", dx=24, dy=0)
    # User → per-person group (elbow over the top of column 3)
    ux, uy = user[0] + user[2] - 14, user[1] + user[3]
    c.setStrokeColor(HexColor("#6B7280")); c.setLineWidth(0.9)
    c.line(ux, uy, ux, h - 30); c.line(ux, h - 30, gx + colw / 2, h - 30)
    arrow(c, gx + colw / 2, h - 30, gx + colw / 2, gtop + 12, "#6B7280", width=0.9)


def d_requestflow(c, w, h):
    caption(c, w, h, "Leave request lifecycle")
    steps = [
        ("Entry", ["Request form", "Slack /requestleave", "Log sickness"], "#2563EB"),
        ("createLeaveRequest()", ["notice · evidence", "balance warning", "UPL cap · SMP", "SSP spell · holiday rate"], "#0D9488"),
        ("Status", ["PENDING", "or APPROVED", "(sickness logged,", "sole approver)"], "#6B7280"),
        ("reviewLeaveRequest()", ["no self-approval", "cover override", "approve / reject"], "#9333EA"),
        ("Effects", ["Bradford score", "emails · Slack", "audit log", "balances, reports"], "#E11D48"),
    ]
    n = len(steps)
    bw = (w - 20 - (n - 1) * 16) / n
    x = 10
    for i, (t, ls, col) in enumerate(steps):
        box(c, x, 26, bw, h - 56, t, ls, stroke=col, title_size=7.8)
        if i < n - 1:
            arrow(c, x + bw, 26 + (h - 56) / 2, x + bw + 16, 26 + (h - 56) / 2, "#374151")
        x += bw + 16
    c.setFillColor(MUTED); c.setFont("Arial-Italic", 7.2)
    c.drawString(12, 11, "Files: src/lib/leave-requests/create.ts · review.ts · rules.ts · ssp-spell.ts · bradford.ts")


def d_coverflow(c, w, h):
    caption(c, w, h, "From a 7:10am sick call to a covered shift")
    row1 = [("1  Sick call", ["Manager logs it", "@log-sickness-form.tsx"], "#E11D48"),
            ("2  Cover engine", ["short shifts found", "@shiftCover.ts"], "#059669"),
            ("3  Who could cover", ["not on leave, rested,", "hours this week"], "#059669"),
            ("4  Ask", ["CoverOffer + email", "@cover-offers.ts"], "#2563EB")]
    row2 = [("5  Accept", ["re-checked, locked", "first accept wins"], "#2563EB"),
            ("6  Covered", ["counts on the shift", "others → FILLED"], "#059669"),
            ("7  Everywhere", ["calendar · payroll", "weekly hours · updates"], "#D97706"),
            ("Undo", ["manager withdraws", "or staff drop out"], "#6B7280")]
    bw = (w - 20 - 3 * 18) / 4
    bh = (h - 70) / 2
    y1 = 18 + bh + 22
    for i, (t, ls, col) in enumerate(row1):
        x = 10 + i * (bw + 18)
        box(c, x, y1, bw, bh, t, ls, stroke=col, title_size=8)
        if i < 3:
            arrow(c, x + bw, y1 + bh / 2, x + bw + 18, y1 + bh / 2, "#374151")
    # down arrow from step 4 to step 5 (right side)
    xr = 10 + 3 * (bw + 18) + bw / 2
    for i, (t, ls, col) in enumerate(row2):
        x = 10 + (3 - i) * (bw + 18)
        box(c, x, 18, bw, bh, t, ls, stroke=col, title_size=8)
        if i < 3:
            arrow(c, x, 18 + bh / 2, x - 18, 18 + bh / 2, "#374151")
    arrow(c, xr, y1, xr, 18 + bh, "#374151")


def d_workingweek(c, w, h):
    caption(c, w, h, "The working week feeds every pay & entitlement calculation")
    ins = [("WorkPattern", ["weekdays scheduled", "(shift mode)"]), ("daysWorkedPerWeek", ["holiday fallback"]), ("qualifyingDaysPerWeek", ["SSP fallback"])]
    y = h - 72
    for t, ls in ins:
        box(c, 12, y, 128, 44, t, ls, stroke="#2563EB", title_size=8)
        arrow(c, 140, y + 22, 196, h / 2 - 2, "#2563EB", width=0.9)
        y -= 58
    box(c, 196, h / 2 - 36, 122, 70, "getWorkingWeek()", ["@working-week-server.ts", "weekdays | null", "daysPerWeek"], stroke="#4F46E5", title_size=8.4)
    outs = [("Holiday pay day rate", "week ÷ working days", "#D97706"),
            ("Annual entitlement", "min(28, 5.6 × days)", "#0D9488"),
            ("Days taken", "only days they work", "#0D9488"),
            ("SSP", "qualifying days & rate", "#E11D48"),
            ("Family leave", "weeks × working days", "#9333EA"),
            ("Unpaid parental cap", "4 × working days", "#9333EA")]
    oy = h - 52
    for t, sub, col in outs:
        box(c, w - 162, oy, 150, 30, t, [sub], stroke=col, title_size=7.8, line_size=6.8)
        arrow(c, 318, h / 2, w - 162, oy + 15, col, width=0.9)
        oy -= 36


def d_crons(c, w, h):
    caption(c, w, h, "Scheduled jobs (vercel.json, times in UTC)")
    jobs = [("Weekly digest", "Mondays 08:00", "Who's off this week, to everyone opted in", "/api/cron/weekly-digest", "#2563EB"),
            ("Fit-note alerts", "Mondays 09:00", "Overdue fit notes to admins/managers (Growth+)", "/api/cron/fit-note-alerts", "#E11D48"),
            ("Process deletions", "Daily 02:00", "Deletes accounts past their 30-day grace", "/api/cron/process-deletions", "#0891B2"),
            ("Monthly compliance", "1st of month 09:00", "Compliance snapshot email (Scale+)", "/api/cron/monthly-compliance-report", "#D97706")]
    y = h - 58
    for t, when, what, path, col in jobs:
        box(c, 12, y, w - 24, 34, "", [], stroke=col, header=False)
        c.setFillColor(HexColor(col)); c.roundRect(12, y, 6, 34, 3, stroke=0, fill=1)
        c.setFillColor(INK); c.setFont("Arial-Bold", 9); c.drawString(26, y + 20, t)
        c.setFont("Arial-Bold", 8); c.setFillColor(HexColor(col)); c.drawString(150, y + 20, when)
        c.setFillColor(MUTED); c.setFont("Arial", 7.8); c.drawString(26, y + 7, what)
        c.setFont("Mono", 7.4); c.drawRightString(w - 22, y + 7, path)
        y -= 42


DIAGRAMS = [
    ("architecture", "System architecture", 300, d_architecture),
    ("codemap", "Code map", 210, d_codemap),
    ("datamodel", "Data model", 320, d_datamodel),
    ("requestflow", "Leave request lifecycle", 150, d_requestflow),
    ("coverflow", "Sick call to covered shift", 210, d_coverflow),
    ("workingweek", "The working week", 250, d_workingweek),
    ("crons", "Scheduled jobs", 205, d_crons),
]


# ── Feature card ───────────────────────────────────────────────────────
def feature_card(f, color):
    hexcol = C_HEX[f["ch"]]
    light = tint(color, 0.93)
    rows, styles = [], []
    head = Table([[Paragraph(f'<a name="f_{f["id"]}"/>' + escape(f["title"]), S["cardtitle"]),
                   Paragraph(escape(f["plan"]), S["badge"])]],
                 colWidths=[CONTENT_W * 0.68 - 12, CONTENT_W * 0.32 - 12])
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    rows.append([head]); styles += [("BACKGROUND", (0, 0), (0, 0), color), ("TOPPADDING", (0, 0), (0, 0), 8), ("BOTTOMPADDING", (0, 0), (0, 0), 8)]

    rows.append([Paragraph(escape(f["summary"]), S["body"])])

    def label(t):
        return Paragraph(f'<font color="{hexcol}">■</font>  {t.upper()}', S["label"])

    how = [label("How it works")] + [Paragraph(escape(b), S["bullet"], bulletText="•") for b in f["how"]]
    rows.append([how])

    code_rows = [[Paragraph(code_link(p), S["code"]), Paragraph(escape(n), S["codenote"])] for p, n in f["code"]]
    ct = Table(code_rows, colWidths=[CONTENT_W * 0.56 - 12, CONTENT_W * 0.44 - 12])
    ct.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                            ("TOPPADDING", (0, 0), (-1, -1), 1.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
                            ("LINEBELOW", (0, 0), (-1, -2), 0.3, LINE)]))
    rows.append([[label("Where in the code"), Spacer(1, 3), ct]])

    refs = []
    for k in f["refs"]:
        lab, url = C.R[k]
        refs.append(Paragraph(link(url, lab), S["ref"], bulletText="›"))
    for k in f.get("docs", []):
        lab, url = C.D[k]
        refs.append(Paragraph(link(url, lab) + ' <font color="#9CA3AF">(developer docs)</font>', S["ref"], bulletText="›"))
    if refs:
        rows.append([[label("References")] + refs])

    if f.get("watch"):
        w = Table([[Paragraph("<b>Watch out:</b> " + escape(f["watch"]), S["watch"])]], colWidths=[CONTENT_W - 24])
        w.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), AMBER_BG), ("LINEBEFORE", (0, 0), (0, -1), 2.5, AMBER_LINE),
                               ("LEFTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
        rows.append([w])

    if f.get("related"):
        rel = "  ·  ".join(feat_link(r) for r in f["related"])
        rows.append([Paragraph('<font color="#6B7280"><b>RELATED:</b></font>  ' + rel, S["small"])])

    t = Table(rows, colWidths=[CONTENT_W])
    base = [("BOX", (0, 0), (-1, -1), 0.8, tint(color, 0.55)),
            ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ("TOPPADDING", (0, 1), (-1, -1), 6), ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
            ("BACKGROUND", (0, 1), (0, 1), light)]
    t.setStyle(TableStyle(base + styles))
    return t


# ── Story ──────────────────────────────────────────────────────────────
def build(out):
    doc = GuideDoc(out)
    story = [NextPageTemplate("normal"), PageBreak()]

    # How to read
    story += [Anchor(0, "How to read this guide", "howto"), Paragraph("How to read this guide", S["h1"])]
    story.append(Paragraph(
        "Each feature has a card with what it does, how it works, <b>where it lives in the code</b> and the "
        "<b>GOV.UK or other reliable source</b> behind it. Everything blue is clickable: code paths open the file on GitHub "
        "(staging branch), references open the source, and feature names jump to that card. Use the bookmarks panel or "
        "the <b>↑ Contents</b> link at the top of every page to move around.", S["body"]))
    story.append(Spacer(1, 10))
    legend = [[Paragraph(f'<font color="white"><b>{escape(t)}</b></font>', S["cell"]), Paragraph(escape(i), S["cell"])]
              for cid, t, col, i in C.CHAPTERS]
    lt = Table(legend, colWidths=[52 * mm, CONTENT_W - 52 * mm])
    ls = [("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
          ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE)]
    for i, (cid, t, col, _) in enumerate(C.CHAPTERS):
        ls.append(("BACKGROUND", (0, i), (0, i), HexColor(col)))
    lt.setStyle(TableStyle(ls))
    story += [Paragraph("Colour key", S["h2"]), lt, Spacer(1, 10)]
    keyrows = [
        [Paragraph("<b>Plan badge</b>", S["cell"]), Paragraph("Top-right of each card: which plan the feature needs (e.g. “Growth+” = Growth, Scale and Pro).", S["cell"])],
        [Paragraph("<b>Watch out</b>", S["cell"]), Paragraph("Amber boxes flag caveats you should know about, including calculations fixed recently.", S["cell"])],
        [Paragraph("<b>Developer docs</b>", S["cell"]), Paragraph("Links marked this way are technical documentation (Stripe, Vercel…), not legal sources.", S["cell"])],
        [Paragraph("<b>Not legal advice</b>", S["cell"]), Paragraph("The app implements published rules; check figures with your payroll provider before paying.", S["cell"])],
    ]
    kt = Table(keyrows, colWidths=[38 * mm, CONTENT_W - 38 * mm])
    kt.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
                            ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    story += [Paragraph("Symbols", S["h2"]), kt, PageBreak()]

    # Table of contents
    toc = TableOfContents()
    toc.levelStyles = [S["toc1"], S["toc2"]]
    toc.dotsMinLevel = 0
    story += [Anchor(0, "Contents", "toc", toc=False), Paragraph("Contents", S["h1"]), toc, PageBreak()]

    # Diagrams chapter
    story += [Anchor(0, "Architecture & diagrams", "ch_diagrams", chapter=None),
              ChapterBanner("0", "Architecture & diagrams", "How Coverboard fits together: the system, the code layout, the data model and the main flows. Read these first to get your bearings.", DIAGRAM_COLOR),
              Spacer(1, 12)]
    for did, title, hgt, painter in DIAGRAMS:
        block = [Anchor(1, title, "d_" + did), Diagram(hgt, painter), Spacer(1, 5),
                 Paragraph(escape(C.DIAGRAM_NOTES[did]), S["small"]), Spacer(1, 14)]
        story.append(CondPageBreak(hgt + 60))
        story += block

    # Plans matrix
    story.append(PageBreak())
    story += [Anchor(1, "Plans & features matrix", "d_plans"), Paragraph("Plans & features", S["h2"]),
              Paragraph("Feature flags from <font face='Mono'>src/lib/planFeatures.ts</font>. Trials get everything; a locked account gets nothing. Cover (locations, shifts, suggestions and cover requests) is on every plan.", S["small"]), Spacer(1, 8)]
    flags = [("Annual leave, requests, calendar, emails", "free"), ("Pro-rata, carry-over rules, bank holiday config", "starter"),
             ("SSP, parental tracker, KIT/SPLIT, right to work", "growth"), ("Bradford, holiday pay, earnings history", "growth"),
             ("Absence analytics, compliance reports, custom types", "scale"), ("Priority support", "scale"), ("Audit log viewer & exports", "pro")]
    tiers = ["free", "starter", "growth", "scale", "pro"]
    tier_col = {"free": "#6B7280", "starter": "#2563EB", "growth": "#0D9488", "scale": "#D97706", "pro": "#9333EA"}
    data = [[Paragraph("<b>Feature</b>", S["cellb"])] + [Paragraph(t.title(), S["cellc"]) for t in tiers]]
    st = [("BACKGROUND", (i + 1, 0), (i + 1, 0), HexColor(tier_col[t])) for i, t in enumerate(tiers)]
    for r, (lab, min_tier) in enumerate(flags, start=1):
        row = [Paragraph(escape(lab), S["cell"])]
        for i, t in enumerate(tiers):
            on = tiers.index(t) >= tiers.index(min_tier)
            row.append(Paragraph("Included" if on else "—", ParagraphStyle("pc", parent=S["cell"], alignment=TA_CENTER, textColor=colors.white if on else FAINT, fontName="Arial-Bold" if on else "Arial")))
            if on:
                st.append(("BACKGROUND", (i + 1, r), (i + 1, r), tint(HexColor(tier_col[t]), 0.15)))
        data.append(row)
    pt = Table(data, colWidths=[CONTENT_W - 5 * 23 * mm] + [23 * mm] * 5)
    pt.setStyle(TableStyle(st + [("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("GRID", (0, 0), (-1, -1), 0.4, colors.white),
                                 ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                                 ("BACKGROUND", (0, 1), (0, -1), PAPER)]))
    story += [pt, Spacer(1, 6), Paragraph("Prices: Free £0 (up to 5 employees), Starter £19/mo (up to 15), Growth £49/mo, Scale £99/mo, Pro £179/mo — see <font face='Mono'>src/config/pricing.ts</font>.", S["tiny"])]

    # Feature chapters
    for n, (cid, title, col, intro) in enumerate(C.CHAPTERS, start=1):
        color = HexColor(col)
        story.append(PageBreak())
        story += [Anchor(0, f"{n}. {title}", "ch_" + cid, chapter=cid), ChapterBanner(n, title, intro, color), Spacer(1, 12)]
        # Mini index of this chapter
        feats = [f for f in C.FEATURES if f["ch"] == cid]
        idx = "  ·  ".join(feat_link(f["id"]) for f in feats)
        story += [Paragraph("<b>In this chapter:</b>  " + idx, S["small"]), Spacer(1, 12)]
        for f in feats:
            story += [CondPageBreak(70 * mm), Anchor(1, f["title"], "t_" + f["id"]), feature_card(f, color), Spacer(1, 12)]

    # Known limitations
    story.append(PageBreak())
    lim_col = HexColor("#6B7280")
    story += [Anchor(0, f"{len(C.CHAPTERS) + 1}. Known limitations", "ch_limits", chapter=None),
              ChapterBanner(len(C.CHAPTERS) + 1, "Known limitations", "What the app doesn't do yet, or does with an assumption you should know about. Keep this list honest — it's what protects you when you make compliance claims.", lim_col),
              Spacer(1, 12)]
    for t, body in C.LIMITATIONS:
        lt2 = Table([[Paragraph(f"<b>{escape(t)}</b>", S["body"])], [Paragraph(escape(body), S["small"])]], colWidths=[CONTENT_W])
        lt2.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), AMBER_BG), ("LINEBEFORE", (0, 0), (0, -1), 3, AMBER_LINE),
                                 ("LEFTPADDING", (0, 0), (-1, -1), 10), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
        story += [KeepTogether([lt2]), Spacer(1, 8)]

    # Reference index
    story.append(PageBreak())
    story += [Anchor(0, f"{len(C.CHAPTERS) + 2}. Reference index", "ch_refs", chapter=None),
              ChapterBanner(len(C.CHAPTERS) + 2, "Reference index", "Every source cited in this guide, with the features that rely on it. All links were checked when the guide was generated.", BRAND_DARK),
              Spacer(1, 12)]
    groups = [("Legislation", lambda u: "legislation.gov.uk" in u), ("GOV.UK guidance", lambda u: "www.gov.uk" in u),
              ("Acas", lambda u: "acas.org.uk" in u), ("Information Commissioner's Office (UK GDPR)", lambda u: "ico.org.uk" in u)]
    for gname, pred in groups:
        items = [(k, v) for k, v in C.R.items() if pred(v[1])]
        if not items:
            continue
        story.append(Paragraph(gname, S["h2"]))
        rows = []
        for k, (lab, url) in sorted(items, key=lambda kv: kv[1][0]):
            users = [f for f in C.FEATURES if k in f["refs"]]
            uses = ", ".join(f'<a href="#f_{f["id"]}" color="{C_HEX[f["ch"]]}">{escape(f["title"])}</a>' for f in users) or "—"
            rows.append([Paragraph(link(url, lab), S["cell"]), Paragraph(uses, S["tiny"])])
        t = Table(rows, colWidths=[CONTENT_W * 0.55, CONTENT_W * 0.45])
        t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
                               ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
        story += [t, Spacer(1, 8)]
    story.append(Paragraph("Developer documentation", S["h2"]))
    rows = []
    for k, (lab, url) in C.D.items():
        users = [f for f in C.FEATURES if k in f.get("docs", [])]
        uses = ", ".join(f'<a href="#f_{f["id"]}" color="{C_HEX[f["ch"]]}">{escape(f["title"])}</a>' for f in users) or "Architecture"
        rows.append([Paragraph(link(url, lab), S["cell"]), Paragraph(uses, S["tiny"])])
    t = Table(rows, colWidths=[CONTENT_W * 0.55, CONTENT_W * 0.45])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
                           ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    story.append(t)

    doc.multiBuild(story, canvasmaker=_OutlineCanvas)


from reportlab.pdfgen.canvas import Canvas


class _OutlineCanvas(Canvas):
    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.showOutline()


if __name__ == "__main__":
    build(sys.argv[1])
    print("built", sys.argv[1])
