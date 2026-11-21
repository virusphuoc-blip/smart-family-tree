// Generates public/samples/gia-pha-mau.docx from src/lib/sampleText.ts (run: node scripts/make-sample-docx.mjs)
import { Document, HeadingLevel, Packer, Paragraph } from 'docx'
import { readFileSync, writeFileSync } from 'node:fs'

const src = readFileSync(new URL('../src/lib/sampleText.ts', import.meta.url), 'utf8')
const paragraphs = [...src.matchAll(/^\s+'(.*)',$/gm)].map((m) => m[1])
const doc = new Document({
  sections: [
    {
      children: paragraphs.map((text, i) =>
        i === 0 ? new Paragraph({ text, heading: HeadingLevel.TITLE }) : /^Đời thứ/.test(text) ? new Paragraph({ text, heading: HeadingLevel.HEADING_1 }) : new Paragraph({ text }),
      ),
    },
  ],
})
writeFileSync(new URL('../public/samples/gia-pha-mau.docx', import.meta.url), await Packer.toBuffer(doc))
console.log('ok', paragraphs.length)
