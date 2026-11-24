// A social post's content, broken into parts (#1826): format, caption,
// collaborators, people to tag, and whether its media fits the format.
import { describe, expect, test } from "bun:test";
import { normalizeHandle, parseContentPieceForm } from "./piece-form";
import { mediaFormatIssue, mediaRoom } from "./pieces";

const PERSON_ID = "6f1c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  fd.set("title", "Announce");
  fd.set("contentStatus", "idea");
  fd.set("leadTimeDays", "21");
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

function parsed(fields: Record<string, string>) {
  const result = parseContentPieceForm(formData(fields));
  if ("error" in result) throw new Error(result.error);
  return result.data;
}

describe("normalizeHandle", () => {
  test("strips @, a profile URL and case", () => {
    expect(normalizeHandle("@Chatter.Snow")).toBe("chatter.snow");
    expect(normalizeHandle("https://www.instagram.com/chatter_snow/")).toBe(
      "chatter_snow",
    );
    expect(normalizeHandle("  rider_1 ")).toBe("rider_1");
  });

  test("refuses what is not a handle", () => {
    expect(normalizeHandle("two words")).toBeNull();
    expect(normalizeHandle("")).toBeNull();
    expect(normalizeHandle("a".repeat(31))).toBeNull();
  });
});

describe("parseContentPieceForm: content parts", () => {
  test("an older form with none of the new fields still parses", () => {
    const data = parsed({});
    expect(data.postFormat).toBeNull();
    expect(data.collaboratorHandles).toEqual([]);
    expect(data.tags).toEqual([]);
  });

  test("reads the format, refusing an unknown one", () => {
    expect(parsed({ postFormat: "instagram_reel" }).postFormat).toBe(
      "instagram_reel",
    );
    expect(
      parseContentPieceForm(formData({ postFormat: "tiktok" })),
    ).toMatchObject({ error: "Select a valid format." });
  });

  test("keeps a 2,200-plus caption: the limit is shown, not enforced", () => {
    const caption = "x".repeat(2300);
    expect(parsed({ content: caption }).content).toBe(caption);
  });

  test("normalises and de-duplicates collaborators, up to three", () => {
    expect(
      parsed({
        postFormat: "instagram_post",
        collaborators: JSON.stringify(["@A", "a", "b", "c"]),
      }).collaboratorHandles,
    ).toEqual(["a", "b", "c"]);
    expect(
      parseContentPieceForm(
        formData({ collaborators: JSON.stringify(["a", "b", "c", "d"]) }),
      ),
    ).toMatchObject({ field: "collaborators" });
    expect(
      parseContentPieceForm(
        formData({ collaborators: JSON.stringify(["not a handle"]) }),
      ),
    ).toMatchObject({ field: "collaborators" });
  });

  test("a story drops its collaborators", () => {
    expect(
      parsed({
        postFormat: "instagram_story",
        collaborators: JSON.stringify(["a", "b"]),
      }).collaboratorHandles,
    ).toEqual([]);
  });

  test("reads tags in order, people and handles, without repeats", () => {
    expect(
      parsed({
        tags: JSON.stringify([
          { personId: PERSON_ID },
          { handle: "@Rider" },
          { personId: PERSON_ID },
          { handle: "rider" },
        ]),
      }).tags,
    ).toEqual([{ personId: PERSON_ID }, { handle: "rider" }]);
  });

  test("refuses a malformed tag", () => {
    expect(
      parseContentPieceForm(
        formData({ tags: JSON.stringify([{ personId: "nope" }]) }),
      ),
    ).toMatchObject({ field: "tags" });
    expect(
      parseContentPieceForm(formData({ tags: "{not json" })),
    ).toMatchObject({ field: "tags" });
  });
});

describe("mediaFormatIssue", () => {
  const photo = { kind: "photo" };
  const video = { kind: "video" };

  test("nothing to say without a format or media", () => {
    expect(mediaFormatIssue(null, [photo, photo])).toBeNull();
    expect(mediaFormatIssue("instagram_reel", [])).toBeNull();
  });

  test("a reel is one video", () => {
    expect(mediaFormatIssue("instagram_reel", [video])).toBeNull();
    expect(mediaFormatIssue("instagram_reel", [photo])).toMatch(/video/);
    expect(mediaFormatIssue("instagram_reel", [video, video])).toMatch(
      /one video/,
    );
  });

  test("a story is one file", () => {
    expect(mediaFormatIssue("instagram_story", [photo])).toBeNull();
    expect(mediaFormatIssue("instagram_story", [photo, video])).toMatch(
      /one photo or video/,
    );
  });

  test("a story may hold the generated sequence of three (#1909)", () => {
    const frame = { kind: "photo", generated: true };
    expect(
      mediaFormatIssue("instagram_story", [frame, frame, frame]),
    ).toBeNull();
    // A frame removed by hand still shares as a shorter sequence.
    expect(mediaFormatIssue("instagram_story", [frame, frame])).toBeNull();
  });

  test("a story mixing generated images with added files is warned", () => {
    const frame = { kind: "photo", generated: true };
    expect(
      mediaFormatIssue("instagram_story", [frame, frame, frame, photo]),
    ).toMatch(/one file or the generated story images/);
    // Only generated media earns the sequence; added files are still one.
    expect(
      mediaFormatIssue("instagram_story", [
        { kind: "photo", generated: false },
        { kind: "photo", generated: false },
      ]),
    ).toMatch(/one photo or video/);
  });

  test("a post takes up to twenty, Instagram's carousel limit (#1927)", () => {
    expect(
      mediaFormatIssue("instagram_post", Array(20).fill(photo)),
    ).toBeNull();
    expect(mediaFormatIssue("instagram_post", Array(21).fill(photo))).toMatch(
      /up to 20/,
    );
  });
});

describe("mediaRoom (#1827)", () => {
  test("a post or carousel fills to twenty (#1927)", () => {
    expect(mediaRoom("instagram_post", 0)).toEqual({
      count: 20,
      videoOnly: false,
    });
    expect(mediaRoom(null, 17)).toEqual({ count: 3, videoOnly: false });
    expect(mediaRoom("instagram_post", 22)).toEqual({
      count: 0,
      videoOnly: false,
    });
  });

  test("a reel takes one video, a story one file", () => {
    expect(mediaRoom("instagram_reel", 0)).toEqual({
      count: 1,
      videoOnly: true,
    });
    expect(mediaRoom("instagram_reel", 1)).toEqual({
      count: 0,
      videoOnly: true,
    });
    expect(mediaRoom("instagram_story", 0)).toEqual({
      count: 1,
      videoOnly: false,
    });
  });

  test("a story holding generated images takes nothing more (#1909)", () => {
    expect(mediaRoom("instagram_story", 3, 3)).toEqual({
      count: 0,
      videoOnly: false,
    });
    // Generated media elsewhere changes nothing: the rule is the story's.
    expect(mediaRoom("instagram_post", 3, 3)).toEqual({
      count: 17,
      videoOnly: false,
    });
  });
});
