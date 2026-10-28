// ─── Okuyucu: veritabanı kayıtları ───────────────────────────────────────────
// Giriş yapmış öğrencinin kendi satırlarını okur/yazar. Güvenlik kuralları
// veritabanındadır; kitabı açma yetkisi yalnızca öğretmendedir, bu dosya
// hiçbir yerde "açık" bilgisi göndermez.

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, getAccessToken } from './auth'

export interface BookState {
  book_code: string
  unlocked: boolean
  current_section: number
  current_page: number
  visited_pages: number[]
}
export interface ReadingRow { book_code: string; section_no: number }
export interface WordMark { word_key: string; status: 'known' | 'learning'; first_book_code: string | null }

export interface StudentData {
  states: BookState[]
  readings: ReadingRow[]
  marks: WordMark[]
}

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken()
  if (!token) throw new Error('oturum yok')
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error('kayıt hatası ' + res.status)
  return res
}

export async function loadStudentData(studentId: string): Promise<StudentData> {
  const sid = encodeURIComponent(studentId)
  const [s, r, m] = await Promise.all([
    rest(`book_states?student_id=eq.${sid}&select=book_code,unlocked,current_section,current_page,visited_pages`),
    rest(`readings?student_id=eq.${sid}&select=book_code,section_no&limit=5000`),
    rest(`word_marks?student_id=eq.${sid}&select=word_key,status,first_book_code&limit=5000`),
  ])
  return { states: await s.json(), readings: await r.json(), marks: await m.json() }
}

// "unlocked" alanı bilerek gönderilmiyor: birleştirmeli yazmada mevcut değer korunur.
export async function saveBookState(studentId: string, bookCode: string, section: number, page: number, visited: number[]) {
  await rest('book_states?on_conflict=student_id,book_code', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ student_id: studentId, book_code: bookCode, current_section: section, current_page: page, visited_pages: visited }),
  })
}

export async function addReading(studentId: string, bookCode: string, section: number) {
  await rest('readings', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ student_id: studentId, book_code: bookCode, section_no: section }),
  })
}

export async function saveWordMark(studentId: string, wordKey: string, status: 'known' | 'learning', firstBook: string) {
  await rest('word_marks?on_conflict=student_id,word_key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ student_id: studentId, word_key: wordKey, status, first_book_code: firstBook }),
  })
}

export async function deleteWordMark(studentId: string, wordKey: string) {
  await rest(`word_marks?student_id=eq.${encodeURIComponent(studentId)}&word_key=eq.${encodeURIComponent(wordKey)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  })
}
