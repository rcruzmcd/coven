/* eslint-disable @next/next/no-img-element -- Satori renders plain <img>;
   next/image emits a browser srcset and never runs here. */
import type { CSSProperties, ReactNode } from "react";
import {
  STORY_CONTENT_WIDTH,
  STORY_HEIGHT,
  STORY_SAFE_BOTTOM,
  STORY_SAFE_TOP,
  STORY_SIDE,
  STORY_WIDTH,
  type DetailsFrame,
  type FittedText,
  type GetItFrame,
  type SpotlightFrame,
  type StoryHeader,
  type StoryModel,
  type StoryTheme,
} from "@/lib/social-content/story-frames";
import { STORY_FONT } from "@/lib/social-content/story-fonts";

/**
 * One Gear Spotlight frame as Satori markup (#1908), after the reference
 * design. It draws what `buildStoryFrame` decided and decides nothing itself.
 * Satori is flexbox only: every element with children sets `display: flex`.
 */

/**
 * A frame's top and bottom groups, pushed apart. A fragment would not do:
 * Satori lays a fragment's children out as a row of its parent.
 */
const FRAME_BODY: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  flexGrow: 1,
  minHeight: 0,
};

const EYEBROW: CSSProperties = {
  fontFamily: STORY_FONT.heading,
  fontWeight: 700,
  fontSize: 30,
  letterSpacing: "0.2em",
  textTransform: "uppercase",
};

function gradient(stops: readonly string[]): string {
  if (stops.length === 1) return stops[0];
  const step = 100 / (stops.length - 1);
  return `linear-gradient(90deg, ${stops
    .map((stop, i) => `${stop} ${Math.round(i * step)}%`)
    .join(", ")})`;
}

function Header({ header, theme }: { header: StoryHeader; theme: StoryTheme }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        height: 100,
      }}
    >
      {header.logoUrl ? (
        <img
          src={header.logoUrl}
          alt=""
          height={100}
          style={{ maxWidth: 400, height: 100, objectFit: "contain" }}
        />
      ) : (
        <div
          style={{
            display: "flex",
            fontFamily: STORY_FONT.heading,
            fontWeight: 700,
            fontSize: 40,
            color: theme.text,
            maxWidth: 600,
          }}
        >
          {header.orgName}
        </div>
      )}
      {header.occurrenceLabel && (
        <div style={{ ...EYEBROW, display: "flex", color: theme.accent }}>
          {header.occurrenceLabel}
        </div>
      )}
    </div>
  );
}

function AccentBar({ theme }: { theme: StoryTheme }) {
  return (
    <div
      style={{
        height: 15,
        width: 320,
        borderRadius: 999,
        backgroundImage: gradient(theme.stops),
        backgroundColor: theme.stops[0],
      }}
    />
  );
}

function Eyebrow({
  header,
  theme,
}: {
  header: StoryHeader;
  theme: StoryTheme;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ ...EYEBROW, display: "flex", color: theme.accent }}>
        {header.eyebrow}
      </div>
      <AccentBar theme={theme} />
    </div>
  );
}

function Script({
  text,
  size,
  theme,
}: {
  text: string;
  size: number;
  theme: StoryTheme;
}) {
  return (
    <div
      style={{
        display: "flex",
        fontFamily: STORY_FONT.script,
        fontSize: size,
        color: theme.accent,
        transform: "rotate(-3deg)",
        transformOrigin: "left center",
        lineHeight: 1.3,
      }}
    >
      {text}
    </div>
  );
}

function Title({
  value,
  theme,
  color = theme.text,
  lineHeight = 1.05,
}: {
  value: FittedText;
  theme: StoryTheme;
  color?: string;
  lineHeight?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        fontFamily: STORY_FONT.heading,
        fontWeight: 600,
        fontSize: value.fontSize,
        lineHeight,
        letterSpacing: theme.headingTracking,
        color,
      }}
    >
      {value.text}
    </div>
  );
}

function Body({
  value,
  color,
  weight = 500,
  lineHeight = 1.3,
}: {
  value: FittedText;
  color: string;
  weight?: number;
  lineHeight?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        fontFamily: STORY_FONT.body,
        fontWeight: weight,
        fontSize: value.fontSize,
        lineHeight,
        color,
      }}
    >
      {value.text}
    </div>
  );
}

function CategoryPill({
  label,
  theme,
}: {
  label: string | null;
  theme: StoryTheme;
}) {
  if (!label) return null;
  return (
    <div style={{ display: "flex" }}>
      <div
        style={{
          ...EYEBROW,
          display: "flex",
          fontSize: 28,
          backgroundColor: theme.category.color,
          color: theme.category.text,
          padding: "14px 28px",
          borderRadius: 999,
        }}
      >
        {label}
      </div>
    </div>
  );
}

/** Where in the story this frame is: the current one long, in the category colour. */
function PageDots({ current, theme }: { current: number; theme: StoryTheme }) {
  return (
    <div style={{ display: "flex", gap: 14 }}>
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          style={{
            width: n === current ? 44 : 14,
            height: 14,
            borderRadius: 999,
            backgroundColor: n === current ? theme.category.color : theme.text,
            opacity: n === current ? 1 : 0.35,
          }}
        />
      ))}
    </div>
  );
}

function Column({
  gap,
  children,
  grow = false,
}: {
  gap: number;
  children: ReactNode;
  grow?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap,
        ...(grow ? { flexGrow: 1, minHeight: 0 } : {}),
      }}
    >
      {children}
    </div>
  );
}

