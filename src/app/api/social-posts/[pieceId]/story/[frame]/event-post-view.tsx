/* eslint-disable @next/next/no-img-element -- Satori renders plain <img>;
   next/image emits a browser srcset and never runs here. */
import type { CSSProperties, ReactNode } from "react";
import {
  BRAND_LOGO_HEIGHT,
  FLYER_GAP,
  FLYER_LOGO_HEIGHT,
  SPONSOR_TILE_GAP,
  type BrandLayout,
  type DrawnImage,
  type EventPostModel,
  type FlyerLayout,
  type FrameBox,
  type RecapLayout,
  type SlideLayout,
  type SponsorsLayout,
} from "@/lib/social-content/event-post-frames";
import type { FittedText } from "@/lib/social-content/story-frames";
import { STORY_FONT } from "@/lib/social-content/story-fonts";

/**
 * An event template's frame (#1926, #1927) as Satori markup. It draws what
 * `buildEventPostFrame` decided and decides nothing itself. Satori is flexbox
 * only: every element with children sets `display: flex`.
 */

const EYEBROW: CSSProperties = {
  fontFamily: STORY_FONT.heading,
  fontWeight: 700,
  fontSize: 30,
  letterSpacing: "0.2em",
  textTransform: "uppercase",
};

function Column({
  gap,
  align = "flex-start",
  children,
}: {
  gap: number;
  align?: CSSProperties["alignItems"];
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap,
        alignItems: align,
      }}
    >
      {children}
    </div>
  );
}

function Heading({
  value,
  color,
  tracking,
  center = false,
}: {
  value: FittedText;
  color: string;
  tracking: string;
  center?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        fontFamily: STORY_FONT.heading,
        fontWeight: 700,
        fontSize: value.fontSize,
        lineHeight: 1.05,
        letterSpacing: tracking,
        color,
        textAlign: center ? "center" : "left",
        justifyContent: center ? "center" : "flex-start",
      }}
    >
      {value.text}
    </div>
  );
}

function Body({
  value,
  color,
  center = false,
  weight = 500,
}: {
  value: FittedText;
  color: string;
  center?: boolean;
  weight?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        fontFamily: STORY_FONT.body,
        fontWeight: weight,
        fontSize: value.fontSize,
        lineHeight: 1.2,
        color,
        textAlign: center ? "center" : "left",
        justifyContent: center ? "center" : "flex-start",
      }}
    >
      {value.text}
    </div>
  );
}

function DetailLines({
  lines,
  color,
  center = false,
}: {
  lines: string[];
  color: string;
  center?: boolean;
}) {
  if (lines.length === 0) return null;
  return (
    <Column gap={6} align={center ? "center" : "flex-start"}>
      {lines.map((line) => (
        <div
          key={line}
          style={{
            display: "flex",
            fontFamily: STORY_FONT.body,
            fontWeight: 600,
            fontSize: 34,
            lineHeight: 1.15,
            color,
            textAlign: center ? "center" : "left",
          }}
        >
          {line}
        </div>
      ))}
    </Column>
  );
}

function Logo({ src, height }: { src: string; height: number }) {
  return (
    <img
      src={src}
      alt=""
      height={height}
      style={{ maxWidth: 360, height, objectFit: "contain" }}
    />
  );
}

function Root({
  box,
  background,
  color,
  children,
}: {
  box: FrameBox;
  background: string;
  color: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        width: box.width,
        height: box.height,
        display: "flex",
        flexDirection: "column",
        padding: `${box.padTop}px ${box.side}px ${box.padBottom}px`,
        backgroundColor: background,
        color,
        fontFamily: STORY_FONT.body,
      }}
    >
      {children}
    </div>
  );
}

