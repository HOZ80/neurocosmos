// ─── Canlı Ders raporları: Excel dosyası ──────────────────────────────────────
// Dosya tarayıcıda oluşturulur ve indirilir; sunucu ya da ek servis yoktur.
// Sayfalar: 1 Öğrenciler, 2 Konular, 3 Tüm cevaplar, 4 Sözlü (sadece söz sırası
// kaydı varsa). PDF yoktur.

import type { LessonCalc } from './liveReportCalc'
import { aggStudents, aggKonu, struggling, hasOral, konuOf, isoDate, RESULT_LABEL, asciiSafe, fileSafe } from './liveReportCalc'

export interface ExcelInput {
  className: string
  periodLabel: string
  lessons: LessonCalc[]
  students: { id: string; name: string }[]
}

type Cell = string | number | null | { value: string | number; fontWeight?: 'bold' }

export function excelFileName(className: string, periodLabel: string): string {
  return `Rapor_${asciiSafe(className) || 'Sinif'}_${fileSafe(periodLabel) || 'Donem'}.xlsx`
}

export function buildSheets(inp: ExcelInput) {
  const ls = inp.lessons.slice().sort((a, b) => a.info.startedAt.getTime() - b.info.startedAt.getTime())
  const students = inp.students.slice().sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  const nameOf = (id: string) => students.find(s => s.id === id)?.name || '?'
  const A = aggStudents(ls, students.map(s => s.id))
  const K = aggKonu(ls)
  const o = hasOral(ls)
  const head = (cols: string[]): Cell[] => cols.map(c => ({ value: c, fontWeight: 'bold' as const }))

  // 1 Öğrenciler
  const s1: Cell[][] = [head(['Öğrenci', 'Katılım', 'Doğru', 'Yakın', 'Yanlış', 'Cevapsız', ...(o ? ['Söz', 'İlk denemede doğru', 'Düzeltmeden sonra doğru', 'Yapamadı'] : []), 'Birebir destek'])]
  for (const s of students) {
    const a = A[s.id]
    s1.push([s.name, `${a.pres}/${ls.length}`, a.d, a.y, a.x, a.c, ...(o ? [a.s, a.i, a.dz, a.yp] : []), a.bb])
  }

  // 2 Konular
  const s2: Cell[][] = [head(['Konu', 'Yazılı soru', 'Doğru', 'Yakın', 'Yanlış', 'Cevapsız', ...(o ? ['Söz', 'İlk denemede doğru', 'Düzeltmeden sonra doğru', 'Yapamadı'] : []), 'Zorlananlar'])]
  for (const k of Object.keys(K)) {
    const v = K[k]
    const hard = Object.keys(v.st).filter(id => struggling(v.st[id])).map(nameOf).sort((a, b) => a.localeCompare(b, 'tr'))
    s2.push([k, v.qs.size, v.tot.d, v.tot.y, v.tot.x, v.tot.c, ...(o ? [v.tot.s, v.tot.i, v.tot.dz, v.tot.yp] : []), hard.join(', ') || '-'])
  }

  // 3 Tüm cevaplar (her deneme ayrı satır; hiç cevap vermeyenler "Cevapsız" satırı)
  const s3: Cell[][] = [head(['Tarih', 'Ders', 'Soru', 'Konu', 'Öğrenci', 'Deneme', 'Cevap', 'Sonuç', 'Süre (sn)'])]
  for (const l of ls) {
    const date = isoDate(l.info.startedAt)
    const evs = l.wEv.slice().sort((a, b) => a.q - b.q || nameOf(a.s).localeCompare(nameOf(b.s), 'tr'))
    for (const e of evs) {
      const q = l.w[e.q]
      if (!e.att.length) { s3.push([date, l.info.title, q.text, konuOf(q.topic), nameOf(e.s), null, '', RESULT_LABEL.cevapsiz, null]); continue }
      for (const t of e.att) s3.push([date, l.info.title, q.text, konuOf(q.topic), nameOf(e.s), t.n, t.text, RESULT_LABEL[t.r], t.sec])
    }
  }

  // 4 Sözlü
  const s4: Cell[][] = [head(['Tarih', 'Ders', 'Soru', 'Konu', 'Öğrenci', 'Sonuç', 'Birebir destek'])]
  if (o) {
    for (const l of ls) {
      const date = isoDate(l.info.startedAt)
      for (const e of l.oEv) {
        const q = l.o[e.q]
        s4.push([date, l.info.title, q.text, konuOf(q.topic), nameOf(e.s), RESULT_LABEL[e.r], e.bb ? 'evet' : ''])
      }
    }
  }
  return { s1, s2, s3, s4, hasOral: o }
}

export async function downloadReportExcel(inp: ExcelInput): Promise<string> {
  const { s1, s2, s3, s4, hasOral: o } = buildSheets(inp)
  const { default: writeExcelFile } = await import('write-excel-file/universal')
  const w = (n: number) => ({ width: n })
  const sheets: any[] = [
    { data: s1, sheet: 'Öğrenciler', stickyRowsCount: 1, columns: [w(18), w(10), w(9), w(9), w(9), w(11), ...(o ? [w(8), w(20), w(24), w(11)] : []), w(14)] },
    { data: s2, sheet: 'Konular', stickyRowsCount: 1, columns: [w(28), w(12), w(9), w(9), w(9), w(11), ...(o ? [w(8), w(20), w(24), w(11)] : []), w(36)] },
    { data: s3, sheet: 'Tüm cevaplar', stickyRowsCount: 1, columns: [w(12), w(26), w(36), w(22), w(14), w(9), w(34), w(18), w(10)] },
  ]
  if (o) sheets.push({ data: s4, sheet: 'Sözlü', stickyRowsCount: 1, columns: [w(12), w(26), w(36), w(22), w(14), w(24), w(14)] })
  const blob: Blob = await (writeExcelFile as any)(sheets).toBlob()
  const name = excelFileName(inp.className, inp.periodLabel)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10000)
  return name
}
