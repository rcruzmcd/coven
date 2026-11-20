import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const { gearPhotoSource } = await import("./series-gear-fill");

describe("gearPhotoSource", () => {
  const saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co/";
  });
  afterAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
  });

  test("a gear-photos object is read from this project's storage", () => {
    expect(
      gearPhotoSource(
        "https://elsewhere.example/storage/v1/object/public/gear-photos/t/a.jpg",
      ),
    ).toBe(
      "https://project.supabase.co/storage/v1/object/public/gear-photos/t/a.jpg",
    );
  });

  test("a Drive share link is read from Drive's thumbnail, without its crop", () => {
    expect(
      gearPhotoSource(
        "https://drive.google.com/file/d/ABC123/view?usp=sharing#crop=0.1,0.1,0.5,0.5",
      ),
    ).toBe("https://drive.google.com/thumbnail?id=ABC123&sz=w1000");
  });

  test("a crop fragment is dropped from any other link", () => {
    expect(gearPhotoSource("https://cdn.example/p.jpg#crop=0,0,0.5,0.5")).toBe(
      "https://cdn.example/p.jpg",
    );
  });

  test("anything but https is refused", () => {
    expect(gearPhotoSource("http://cdn.example/p.jpg")).toBeNull();
    expect(gearPhotoSource("/images/p.jpg")).toBeNull();
  });
});