/** The flyer, whole, on bands of its own colour; the words above and below. */
function Flyer({ box, frame }: { box: FrameBox; frame: FlyerLayout }) {
  const color = frame.bandText;
  const above = frame.logoUrl || frame.when || frame.line;
  const below = frame.details.length > 0 || frame.cta;
  return (
    <Root box={box} background={frame.band} color={color}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          flexGrow: 1,
          gap: FLYER_GAP,
        }}
      >
        {above && (
          <Column gap={16} align="center">
            {frame.logoUrl && (
              <Logo src={frame.logoUrl} height={FLYER_LOGO_HEIGHT} />
            )}
            {frame.when && (
              <Heading value={frame.when} color={color} tracking="0" center />
            )}
            {frame.line && (
              <Body value={frame.line} color={color} weight={700} center />
            )}
          </Column>
        )}
        <img
          src={frame.flyer.src}
          alt=""
          width={frame.flyer.width}
          height={frame.flyer.height}
          style={{
            width: frame.flyer.width,
            height: frame.flyer.height,
            borderRadius: 12,
            boxShadow: "0 12px 40px rgba(0, 0, 0, 0.28)",
          }}
        />
        {below && (
          <Column gap={16} align="center">
            <DetailLines lines={frame.details} color={color} center />
            {frame.cta && (
              <Body value={frame.cta} color={color} weight={700} center />
            )}
          </Column>
        )}
      </div>
    </Root>
  );
}

/** No flyer: the tenant's brand, with the event's title, date, place and a photo. */
function Brand({ box, frame }: { box: FrameBox; frame: BrandLayout }) {
  const { theme } = frame;
  return (
    <Root box={box} background={theme.page} color={theme.text}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          flexGrow: 1,
          gap: 32,
        }}
      >
        <Column gap={28}>
          <Masthead
            logoUrl={frame.logoUrl}
            orgName={frame.orgName}
            color={theme.text}
          />
          <div style={{ ...EYEBROW, display: "flex", color: theme.accent }}>
            {frame.eyebrow}
          </div>
        </Column>
        {frame.photo && (
          <div
            style={{
              display: "flex",
              height: frame.photoHeight,
              borderRadius: 40,
              overflow: "hidden",
              backgroundColor: theme.panel,
            }}
          >
            <img
              src={frame.photo.src}
              alt=""
              width={box.width - 2 * box.side}
              height={frame.photoHeight}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        )}
        <Column gap={20}>
          <Heading
            value={frame.title}
            color={theme.text}
            tracking={theme.headingTracking}
          />
          {frame.line && <Body value={frame.line} color={theme.text} />}
          <DetailLines lines={frame.details} color={theme.accent} />
          {frame.cta && (
            <Body value={frame.cta} color={theme.text} weight={700} />
          )}
        </Column>
      </div>
    </Root>
  );
}

/** The logo, or the organization's name where there is none. */
function Masthead({
  logoUrl,
  orgName,
  color,
}: {
  logoUrl: string | null;
  orgName: string;
  color: string;
}) {
  return logoUrl ? (
    <Logo src={logoUrl} height={BRAND_LOGO_HEIGHT} />
  ) : (
    <div
      style={{
        display: "flex",
        fontFamily: STORY_FONT.heading,
        fontWeight: 700,
        fontSize: 40,
        color,
      }}
    >
      {orgName}
    </div>
  );
}

function Photo({
  image,
  width,
  height,
  radius = 24,
}: {
  image: DrawnImage;
  width: number;
  height: number;
  radius?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        width,
        height,
        borderRadius: radius,
        overflow: "hidden",
      }}
    >
      <img
        src={image.src}
        alt=""
        width={width}
        height={height}
        style={{ width, height, objectFit: "cover" }}
      />
    </div>
  );
}

const COLLAGE_GAP = 16;

/**
 * One to four photos in `width` x `height`: one whole, two side by side,
 * three as one tall beside two stacked, four in a grid.
 */
function Collage({
  photos,
  width,
  height,
}: {
  photos: DrawnImage[];
  width: number;
  height: number;
}) {
  const half = (n: number) => Math.floor((n - COLLAGE_GAP) / 2);
  const [a, b, c, d] = photos;
  const row = (children: ReactNode, h: number) => (
    <div style={{ display: "flex", gap: COLLAGE_GAP, height: h }}>
      {children}
    </div>
  );
  if (photos.length === 1)
    return <Photo image={a} width={width} height={height} />;
  if (photos.length === 2) {
    return row(
      <>
        <Photo image={a} width={half(width)} height={height} />
        <Photo image={b} width={half(width)} height={height} />
      </>,
      height,
    );
  }
  if (photos.length === 3) {
    return row(
      <>
        <Photo image={a} width={half(width)} height={height} />
        <div
          style={{ display: "flex", flexDirection: "column", gap: COLLAGE_GAP }}
        >
          <Photo image={b} width={half(width)} height={half(height)} />
          <Photo image={c} width={half(width)} height={half(height)} />
        </div>
      </>,
      height,
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: COLLAGE_GAP }}>
      {row(
        <>
          <Photo image={a} width={half(width)} height={half(height)} />
          <Photo image={b} width={half(width)} height={half(height)} />
        </>,
        half(height),
      )}
      {row(
        <>
          <Photo image={c} width={half(width)} height={half(height)} />
          <Photo image={d} width={half(width)} height={half(height)} />
        </>,
        half(height),
      )}
    </div>
  );
}

