// ─── Canlı Ders raporları: veriyi okuma ───────────────────────────────────────
// Sadece öğretmen okuyabilir (kural veritabanında). Veritabanı tek seferde en
// fazla 1000 satır verdiği için uzun listeler sayfa sayfa okunur; böylece
// aylık raporda cevaplar yarım kalmaz.

import { sb, shortName } from './liveShared'
import type { LessonInfo, LessonKind, RawLesson, RawQuestion, RawAnswer, RawVerdict, RawAttendance, RawTurn } from './liveReportCalc'

const PAGE = 1000

async function pageAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message?: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message || 'okunamadı')
    const rows = (data || []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

export interface ReportClass { id: string; name: string; is_default: boolean }
export interface ReportStudent { id: string; name: string }

export async function loadClasses(): Promise<ReportClass[]> {
  const { data, error } = await sb.from('live_classes').select('id,name,is_default').order('created_at')
  if (error) throw new Error(error.message)
  return (data || []) as ReportClass[]
}

function one<T>(x: T | T[] | null | undefined): T | null {
  if (Array.isArray(x)) return x[0] ?? null
  return x ?? null
}

// Bir sınıfın BİTMİŞ dersleri (en yenisi başta).
export async function loadLessonList(classId: string): Promise<LessonInfo[]> {
  const { data, error } = await sb.from('live_sessions')
    .select('id,class_id,started_at,ended_at,kind,live_plans(title)')
    .eq('class_id', classId).eq('status', 'ended')
    .order('started_at', { ascending: false }).limit(500)
  if (error) throw new Error(error.message)
  return (data || []).map((r: any) => {
    const plan = one<{ title: string }>(r.live_plans)
    const kind: LessonKind = r.kind === 'oral' || r.kind === 'both' ? r.kind : 'written'
    return {
      id: r.id as string,
      classId: r.class_id as string,
      startedAt: new Date(r.started_at),
      endedAt: r.ended_at ? new Date(r.ended_at) : null,
      title: (plan?.title || '').trim() || 'Tahtadan ders',
      kind,
    }
  })
}

// Sınıfın şu anki öğrencileri ("Ali A." biçiminde).
export async function loadClassStudents(classId: string): Promise<ReportStudent[]> {
  const { data, error } = await sb.from('live_class_members').select('student_id, profiles(display_name, surname_initial, active)').eq('class_id', classId)
  if (error) throw new Error(error.message)
  const out: ReportStudent[] = []
  for (const r of (data || []) as any[]) {
    const p = one<{ display_name: string; surname_initial: string; active: boolean }>(r.profiles)
    if (p && p.active !== false) out.push({ id: r.student_id, name: shortName(p.display_name, p.surname_initial) })
  }
  return out
}

// Sınıftan ayrılmış ama o dönemde derse katılmış öğrencilerin adları.
export async function loadStudentNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const list = Array.from(new Set(ids))
  for (let i = 0; i < list.length; i += 40) {
    const { data, error } = await sb.from('profiles').select('id,display_name,surname_initial').in('id', list.slice(i, i + 40))
    if (error) throw new Error(error.message)
    for (const r of (data || []) as any[]) out.set(r.id, shortName(r.display_name, r.surname_initial))
  }
  return out
}

// Derslerin ham kayıtları (sorular, cevaplar, kararlar, yoklama, sözler).
export async function loadRawLessons(sessionIds: string[]): Promise<Map<string, RawLesson>> {
  const out = new Map<string, RawLesson>()
  for (const id of sessionIds) out.set(id, { questions: [], answers: [], verdicts: [], attendance: [], turns: [] })
  for (let i = 0; i < sessionIds.length; i += 10) {
    const ids = sessionIds.slice(i, i + 10)
    const [qs, ans, ver, att, turns] = await Promise.all([
      pageAll<any>((a, b) => sb.from('live_questions')
        .select('id,session_id,seq,kind,board,task,topic,closed_at,live_question_keys(expected)')
        .in('session_id', ids).order('id').range(a, b)),
      pageAll<RawAnswer>((a, b) => sb.from('live_answers')
        .select('id,question_id,session_id,student_id,text,attempt_no,response_ms,submitted_at')
        .in('session_id', ids).order('id').range(a, b)),
      pageAll<RawVerdict & { session_id: string }>((a, b) => sb.from('live_verdicts')
        .select('question_id,student_id,session_id,teacher_status,one_on_one,unanswered')
        .in('session_id', ids).order('question_id').order('student_id').range(a, b)),
      pageAll<RawAttendance>((a, b) => sb.from('live_attendance')
        .select('session_id,student_id,joined_at,drop_count')
        .in('session_id', ids).order('session_id').order('student_id').range(a, b)),
      pageAll<RawTurn>((a, b) => sb.from('live_oral_turns')
        .select('id,session_id,question_id,student_id,prompt,topic,seq,is_second,result,one_on_one')
        .in('session_id', ids).order('id').range(a, b)),
    ])
    for (const r of qs) {
      const key = one<{ expected: string }>(r.live_question_keys)
      const q: RawQuestion = {
        id: r.id, session_id: r.session_id, seq: r.seq, kind: r.kind, board: r.board, task: r.task || '', topic: r.topic || '',
        expected: key?.expected || '', closed_at: r.closed_at || null,
      }
      out.get(q.session_id)?.questions.push(q)
    }
    for (const r of ans) out.get(r.session_id)?.answers.push(r)
    for (const r of ver) out.get(r.session_id)?.verdicts.push(r)
    for (const r of att) out.get(r.session_id)?.attendance.push(r)
    for (const r of turns) out.get(r.session_id)?.turns.push(r)
  }
  return out
}
