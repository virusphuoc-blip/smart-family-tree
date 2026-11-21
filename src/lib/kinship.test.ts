import { describe, expect, it } from 'vitest'
import { emptyPerson, type Person, type Union } from '../types'
import { demoData } from './demo'
import { buildGraph, describePath, relationOf, relativesOf } from './kinship'

const { people, unions } = demoData('')
const g = buildGraph(people, unions)
const term = (ego: string, other: string) => relationOf(g, ego, other).term

describe('kinship on the demo tree', () => {
  it('has 17 members in 3 generations', () => {
    expect(people).toHaveLength(17)
  })

  it.each([
    // viewpoint: Minh (son of Hùng and Mai)
    ['minh', 'minh', 'Bản thân'],
    ['minh', 'hung', 'Cha'],
    ['minh', 'mai', 'Mẹ'],
    ['minh', 'to', 'Ông nội'],
    ['minh', 'lanh', 'Bà nội'],
    ['minh', 'phuc', 'Ông ngoại'],
    ['minh', 'cuc', 'Bà ngoại'],
    ['minh', 'lan', 'Chị gái'],
    ['minh', 'nam', 'Em trai'],
    ['minh', 'dung', 'Bác'],
    ['minh', 'hoa', 'Bác gái'],
    ['minh', 'tuan', 'Chú'],
    ['minh', 'hanh', 'Cô'],
    ['minh', 'son', 'Cậu'],
    ['minh', 'hong', 'Dì'],
    ['minh', 'khoa', 'Anh họ'],
    ['minh', 'thao', 'Em họ'],
    // other viewpoints
    ['lan', 'minh', 'Em trai'],
    ['nam', 'lan', 'Chị gái'],
    ['hung', 'minh', 'Con trai'],
    ['mai', 'lan', 'Con gái'],
    ['to', 'minh', 'Cháu nội'],
    ['phuc', 'minh', 'Cháu ngoại'],
    ['cuc', 'thao', 'Cháu nội'],
    ['dung', 'minh', 'Cháu trai'],
    ['hong', 'lan', 'Cháu gái'],
    ['hung', 'mai', 'Vợ'],
    ['mai', 'hung', 'Chồng'],
    ['hung', 'dung', 'Anh trai'],
    ['hung', 'tuan', 'Em trai'],
    ['hung', 'hanh', 'Em gái'],
    ['hung', 'hoa', 'Chị dâu'],
    ['dung', 'mai', 'Em dâu'],
    ['son', 'hung', 'Anh rể'],
    ['mai', 'to', 'Cha chồng'],
    ['mai', 'lanh', 'Mẹ chồng'],
    ['hung', 'phuc', 'Cha vợ'],
    ['hung', 'cuc', 'Mẹ vợ'],
    ['to', 'mai', 'Con dâu'],
    ['phuc', 'hung', 'Con rể'],
    ['mai', 'dung', 'Anh chồng'],
    ['mai', 'hanh', 'Em chồng'],
    ['hung', 'son', 'Em vợ'],
    ['khoa', 'hung', 'Chú'],
    ['khoa', 'mai', 'Thím'],
    ['khoa', 'minh', 'Em họ'],
    ['thao', 'minh', 'Anh họ'],
    ['thao', 'mai', 'Cô'],
    ['thao', 'hung', 'Dượng'],
    ['to', 'phuc', 'Ông thông gia'],
    ['cuc', 'lanh', 'Bà thông gia'],
    ['mai', 'khoa', 'Cháu trai'],
  ])('%s gọi %s là %s', (ego, other, expected) => {
    expect(term(ego, other)).toBe(expected)
  })

  it('returns the path between two members', () => {
    const r = relationOf(g, 'minh', 'khoa')
    expect(r.path).toEqual(['minh', 'hung', 'to', 'dung', 'khoa'])
    expect(describePath(g, r.path)).toEqual([
      'cha Nguyễn Văn Hùng',
      'cha Nguyễn Văn Tổ',
      'con trai Nguyễn Văn Dũng',
      'con trai Nguyễn Văn Khoa',
    ])
  })

  it('lists every relative of Minh', () => {
    const list = relativesOf(g, 'minh')
    expect(list).toHaveLength(16)
    expect(list.every((r) => r.relation.term !== 'Không có quan hệ')).toBe(true)
  })
})

describe('kinship beyond the demo tree', () => {
  const mk = (id: string, gender: Person['gender'], birth: string, father = '', mother = ''): Person => ({
    ...emptyPerson(id),
    fullName: id,
    gender,
    birthDate: birth,
    fatherId: father,
    motherId: mother,
  })
  const ps = [
    mk('cu', 'male', '1900'),
    mk('ong', 'male', '1925', 'cu'),
    mk('ongchu', 'male', '1930', 'cu'),
    mk('baco', 'female', '1933', 'cu'),
    mk('cha', 'male', '1950', 'ong'),
    mk('chuho', 'male', '1960', 'ongchu'),
    mk('toi', 'male', '1980', 'cha', 'me'),
    mk('me', 'female', '1955'),
    mk('me2', 'female', '1960'),
    mk('emkhac', 'female', '1990', 'cha', 'me2'),
    mk('emho2', 'female', '1970', 'chuho'),
    mk('con', 'female', '2005', 'toi'),
    mk('chau', 'male', '2030', '', 'con'),
    mk('chat', 'male', '2055', 'chau'),
    mk('vo', 'female', '1982'),
    mk('vocu', 'female', '1981'),
    mk('la', 'male', '1970'),
  ]
  const us: Union[] = [
    { id: 'u1', a: 'toi', b: 'vocu', startDate: '2000', endDate: '2003', divorced: true, note: '' },
    { id: 'u2', a: 'toi', b: 'vo', startDate: '2004', endDate: '', divorced: false, note: '' },
    { id: 'u3', a: 'cha', b: 'me2', startDate: '1988', endDate: '', divorced: false, note: '' },
  ]
  const g2 = buildGraph(ps, us)
  it.each([
    ['toi', 'cu', 'Cụ ông nội'],
    ['toi', 'ongchu', 'Ông chú'],
    ['toi', 'baco', 'Bà cô'],
    ['toi', 'chuho', 'Chú họ'],
    ['toi', 'emho2', 'Em họ'],
    ['toi', 'emkhac', 'Em gái'],
    ['toi', 'me2', 'Mẹ kế'],
    ['toi', 'chau', 'Cháu ngoại'],
    ['toi', 'chat', 'Chắt'],
    ['toi', 'vo', 'Vợ'],
    ['toi', 'vocu', 'Vợ cũ'],
    ['vo', 'con', 'Con riêng của chồng'],
    ['vo', 'cha', 'Cha chồng'],
    ['vo', 'ong', 'Ông nội chồng'],
    ['chat', 'toi', 'Cụ ông nội'],
    ['toi', 'la', 'Không có quan hệ'],
  ])('%s gọi %s là %s', (ego, other, expected) => {
    expect(relationOf(g2, ego, other).term).toBe(expected)
  })
  it('notes half siblings', () => {
    expect(relationOf(g2, 'toi', 'emkhac').note).toBe('cùng cha khác mẹ')
  })
})