function Spotlight({
  frame,
  header,
  theme,
}: {
  frame: SpotlightFrame;
  header: StoryHeader;
  theme: StoryTheme;
}) {
  return (
    <div style={FRAME_BODY}>
      <Column gap={30} grow>
        <Header header={header} theme={theme} />
        <Eyebrow header={header} theme={theme} />
        <Script text={frame.script} size={50} theme={theme} />
        <div
          style={{
            display: "flex",
            flexGrow: 1,
            minHeight: 0,
            borderRadius: 50,
            overflow: "hidden",
            backgroundColor: theme.panel,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {frame.photo ? (
            <img
              src={frame.photo}
              alt=""
              width={STORY_CONTENT_WIDTH}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            // No photo: the panel names the category instead.
            <div
              style={{
                ...EYEBROW,
                display: "flex",
                fontSize: 44,
                color: theme.panelAccent,
                textAlign: "center",
                padding: 60,
              }}
            >
              {frame.categoryLabel ?? header.eyebrow}
            </div>
          )}
        </div>
      </Column>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          marginTop: 30,
        }}
      >
        <CategoryPill label={frame.categoryLabel} theme={theme} />
        <Title value={frame.title} theme={theme} />
        {frame.brand && <Body value={frame.brand} color={theme.accent} />}
        <div style={{ display: "flex", marginTop: 14 }}>
          <PageDots current={1} theme={theme} />
        </div>
      </div>
    </div>
  );
}

function Details({
  frame,
  header,
  theme,
}: {
  frame: DetailsFrame;
  header: StoryHeader;
  theme: StoryTheme;
}) {
  const gap = 24;
  const half = (STORY_CONTENT_WIDTH - gap) / 2;
  return (
    <div style={FRAME_BODY}>
      <Column gap={36}>
        <Header header={header} theme={theme} />
        <Eyebrow header={header} theme={theme} />
        <Title value={{ text: frame.heading, fontSize: 88 }} theme={theme} />
        <div style={{ display: "flex", flexWrap: "wrap", gap }}>
          {frame.tiles.map((tile) => (
            <div
              key={tile.label}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
                width: tile.wide ? STORY_CONTENT_WIDTH : half,
                padding: 40,
                borderRadius: 50,
                backgroundColor: theme.panel,
              }}
            >
              <div
                style={{
                  ...EYEBROW,
                  display: "flex",
                  fontSize: 26,
                  color: theme.panelAccent,
                }}
              >
                {tile.label}
              </div>
              <Body
                value={tile.value}
                color={theme.panelText}
                weight={600}
                lineHeight={1.1}
              />
            </div>
          ))}
        </div>
      </Column>
      <Column gap={20}>
        <CategoryPill label={frame.categoryLabel} theme={theme} />
        {frame.script && <Script text={frame.script} size={44} theme={theme} />}
        {frame.why && <Body value={frame.why} color={theme.text} />}
        <div style={{ display: "flex", marginTop: 10 }}>
          <PageDots current={2} theme={theme} />
        </div>
      </Column>
    </div>
  );
}

function GetIt({
  frame,
  header,
  theme,
}: {
  frame: GetItFrame;
  header: StoryHeader;
  theme: StoryTheme;
}) {
  return (
    <div style={FRAME_BODY}>
      <Column gap={32}>
        <Header header={header} theme={theme} />
        <AccentBar theme={theme} />
        {frame.script && <Script text={frame.script} size={50} theme={theme} />}
        <Title value={frame.headline} theme={theme} lineHeight={1.02} />
        {frame.itemLine && <Body value={frame.itemLine} color={theme.text} />}
        <Column gap={22}>
          {frame.steps.map((step, index) => (
            <div
              key={index}
              style={{ display: "flex", alignItems: "center", gap: 28 }}
            >
              <div
                style={{
                  display: "flex",
                  width: 76,
                  height: 76,
                  flexShrink: 0,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: theme.category.color,
                  color: theme.category.text,
                  fontFamily: STORY_FONT.body,
                  fontWeight: 700,
                  fontSize: 40,
                }}
              >
                {String(index + 1)}
              </div>
              <Body
                value={step}
                color={theme.text}
                weight={600}
                lineHeight={1.2}
              />
            </div>
          ))}
        </Column>
      </Column>
      <Column gap={22}>
        {/* Left empty: Instagram's link sticker can't be drawn into the
            image, so whoever posts it places one here. */}
        <div style={{ display: "flex", height: 120 }} />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              fontFamily: STORY_FONT.body,
              fontWeight: 700,
              fontSize: 38,
              color: theme.text,
            }}
          >
            {frame.host}
          </div>
          <PageDots current={3} theme={theme} />
        </div>
      </Column>
    </div>
  );
}

export function StoryFrameView({ model }: { model: StoryModel }) {
  const { theme, header, frame } = model;
  return (
    <div
      style={{
        width: STORY_WIDTH,
        height: STORY_HEIGHT,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: `${STORY_SAFE_TOP}px ${STORY_SIDE}px ${STORY_SAFE_BOTTOM}px`,
        backgroundColor: theme.page,
        color: theme.text,
        fontFamily: STORY_FONT.body,
      }}
    >
      {frame.frame === 1 ? (
        <Spotlight frame={frame} header={header} theme={theme} />
      ) : frame.frame === 2 ? (
        <Details frame={frame} header={header} theme={theme} />
      ) : (
        <GetIt frame={frame} header={header} theme={theme} />
      )}
    </div>
  );
}
