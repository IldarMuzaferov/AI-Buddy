import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

export async function makePdf(text: string, title: string) {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const fontResponse = await fetch("/assets/export-font.ttf");
  if (!fontResponse.ok) throw new Error("Не удалось загрузить шрифт для PDF.");
  const font = await document.embedFont(await fontResponse.arrayBuffer(), {
    subset: true,
  });
  let page = document.addPage([595, 842]),
    y = 790;
  function line(text: string, size: number) {
    if (y < 48) {
      page = document.addPage([595, 842]);
      y = 790;
    }
    page.drawText(text, { x: 48, y, font, size });
    y -= size * 1.5;
  }
  for (const [index, paragraph] of [
    title,
    "",
    ...text.split(/\r?\n/),
  ].entries()) {
    const size = index === 0 ? 18 : 12;
    let current = "";
    for (const character of paragraph) {
      const next = current + character;
      if (font.widthOfTextAtSize(next, size) > 499) {
        line(current, size);
        current = character;
      } else current = next;
    }
    line(current, size);
  }
  const bytes = await document.save();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="journal.pdf"',
    },
  });
}
