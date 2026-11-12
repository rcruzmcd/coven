import { describe, expect, test } from "bun:test";
import {
  gearCaptionEdited,
  gearCaptionToTemplate,
  gearItemDetails,
  gearItemLink,
  renderGearCaption,
  type FeaturedGear,
} from "./series-gear";

const jacket: FeaturedGear = {
  id: "item-1",
  description: "Burton jacket",
  size: "M",
  condition: "like_new",
  category_label: "Jackets",
};
const link = gearItemLink("https://www.example.org/", "item-1");

describe("gearItemLink", () => {
  test("opens the item in the public catalog", () => {
    expect(link).toBe("https://www.example.org/inventory?item=item-1");
  });
});

describe("gearItemDetails", () => {
  test("joins size, category and condition label", () => {
    expect(gearItemDetails(jacket)).toBe("Size M · Jackets · Like new");
  });

  test("leaves out what the item doesn't have", () => {
    expect(
      gearItemDetails({
        ...jacket,
        size: " ",
        category_label: null,
        condition: null,
      }),
    ).toBe("");
  });
});

describe("renderGearCaption", () => {
  test("fills placeholders", () => {
    expect(
      renderGearCaption("This week: {item}, size {size}. {link}", jacket, link),
    ).toBe(`This week: Burton jacket, size M. ${link}`);
  });

  test("adds the item after a caption with no placeholders", () => {
    expect(renderGearCaption("Gear of the week!", jacket, link)).toBe(
      `Gear of the week!\n\nBurton jacket (Size M · Jackets · Like new)\n${link}`,
    );
  });

  test("an empty caption becomes the item alone", () => {
    expect(renderGearCaption(null, jacket, link)).toBe(
      `Burton jacket (Size M · Jackets · Like new)\n${link}`,
    );
  });
});

describe("gearCaptionToTemplate", () => {
  test("drops the added item lines", () => {
    const caption = renderGearCaption("Gear of the week!", jacket, link);
    expect(gearCaptionToTemplate(caption, jacket, link)).toBe(
      "Gear of the week!",
    );
  });

  test("puts placeholders back where the item was named", () => {
    const caption = renderGearCaption(
      "This week: {item} ({details}) {link}",
      jacket,
      link,
    );
    expect(gearCaptionToTemplate(caption, jacket, link)).toBe(
      "This week: {item} ({details}) {link}",
    );
  });

  test("a caption of only the item lines becomes empty", () => {
    expect(
      gearCaptionToTemplate(renderGearCaption("", jacket, link), jacket, link),
    ).toBe("");
  });
});

describe("gearCaptionEdited", () => {
  const template = "Gear of the week!";

  test("the filled-in caption is not edited", () => {
    expect(
      gearCaptionEdited(
        renderGearCaption(template, jacket, link),
        template,
        jacket,
        link,
      ),
    ).toBe(false);
  });

  test("a changed caption is edited", () => {
    expect(gearCaptionEdited("Something else", template, jacket, link)).toBe(
      true,
    );
  });

  test("with no item, the series caption is not edited", () => {
    expect(gearCaptionEdited(template, template, null, null)).toBe(false);
    expect(gearCaptionEdited("Mine", template, null, null)).toBe(true);
  });

  test("a caption never filled in is not edited", () => {
    expect(gearCaptionEdited(template, template, jacket, link)).toBe(false);
  });

  test("an empty caption is never edited", () => {
    expect(gearCaptionEdited("  ", template, jacket, link)).toBe(false);
  });
});