/** A recap's cover (#1927): the words, over a collage of its photos. */
function Recap({ box, frame }: { box: FrameBox; frame: RecapLayout }) {
  const { theme } = frame;
  return (
    <Root box={box} background={theme.page} color={theme.text}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          flexGrow: 1,
          gap: 32,
        }}
      >
        <Column gap={28}>
          <Masthead
            logoUrl={frame.logoUrl}
            orgName={frame.orgName}
            color={theme.text}
          />
          <div style={{ ...EYEBROW, display: "flex", color: theme.accent }}>
            {frame.eyebrow}
          </div>
        </Column>
        {frame.photos.length > 0 && (
          <Collage
            photos={frame.photos}
            width={box.width - 2 * box.side}
            height={frame.photosHeight}
          />
        )}
        <Column gap={20}>
          <Heading
            value={frame.title}
            color={theme.text}
            tracking={theme.headingTracking}
          />
          {frame.line && <Body value={frame.line} color={theme.text} />}
          {frame.attendance && (
            <DetailLines lines={[frame.attendance]} color={theme.accent} />
          )}
        </Column>
      </div>
    </Root>
  );
}

/** A recap carousel's later slide: the photo, edge to edge. */
function Slide({ box, frame }: { box: FrameBox; frame: SlideLayout }) {
  return (
    <div style={{ display: "flex", width: box.width, height: box.height }}>
      <Photo
        image={frame.photo}
        width={box.width}
        height={box.height}
        radius={0}
      />
    </div>
  );
}

/** A sponsor thank-you (#1927): the line, the event, and a tile a sponsor. */
function Sponsors({ box, frame }: { box: FrameBox; frame: SponsorsLayout }) {
  const { theme } = frame;
  return (
    <Root box={box} background={theme.page} color={theme.text}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          flexGrow: 1,
          gap: 40,
        }}
      >
        <Column gap={28}>
          <Masthead
            logoUrl={frame.logoUrl}
            orgName={frame.orgName}
            color={theme.text}
          />
          <div style={{ ...EYEBROW, display: "flex", color: theme.accent }}>
            {frame.eyebrow}
          </div>
          <Heading
            value={frame.title}
            color={theme.text}
            tracking={theme.headingTracking}
          />
        </Column>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: SPONSOR_TILE_GAP,
            justifyContent: "center",
          }}
        >
          {frame.tiles.map((tile, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: frame.tileWidth,
                height: frame.tileHeight,
                padding: 20,
                borderRadius: 28,
                backgroundColor: theme.panel,
              }}
            >
              {tile.logo ? (
                <img
                  src={tile.logo}
                  alt=""
                  width={frame.tileWidth - 40}
                  height={frame.tileHeight - 40}
                  style={{
                    width: frame.tileWidth - 40,
                    height: frame.tileHeight - 40,
                    objectFit: "contain",
                  }}
                />
              ) : (
                <Body
                  value={tile.name}
                  color={theme.panelText}
                  weight={700}
                  center
                />
              )}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", minHeight: 40 }}>
          {frame.more > 0 && (
            <DetailLines
              lines={[`and ${frame.more} more`]}
              color={theme.accent}
            />
          )}
        </div>
      </div>
    </Root>
  );
}

export function EventPostView({ model }: { model: EventPostModel }) {
  const { box, frame } = model;
  switch (frame.layout) {
    case "flyer":
      return <Flyer box={box} frame={frame} />;
    case "brand":
      return <Brand box={box} frame={frame} />;
    case "recap":
      return <Recap box={box} frame={frame} />;
    case "slide":
      return <Slide box={box} frame={frame} />;
    case "sponsors":
      return <Sponsors box={box} frame={frame} />;
  }
}
