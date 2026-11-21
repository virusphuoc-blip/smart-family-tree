import { emptyPerson, type Gender, type LifeEvent, type Person, type Union } from '../types'

type Row = [id: string, name: string, gender: Gender, birth: string, death: string, father: string, mother: string, place: string, job: string, nick?: string]

const ROWS: Row[] = [
  ['to', 'Nguyễn Văn Tổ', 'male', '1930-02-10', '2005-11-03', '', '', 'Nam Định', 'Nông dân', 'Ông Cả'],
  ['lanh', 'Trần Thị Lành', 'female', '1934', '2015-06-21', '', '', 'Nam Định', 'Nội trợ'],
  ['phuc', 'Lê Văn Phúc', 'male', '1932', '2010-01-15', '', '', 'Thanh Hoá', 'Thầy giáo'],
  ['cuc', 'Hoàng Thị Cúc', 'female', '1936-08-05', '', '', '', 'Thanh Hoá', 'Thợ may'],
  ['dung', 'Nguyễn Văn Dũng', 'male', '1955-03-12', '', 'to', 'lanh', 'Nam Định', 'Bộ đội về hưu'],
  ['hoa', 'Phạm Thị Hoa', 'female', '1958', '', '', '', 'Hà Nam', 'Giáo viên'],
  ['hung', 'Nguyễn Văn Hùng', 'male', '1958-09-02', '', 'to', 'lanh', 'Nam Định', 'Kỹ sư xây dựng'],
  ['mai', 'Lê Thị Mai', 'female', '1962-04-18', '', 'phuc', 'cuc', 'Thanh Hoá', 'Bác sĩ'],
  ['tuan', 'Nguyễn Văn Tuấn', 'male', '1962-12-25', '', 'to', 'lanh', 'Nam Định', 'Lái xe'],
  ['hanh', 'Nguyễn Thị Hạnh', 'female', '1965-07-07', '', 'to', 'lanh', 'Nam Định', 'Kế toán'],
  ['son', 'Lê Văn Sơn', 'male', '1965-10-10', '', 'phuc', 'cuc', 'Thanh Hoá', 'Kinh doanh'],
  ['hong', 'Lê Thị Hồng', 'female', '1968-01-30', '', 'phuc', 'cuc', 'Thanh Hoá', 'Dược sĩ'],
  ['khoa', 'Nguyễn Văn Khoa', 'male', '1982-05-20', '', 'dung', 'hoa', 'Hà Nội', 'Lập trình viên'],
  ['lan', 'Nguyễn Thị Lan', 'female', '1985-11-11', '', 'hung', 'mai', 'Hà Nội', 'Giảng viên'],
  ['minh', 'Nguyễn Văn Minh', 'male', '1988-06-15', '', 'hung', 'mai', 'Hà Nội', 'Kiến trúc sư', 'Tí'],
  ['nam', 'Nguyễn Văn Nam', 'male', '1992-02-28', '', 'hung', 'mai', 'Hà Nội', 'Sinh viên cao học'],
  ['thao', 'Lê Thị Thảo', 'female', '1995-09-09', '', 'son', '', 'Thanh Hoá', 'Nhà thiết kế'],
]

const UNIONS: [string, string, string][] = [
  ['to', 'lanh', '1953'],
  ['phuc', 'cuc', '1958'],
  ['dung', 'hoa', '1980-10-01'],
  ['hung', 'mai', '1984-12-20'],
]

const EVENTS: [string, string, string, string][] = [
  ['to', '1954', 'Tham gia chiến dịch Điện Biên Phủ', 'Ông Tổ là dân công hoả tuyến.'],
  ['hung', '1981', 'Tốt nghiệp Đại học Xây dựng', ''],
  ['', '1995-02-01', 'Xây lại nhà thờ họ', 'Cả gia đình góp công xây lại nhà thờ họ ở Nam Định.'],
  ['minh', '2011-07-01', 'Tốt nghiệp Đại học Kiến trúc Hà Nội', ''],
]

export const DEMO_TREE_NAME = 'Gia đình mẫu họ Nguyễn'
export const DEMO_TREE_DESCRIPTION = 'Cây gia phả mẫu 3 thế hệ (17 thành viên) để dùng thử: có đủ bên nội, bên ngoại.'

export function demoData(prefix = 'd-'): { people: Person[]; unions: Union[]; events: LifeEvent[] } {
  const id = (s: string) => (s ? prefix + s : '')
  const now = Date.now()
  const people = ROWS.map(([pid, name, gender, birth, death, father, mother, place, job, nick]) => ({
    ...emptyPerson(id(pid)),
    fullName: name,
    nickname: nick ?? '',
    gender,
    birthDate: birth,
    deathDate: death,
    deceased: !!death,
    birthPlace: place,
    occupation: job,
    fatherId: id(father),
    motherId: id(mother),
    createdAt: now,
    updatedAt: now,
  }))
  const unions = UNIONS.map(([a, b, start]) => ({ id: id(`u-${a}-${b}`), a: id(a), b: id(b), startDate: start, endDate: '', divorced: false, note: '' }))
  const events = EVENTS.map(([p, date, title, description], i) => ({ id: id(`e${i}`), personId: id(p), date, title, description }))
  return { people, unions, events }
}
