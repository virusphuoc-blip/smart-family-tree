import { describe, expect, it } from 'vitest'
import { buildImport, draftsFromLlmJson, extractByPatterns, matchExisting } from './aiImport'
import { SAMPLE_PARAGRAPHS } from './sampleText'

const drafts = extractByPatterns(SAMPLE_PARAGRAPHS.join('\n'))
const by = (name: string) => drafts.find((d) => d.fullName === name)!
const nameOf = (key: string) => drafts.find((d) => d.key === key)?.fullName ?? ''

describe('pattern-based import', () => {
  it('finds every person once', () => {
    expect(drafts.map((d) => d.fullName).sort()).toEqual(
      ['Đỗ Thị Nhàn', 'Hoàng Văn Bình', 'Ngô Thị Lan', 'Phạm Minh Tuấn', 'Phạm Thị Duyên', 'Phạm Thị Hương', 'Phạm Thị Thu', 'Phạm Văn Hải', 'Phạm Văn Khải', 'Phạm Văn Lộc', 'Phạm Văn Sơn', 'Vũ Thị Hòa'].sort(),
    )
  })
  it('reads dates, gender, place and occupation', () => {
    const khai = by('Phạm Văn Khải')
    expect([khai.birthDate, khai.deathDate, khai.deceased, khai.gender]).toEqual(['1898', '1970', true, 'male'])
    expect(khai.birthPlace).toBe('Nam Định')
    expect(khai.occupation).toBe('thầy đồ')
    expect(by('Phạm Văn Lộc').birthDate).toBe('1925')
    expect(by('Phạm Văn Lộc').deathDate).toBe('1998')
    expect(by('Phạm Văn Sơn').birthDate).toBe('1952-03-12')
    expect(by('Phạm Văn Sơn').occupation).toBe('giáo viên')
    expect(by('Vũ Thị Hòa').gender).toBe('female')
    expect(by('Phạm Thị Thu').birthPlace).toBe('Nam Định')
  })
  it('links spouses', () => {
    expect(by('Phạm Văn Khải').spouseKeys.map(nameOf)).toEqual(['Đỗ Thị Nhàn'])
    expect(by('Phạm Văn Lộc').spouseKeys.map(nameOf)).toEqual(['Vũ Thị Hòa'])
    expect(by('Phạm Thị Duyên').spouseKeys.map(nameOf)).toEqual(['Hoàng Văn Bình'])
    expect(by('Phạm Văn Sơn').spouseKeys.map(nameOf)).toEqual(['Ngô Thị Lan'])
  })
  it('links parents and children', () => {
    for (const c of ['Phạm Văn Lộc', 'Phạm Thị Duyên']) {
      expect(nameOf(by(c).fatherKey)).toBe('Phạm Văn Khải')
      expect(nameOf(by(c).motherKey)).toBe('Đỗ Thị Nhàn')
    }
    for (const c of ['Phạm Văn Sơn', 'Phạm Thị Thu', 'Phạm Văn Hải']) {
      expect(nameOf(by(c).fatherKey)).toBe('Phạm Văn Lộc')
      expect(nameOf(by(c).motherKey)).toBe('Vũ Thị Hòa')
    }
    for (const c of ['Phạm Minh Tuấn', 'Phạm Thị Hương']) {
      expect(nameOf(by(c).fatherKey)).toBe('Phạm Văn Sơn')
      expect(nameOf(by(c).motherKey)).toBe('Ngô Thị Lan')
    }
    expect(by('Phạm Văn Khải').fatherKey).toBe('')
  })
  it('builds records and skips excluded people', () => {
    const edited = drafts.map((d) => (d.fullName === 'Hoàng Văn Bình' ? { ...d, include: false } : d))
    const res = buildImport(edited, [], [])
    expect(res.people).toHaveLength(11)
    expect(res.unions).toHaveLength(3)
    const son = res.people.find((p) => p.fullName === 'Phạm Văn Sơn')!
    expect(res.people.find((p) => p.id === son.fatherId)!.fullName).toBe('Phạm Văn Lộc')
  })
  it('links to existing members instead of duplicating', () => {
    const first = buildImport(drafts, [], [])
    const again = buildImport(matchExisting(drafts, first.people), first.people, first.unions)
    expect(again.people).toHaveLength(0)
    expect(again.unions).toHaveLength(0)
  })
})

describe('LLM answer parsing', () => {
  it('accepts JSON wrapped in a code fence and drops bad references', () => {
    const raw = '```json\n{"people":[{"id":"a","fullName":"Lê Văn An","gender":"male","birthDate":"1950","spouseIds":["b","zz"]},{"id":"b","fullName":"Trần Thị Bé","deathDate":"12/5/2001"},{"id":"c","fullName":"Lê Thị Chi","fatherId":"a","motherId":"b"}]}\n```'
    const d = draftsFromLlmJson(raw)
    expect(d).toHaveLength(3)
    expect(d[0].spouseKeys).toEqual([d[1].key])
    expect(d[1].gender).toBe('female')
    expect(d[1].deathDate).toBe('2001-05-12')
    expect(d[1].deceased).toBe(true)
    expect([d[2].fatherKey, d[2].motherKey]).toEqual([d[0].key, d[1].key])
  })
  it('rejects non-JSON answers', () => {
    expect(() => draftsFromLlmJson('xin lỗi')).toThrow()
  })
})
