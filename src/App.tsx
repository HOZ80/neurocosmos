import { useState, useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Level = 'A1' | 'A2' | 'B1' | 'B2'
type View = 'dashboard' | 'unit' | 'grammar' | 'audio' | 'dictation' | 'shadowing'

interface DictationSegment {
  start: number
  end: number
  text: string
}

interface GrammarBlock {
  kind: 'box' | 'list' | 'sentence'
  label: string
  en?: string
  tr?: string
  items?: { term: string; explanation: string }[]
}

interface QuestionItem {
  label: string
  sectionTitle?: string
  question: string
  questionAudioUrl?: string
  questionTranslation?: string
  explanation?: string
  preDefinitionTitle?: string
  preDefinitionText?: string
  preAnalogy?: string
  answerEn?: string
  answerTr?: string
  answerAudioUrl?: string
  postDefinitionTitle?: string
  postDefinitionText?: string
  postAnalogy?: string
  blocks?: GrammarBlock[]
  videoUrl?: string
}

interface Unit {
  id: number
  title: string
  topic: string
  grammar: string
  completed: boolean
  locked: boolean
  progress: number
  dictationSentence: string
  translation: string
  transcript: string
  audioUrl?: string
  dictationSegments?: DictationSegment[]
  readingTitle?: string
  grammarPlaceholder?: boolean
  unitLabel?: string
  moduleLocks?: Partial<Record<'grammar' | 'audio' | 'dictation' | 'shadowing', boolean>>
  hidePracticeSentence?: boolean
  videoUrl?: string
  passiveVideo?: boolean
  customGrammarBlocks?: GrammarBlock[]
  questionChain?: QuestionItem[]
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const GRAMMAR_RULES: Record<string, { rule: string; ruleTr: string; examples: { en: string; tr: string; highlight: string }[] }> = {
  'Subject Pronouns': {
    rule: 'Subject pronouns replace nouns as the subject of a sentence. They tell us who or what performs the action of the verb.',
    ruleTr: 'Özne zamirleri, cümlenin öznesi olarak isimlerin yerini alır. Eylemi kimin veya neyin yaptığını gösterirler.',
    examples: [
      { en: 'I am a student.', tr: 'Ben bir öğrenciyim.', highlight: 'I' },
      { en: 'She speaks English very well.', tr: 'O İngilizceyi çok iyi konuşuyor.', highlight: 'She' },
      { en: 'They live in London.', tr: 'Onlar Londra\'da yaşıyor.', highlight: 'They' },
    ],
  },
  'Simple Present': {
    rule: 'Use the simple present for habits, routines, and general truths. Add -s/-es for third person singular (he/she/it).',
    ruleTr: 'Alışkanlıklar, rutinler ve genel doğrular için geniş zaman kullanılır. Üçüncü tekil şahısta (he/she/it) fiile -s/-es eklenir.',
    examples: [
      { en: 'She works at a hospital every day.', tr: 'O her gün bir hastanede çalışıyor.', highlight: 'works' },
      { en: 'The sun rises in the east.', tr: 'Güneş doğudan doğar.', highlight: 'rises' },
      { en: 'We study English together.', tr: 'Birlikte İngilizce çalışıyoruz.', highlight: 'study' },
    ],
  },
  'Present Continuous': {
    rule: 'Use present continuous for actions happening right now or temporary situations. Form: am/is/are + verb-ing.',
    ruleTr: 'Şu anda gerçekleşen eylemler veya geçici durumlar için şimdiki zaman kullanılır. Yapısı: am/is/are + fiil-ing.',
    examples: [
      { en: 'I am reading a book right now.', tr: 'Şu an bir kitap okuyorum.', highlight: 'am reading' },
      { en: 'They are working on a new project.', tr: 'Yeni bir proje üzerinde çalışıyorlar.', highlight: 'are working' },
    ],
  },
  'Past Simple': {
    rule: 'Use past simple for completed actions in the past. Regular verbs add -ed; irregular verbs change form.',
    ruleTr: 'Geçmişte tamamlanmış eylemler için geçmiş zaman kullanılır. Düzenli fiillere -ed eklenir; düzensiz fiiller farklı bir forma bürünür.',
    examples: [
      { en: 'She visited Paris last summer.', tr: 'Geçen yaz Paris\'i ziyaret etti.', highlight: 'visited' },
      { en: 'We went to the cinema yesterday.', tr: 'Dün sinemaya gittik.', highlight: 'went' },
    ],
  },
  'Future Plans': {
    rule: 'Use "going to" for plans and intentions you\'ve already decided, or for predictions based on evidence.',
    ruleTr: 'Önceden karar verilmiş planlar/niyetler için ya da kanıta dayalı tahminler için "going to" kullanılır.',
    examples: [
      { en: 'I am going to study abroad next year.', tr: 'Gelecek yıl yurt dışında okuyacağım.', highlight: 'am going to' },
      { en: 'It is going to rain soon.', tr: 'Yakında yağmur yağacak.', highlight: 'is going to' },
    ],
  },
}

function buildUnits(level: Level): Unit[] {
  const sets: Record<Level, Omit<Unit, 'id' | 'completed' | 'locked' | 'progress'>[]> = {
    A1: [
      { title: 'I Want This', topic: 'Requests', grammar: 'Want / Would Like', grammarPlaceholder: true, readingTitle: "Jessica's First Day of School", dictationSentence: "Today is Jessica's first day of kindergarten.", translation: 'Bugün Jessica\'nın anaokulundaki ilk günü.', transcript: "Jessica's first day of school. Today is Jessica's first day of kindergarten, and her parents walk to school. Jessica's mom walks with her to her classroom. Jessica meets her teacher. His name is Mr. Parker. The school bell rings at 8:45 a.m. Jessica hugs and kisses her mom goodbye. Jessica's mom says, \"I love you.\" At 9:00 a.m., Jessica stands for the national anthem. Mr. Parker calls out children's names. Each child yells back, \"Here\". Mr. Parker teaches them about letters. Mr. Parker teaches them about numbers. At 10:15 a.m., the students have recess. Recess is fun. The students get to play and eat. At 10:30 a.m., the students go to gym class. At 11:15 a.m., the students return to Mr. Parker's classroom. Mr. Parker tells the students to sit on the carpet. Mr. Parker reads the students a story. Mr. Parker teaches the students a song. The lunch bell rings.", audioUrl: '/jessicas-first-day.mp3', dictationSegments: [
        {"start":0.48,"end":4.0,"text":"Jessica's first day of school."},
        {"start":4.0,"end":8.33,"text":"Today is Jessica's first day of kindergarten."},
        {"start":8.5,"end":12.0,"text":"and her parents walk to school."},
        {"start":12.0,"end":16.67,"text":"Jessica's mom walks with her to her classroom."},
        {"start":16.83,"end":20.0,"text":"Jessica meets her teacher."},
        {"start":20.17,"end":23.17,"text":"His name is Mr. Parker."},
        {"start":23.17,"end":28.33,"text":"The school bell rings at 8:45 a.m."},
        {"start":30.56,"end":33.0,"text":"Jessica hugs and kisses her mom goodbye."},
        {"start":33.0,"end":37.5,"text":"Jessica's mom says, \"I love you.\""},
        {"start":37.5,"end":43.67,"text":"At 9:00 a.m., Jessica stands for the national anthem."},
        {"start":43.67,"end":47.83,"text":"Mr. Parker calls out children's names."},
        {"start":47.83,"end":51.5,"text":"Each child yells back, \"Here\"."},
        {"start":51.67,"end":56.17,"text":"Mr. Parker teaches them about letters."},
        {"start":56.17,"end":60.83,"text":"Mr. Parker teaches them about numbers."},
        {"start":61.0,"end":66.5,"text":"At 10:15 a.m., the students have recess."},
        {"start":66.5,"end":69.33,"text":"Recess is fun."},
        {"start":69.5,"end":73.0,"text":"The students get to play and eat."},
        {"start":73.17,"end":79.17,"text":"At 10:30 a.m., the students go to gym class."},
        {"start":79.17,"end":85.67,"text":"At 11:15 a.m., the students return to Mr. Parker's classroom."},
        {"start":85.83,"end":90.5,"text":"Mr. Parker tells the students to sit on the carpet."},
        {"start":90.5,"end":94.17,"text":"Mr. Parker reads the students a story."},
        {"start":94.17,"end":98.83,"text":"Mr. Parker teaches the students a song."},
        {"start":98.83,"end":101.67,"text":"The lunch bell rings."}
      ] },
      { title: 'Who Are You?', topic: 'Self & Others', grammar: 'To Be & Have', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'What Is This?', topic: 'Pointing', grammar: 'Demonstratives', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'Where Am I?', topic: 'Places', grammar: 'There Is / Are', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'A Normal Day', topic: 'Routines', grammar: 'Simple Present', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'What Time Is It?', topic: 'Time', grammar: 'Prepositions of Time', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'Let\'s Go', topic: 'Movement', grammar: 'Go / Come', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'I Love This', topic: 'Preferences', grammar: 'Like + Noun / -ing', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'My Family', topic: 'Family', grammar: 'Possessives & Plurals', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'What Are They Like?', topic: 'Description', grammar: 'Adjectives', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'How Do I Feel?', topic: 'Feelings', grammar: 'Feel + Adjective', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'I\'d Like This', topic: 'Shopping', grammar: 'Quantifiers', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'I\'m Lost', topic: 'Directions', grammar: 'Imperatives', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'I Don\'t Feel Well', topic: 'Health', grammar: 'Have Got', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'Staying in Touch', topic: 'Communication', grammar: 'Can / Could (requests)', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'What Happened Yesterday?', topic: 'Past', grammar: 'Simple Past', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'What\'s Happening Now?', topic: 'Present', grammar: 'Present Continuous', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'What\'s Next?', topic: 'Future', grammar: 'Going To', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'Let Me Tell You...', topic: 'Storytelling', grammar: 'Sequencing Words', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'Which Is Better?', topic: 'Comparison', grammar: 'Comparatives', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'What I Can Do', topic: 'Ability', grammar: 'Can / Can\'t', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'Could You Help Me?', topic: 'Polite Requests', grammar: 'Can / Could / Let\'s', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'Putting It All Together', topic: 'Review', grammar: 'Mixed Review', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
    ],
    A2: [
      { title: 'I Want This', topic: 'Requests', grammar: 'Want / Would Like', grammarPlaceholder: true, readingTitle: "Jessica's First Day of School", dictationSentence: "Today is Jessica's first day of kindergarten.", translation: 'Bugün Jessica\'nın anaokulundaki ilk günü.', transcript: "Jessica's first day of school. Today is Jessica's first day of kindergarten, and her parents walk to school. Jessica's mom walks with her to her classroom. Jessica meets her teacher. His name is Mr. Parker. The school bell rings at 8:45 a.m. Jessica hugs and kisses her mom goodbye. Jessica's mom says, \"I love you.\" At 9:00 a.m., Jessica stands for the national anthem. Mr. Parker calls out children's names. Each child yells back, \"Here\". Mr. Parker teaches them about letters. Mr. Parker teaches them about numbers. At 10:15 a.m., the students have recess. Recess is fun. The students get to play and eat. At 10:30 a.m., the students go to gym class. At 11:15 a.m., the students return to Mr. Parker's classroom. Mr. Parker tells the students to sit on the carpet. Mr. Parker reads the students a story. Mr. Parker teaches the students a song. The lunch bell rings.", audioUrl: '/jessicas-first-day.mp3', dictationSegments: [
        {"start":0.48,"end":4.0,"text":"Jessica's first day of school."},
        {"start":4.0,"end":8.33,"text":"Today is Jessica's first day of kindergarten."},
        {"start":8.5,"end":12.0,"text":"and her parents walk to school."},
        {"start":12.0,"end":16.67,"text":"Jessica's mom walks with her to her classroom."},
        {"start":16.83,"end":20.0,"text":"Jessica meets her teacher."},
        {"start":20.17,"end":23.17,"text":"His name is Mr. Parker."},
        {"start":23.17,"end":28.33,"text":"The school bell rings at 8:45 a.m."},
        {"start":30.56,"end":33.0,"text":"Jessica hugs and kisses her mom goodbye."},
        {"start":33.0,"end":37.5,"text":"Jessica's mom says, \"I love you.\""},
        {"start":37.5,"end":43.67,"text":"At 9:00 a.m., Jessica stands for the national anthem."},
        {"start":43.67,"end":47.83,"text":"Mr. Parker calls out children's names."},
        {"start":47.83,"end":51.5,"text":"Each child yells back, \"Here\"."},
        {"start":51.67,"end":56.17,"text":"Mr. Parker teaches them about letters."},
        {"start":56.17,"end":60.83,"text":"Mr. Parker teaches them about numbers."},
        {"start":61.0,"end":66.5,"text":"At 10:15 a.m., the students have recess."},
        {"start":66.5,"end":69.33,"text":"Recess is fun."},
        {"start":69.5,"end":73.0,"text":"The students get to play and eat."},
        {"start":73.17,"end":79.17,"text":"At 10:30 a.m., the students go to gym class."},
        {"start":79.17,"end":85.67,"text":"At 11:15 a.m., the students return to Mr. Parker's classroom."},
        {"start":85.83,"end":90.5,"text":"Mr. Parker tells the students to sit on the carpet."},
        {"start":90.5,"end":94.17,"text":"Mr. Parker reads the students a story."},
        {"start":94.17,"end":98.83,"text":"Mr. Parker teaches the students a song."},
        {"start":98.83,"end":101.67,"text":"The lunch bell rings."}
      ] },
      {
        title: 'Foundations and Rules',
        topic: 'Interview',
        grammar: 'Constitution, Principles and Rights / 1st - 12th',
        unitLabel: '100Q',
        hidePracticeSentence: true,
        dictationSentence: '',
        translation: '',
        transcript: '',
        questionChain: [
          {
            label: '1st Question',
            question: 'What is the supreme law of the land?',
            questionAudioUrl: '/civics-q1-question.mp3',
            questionTranslation: 'Ülkenin en yüksek kanunu nedir?',
            preDefinitionTitle: 'Supreme law of the land',
            preDefinitionText: 'Belirli bir ülkenin coğrafi/hukuki sınırları içindeki en üstün yasasını tanımlar.',
            preAnalogy: 'Hukuk sisteminde yasalar bir piramit gibidir. Piramidin en tepesinde yer alan metin supreme lawdur.',
            answerEn: 'The Constitution',
            answerTr: 'Anayasa',
            answerAudioUrl: '/civics-q1-answer.mp3',
            postAnalogy: 'Devletin gücünü sınırlandıran, vatandaşların temel haklarını güvenceye alan ve ülkedeki diğer tüm kuralları bağlayan en yetkili, en üstün yasa anlamına gelir. Eğer meclis, Anayasa\'ya aykırı bir yasa çıkarırsa, o yasa geçersiz sayılır veya iptal edilir. Onu bir "Ana Kural Kitabı" olarak düşünürsek, ülkede yazılan hiçbir alt kural, bu ana kitabın kurallarına aykırı olamaz.',
            videoUrl: '/civics-q1.mp4',
          },
          { label: '2nd Question', question: 'Content will be added soon.' },
          { label: '3rd Question', question: 'Content will be added soon.' },
          { label: '4th Question', question: 'Content will be added soon.' },
          { label: '5th Question', question: 'Content will be added soon.' },
        ],
      },
      { title: 'Introducing Myself, Extended', topic: 'Self', grammar: 'Present Simple vs Continuous', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'Comparing Things', topic: 'Comparison', grammar: 'Comparatives & Superlatives', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'Personality & Character', topic: 'Personality', grammar: 'Adverbs of Frequency', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'My Opinions', topic: 'Opinions', grammar: 'Because & So', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'Likes & Preferences', topic: 'Preferences', grammar: 'Prefer / Would rather', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'What I Was Doing', topic: 'Past Continuous', grammar: 'Past Continuous', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'Have You Ever...?', topic: 'Present Perfect', grammar: 'Present Perfect', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'Since & For', topic: 'Duration', grammar: 'Since / For', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'My Life Experiences', topic: 'Life Experiences', grammar: 'Present Perfect vs Past Simple', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'My Future Plans', topic: 'Future Plans', grammar: 'Will vs Going to', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'Requests & Permission', topic: 'Requests', grammar: 'Can / Could / May', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'Advice & Obligation', topic: 'Advice', grammar: 'Should / Must / Have to', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'Travel & Trips', topic: 'Travel', grammar: 'Travel Prepositions', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'Phone & Email', topic: 'Communication', grammar: 'Reported Speech (basic)', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'Appointments & Plans', topic: 'Appointments', grammar: 'Future Time Clauses', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'Telling a Story', topic: 'Storytelling', grammar: 'Sequencing Words', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'If This Happens', topic: 'Conditionals', grammar: 'First Conditional', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'Rules & Permission', topic: 'Obligation', grammar: "Must / Mustn't / Don't have to", grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'News & Media', topic: 'Media', grammar: 'Passive Voice (intro)', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'Technology & Daily Life', topic: 'Technology', grammar: 'Present Perfect Continuous (intro)', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'Working Life', topic: 'Work Life', grammar: 'Question Tags', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'Formal Situations', topic: 'Formal Situations', grammar: 'Formal vs Informal Language', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'Solving Problems', topic: 'Problem Solving', grammar: 'Modal Verbs of Deduction', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'Culture & Traditions', topic: 'Culture', grammar: 'Relative Clauses', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
      { title: 'A2 Complete Review & Bridge to B1', topic: 'Review', grammar: 'Mixed Review', grammarPlaceholder: true, dictationSentence: 'Example sentence.', translation: 'Example sentence.', transcript: 'Unit content will be added after this lesson is taught.' },
    ],
    B1: [
      { title: 'Present Perfect vs Past', topic: 'Tense comparison', grammar: 'Present Continuous', dictationSentence: 'I have lived in this city since I was a child.', translation: 'Çocukluğumdan beri bu şehirde yaşıyorum.', transcript: 'Tell me about where you live. I have lived in this city since I was a child. I know every street very well.' },
      { title: 'Passive Voice', topic: 'Passive structures', grammar: 'Simple Present', dictationSentence: 'The report was written by the team leader.', translation: 'Rapor ekip lideri tarafından yazıldı.', transcript: 'Who wrote the report? The report was written by the team leader. It was submitted before the deadline.' },
      { title: 'Reported Speech', topic: 'Indirect speech', grammar: 'Past Simple', dictationSentence: 'She said that she would call me in the morning.', translation: 'Sabah beni arayacağını söyledi.', transcript: 'Did she leave a message? She said that she would call me in the morning. I am still waiting for her call.' },
      { title: 'Second Conditional', topic: 'Hypothetical situations', grammar: 'Future Plans', dictationSentence: 'If I won the lottery, I would travel the world.', translation: 'Piyangoyu kazansaydım dünyayı gezerdi.', transcript: 'What would you do? If I won the lottery, I would travel the world for at least a year. Everywhere I dream about.' },
      { title: 'Third Conditional', topic: 'Unreal past', grammar: 'Past Simple', dictationSentence: 'If she had studied harder, she would have passed.', translation: 'Daha çok çalışsaydı geçebilirdi.', transcript: 'What a shame about the exam. If she had studied harder, she would have passed. It was a close result though.' },
      { title: 'Modal Perfect', topic: 'Modals in past', grammar: 'Simple Present', dictationSentence: 'He should have arrived by now.', translation: 'O şimdiye kadar gelmiş olmalıydı.', transcript: 'Where is he? He should have arrived by now. He left home three hours ago. I hope everything is alright.' },
      { title: 'Relative Clauses', topic: 'Who, which, that', grammar: 'Simple Present', dictationSentence: 'The woman who called this morning was my aunt.', translation: 'Bu sabah arayan kadın teyzimdi.', transcript: 'Did you speak to the caller? The woman who called this morning was my aunt. She wanted to invite us for dinner.' },
      { title: 'Gerunds & Infinitives', topic: 'Verb patterns', grammar: 'Present Continuous', dictationSentence: 'She enjoys listening to classical music while studying.', translation: 'Ders çalışırken klasik müzik dinlemeyi seviyor.', transcript: 'What does she like? She enjoys listening to classical music while studying. She says it helps her concentrate better.' },
      { title: 'Expressing Regret', topic: 'I wish / If only', grammar: 'Past Simple', dictationSentence: 'I wish I had taken that job opportunity.', translation: 'Keşke o iş fırsatını kaçırmasaydım.', transcript: 'Do you have any regrets? I wish I had taken that job opportunity. It would have changed my life completely.' },
      { title: 'Formal Writing', topic: 'Academic register', grammar: 'Simple Present', dictationSentence: 'The results indicate a significant improvement.', translation: 'Sonuçlar önemli bir iyileşmeye işaret ediyor.', transcript: 'What do the data show? The results indicate a significant improvement in students\' performance over the term.' },
      { title: 'Cause & Effect', topic: 'Linking words', grammar: 'Simple Present', dictationSentence: 'Due to heavy traffic, the bus arrived late.', translation: 'Yoğun trafik nedeniyle otobüs geç geldi.', transcript: 'Why were you late? Due to heavy traffic, the bus arrived forty minutes late. I apologise for the inconvenience.' },
      { title: 'Expressing Opinions', topic: 'Discourse markers', grammar: 'Simple Present', dictationSentence: 'In my opinion, reading is the best way to improve.', translation: 'Bana göre okumak gelişmenin en iyi yoludur.', transcript: 'What do you think? In my opinion, reading is the best way to improve your vocabulary and comprehension.' },
      { title: 'Describing Trends', topic: 'Data language', grammar: 'Present Continuous', dictationSentence: 'The number of online learners is increasing rapidly.', translation: 'Çevrimiçi öğrenci sayısı hızla artıyor.', transcript: 'What does the graph show? The number of online learners is increasing rapidly, especially among adults over thirty.' },
      { title: 'Narrative Tenses', topic: 'Telling stories', grammar: 'Past Simple', dictationSentence: 'While she was walking home, she found a wallet.', translation: 'Eve yürürken bir cüzdan buldu.', transcript: 'Tell me what happened. While she was walking home, she found a wallet on the pavement near the park.' },
      { title: 'Concession', topic: 'Although, however', grammar: 'Simple Present', dictationSentence: 'Although it was raining, they continued playing.', translation: 'Yağmur yağmasına rağmen oynamaya devam ettiler.', transcript: 'Why did they keep playing? Although it was raining, they continued playing because the match was almost over.' },
      { title: 'Academic Vocabulary', topic: 'IELTS word bank', grammar: 'Simple Present', dictationSentence: 'The study demonstrates a clear correlation.', translation: 'Çalışma açık bir korelasyon ortaya koyuyor.', transcript: 'Summarise the research. The study demonstrates a clear correlation between sleep quality and academic performance.' },
      { title: 'Presentations', topic: 'Formal speaking', grammar: 'Present Continuous', dictationSentence: 'I would like to begin by explaining the background.', translation: 'Arka planı açıklayarak başlamak istiyorum.', transcript: 'Please start your presentation. I would like to begin by explaining the background of our research project.' },
      { title: 'Negotiation', topic: 'Business English', grammar: 'Future Plans', dictationSentence: 'We would be willing to lower the price slightly.', translation: 'Fiyatı biraz düşürmeye razı oluruz.', transcript: 'Can we reach an agreement? We would be willing to lower the price slightly if you increase your order volume.' },
      { title: 'Culture & Values', topic: 'Intercultural topics', grammar: 'Simple Present', dictationSentence: 'Different cultures have different approaches to time.', translation: 'Farklı kültürlerin zamana farklı yaklaşımları vardır.', transcript: 'Let us discuss cultural differences. Different cultures have different approaches to time and punctuality.' },
      { title: 'B1 Final Review', topic: 'B1 Complete review', grammar: 'Present Continuous', dictationSentence: 'My English is getting better every single day.', translation: 'İngilizcim her geçen gün daha da iyileşiyor.', transcript: 'You have completed B1! My English is getting better every single day. I am proud of all the progress I have made.' },
    ],
    B2: [
      { title: 'Advanced Conditionals', topic: 'Mixed conditionals', grammar: 'Future Plans', dictationSentence: 'Had she known, she would not have agreed to it.', translation: 'Bilseydi buna razı olmayacaktı.', transcript: 'What do you think she would have done? Had she known, she would not have agreed to it under any circumstances.' },
      { title: 'Inversion & Emphasis', topic: 'Fronting structures', grammar: 'Simple Present', dictationSentence: 'Never have I seen such a remarkable performance.', translation: 'Bu kadar olağanüstü bir performans hiç görmedim.', transcript: 'How did you find the concert? Never have I seen such a remarkable performance. The soloist was extraordinary.' },
      { title: 'Discourse & Cohesion', topic: 'Coherent writing', grammar: 'Simple Present', dictationSentence: 'Nevertheless, the evidence strongly supports this view.', translation: 'Bununla birlikte, kanıtlar bu görüşü güçlü biçimde desteklemektedir.', transcript: 'Continue your argument. Nevertheless, the evidence strongly supports this view, despite the initial scepticism.' },
      { title: 'Idiomatic Language', topic: 'Phrasal verbs', grammar: 'Present Continuous', dictationSentence: 'She put off the meeting until further notice.', translation: 'Toplantıyı bir sonraki duyuruya kadar erteledi.', transcript: 'Was the meeting cancelled? She put off the meeting until further notice due to unforeseen circumstances.' },
      { title: 'Academic Writing', topic: 'Essay structure', grammar: 'Simple Present', dictationSentence: 'This essay will critically examine three key arguments.', translation: 'Bu deneme üç temel argümanı eleştirel biçimde inceleyecektir.', transcript: 'Introduce your essay. This essay will critically examine three key arguments relating to climate change policy.' },
      { title: 'Stance & Hedging', topic: 'Academic register', grammar: 'Simple Present', dictationSentence: 'It could be argued that this approach is insufficient.', translation: 'Bu yaklaşımın yetersiz olduğu ileri sürülebilir.', transcript: 'State your position carefully. It could be argued that this approach is insufficient to address the core problem.' },
      { title: 'Nominalisation', topic: 'Formal style', grammar: 'Simple Present', dictationSentence: 'The implementation of the policy caused significant debate.', translation: 'Politikanın uygulanması önemli bir tartışmaya yol açtı.', transcript: 'Describe the reaction. The implementation of the policy caused significant debate among senior stakeholders.' },
      { title: 'Complex Sentences', topic: 'Subordination', grammar: 'Present Continuous', dictationSentence: 'Provided that you submit on time, marks will not be deducted.', translation: 'Zamanında teslim etmeniz koşuluyla puan indirilmeyecektir.', transcript: 'What are the conditions? Provided that you submit on time, marks will not be deducted for minor errors.' },
      { title: 'Critical Thinking', topic: 'Evaluating arguments', grammar: 'Simple Present', dictationSentence: 'While this argument has merit, it overlooks key factors.', translation: 'Bu argüman değer taşısa da temel faktörleri göz ardı ediyor.', transcript: 'Evaluate this argument. While this argument has merit, it overlooks key factors such as economic inequality.' },
      { title: 'Collocations', topic: 'High-frequency pairs', grammar: 'Simple Present', dictationSentence: 'The company made a significant breakthrough in research.', translation: 'Şirket araştırmada önemli bir atılım gerçekleştirdi.', transcript: 'What did the company achieve? The company made a significant breakthrough in research that changed the industry.' },
      { title: 'Media & Journalism', topic: 'News vocabulary', grammar: 'Past Simple', dictationSentence: 'Officials confirmed that negotiations are still ongoing.', translation: 'Yetkililer müzakerelerin hâlâ sürdüğünü doğruladı.', transcript: 'What was announced? Officials confirmed that negotiations are still ongoing and no agreement has been reached.' },
      { title: 'Environmental Issues', topic: 'Ecology language', grammar: 'Present Continuous', dictationSentence: 'Deforestation is threatening biodiversity across the globe.', translation: 'Ormansızlaşma küresel ölçekte biyolojik çeşitliliği tehdit ediyor.', transcript: 'Describe the environmental concern. Deforestation is threatening biodiversity across the globe at an alarming rate.' },
      { title: 'Global Economy', topic: 'Economics register', grammar: 'Simple Present', dictationSentence: 'Inflation remains a persistent challenge for policymakers.', translation: 'Enflasyon politika yapıcılar için kalıcı bir sorun olmaya devam ediyor.', transcript: 'Describe the economic situation. Inflation remains a persistent challenge for policymakers in most developed nations.' },
      { title: 'Social Justice', topic: 'Sociological terms', grammar: 'Simple Present', dictationSentence: 'Systemic inequality affects access to quality education.', translation: 'Sistemik eşitsizlik kaliteli eğitime erişimi etkiliyor.', transcript: 'Discuss the issue. Systemic inequality affects access to quality education, particularly in low-income communities.' },
      { title: 'Rhetoric & Persuasion', topic: 'Debate techniques', grammar: 'Simple Present', dictationSentence: 'It is undeniable that action must be taken immediately.', translation: 'Derhal harekete geçilmesi gerektiği inkâr edilemez.', transcript: 'Make your case. It is undeniable that action must be taken immediately to prevent further damage to the environment.' },
      { title: 'Technology & Ethics', topic: 'Digital society', grammar: 'Present Continuous', dictationSentence: 'Artificial intelligence is reshaping the labour market.', translation: 'Yapay zeka iş piyasasını yeniden şekillendiriyor.', transcript: 'Discuss AI\'s impact. Artificial intelligence is reshaping the labour market at a pace few had anticipated.' },
      { title: 'Intercultural Competence', topic: 'Global citizenship', grammar: 'Simple Present', dictationSentence: 'Cultural sensitivity is essential in international business.', translation: 'Kültürel duyarlılık uluslararası iş dünyasında vazgeçilmezdir.', transcript: 'Why does culture matter? Cultural sensitivity is essential in international business to avoid misunderstandings.' },
      { title: 'Research & Evidence', topic: 'Academic citation', grammar: 'Simple Present', dictationSentence: 'According to recent studies, sleep improves memory retention.', translation: 'Son çalışmalara göre uyku hafıza tutmayı iyileştiriyor.', transcript: 'Cite the research. According to recent studies, sleep improves memory retention significantly in adolescents.' },
      { title: 'Innovation & Change', topic: 'Future language', grammar: 'Future Plans', dictationSentence: 'This technology is set to revolutionise healthcare.', translation: 'Bu teknoloji sağlık hizmetlerinde devrim yaratmaya hazırlanıyor.', transcript: 'What is predicted? This technology is set to revolutionise healthcare by making diagnostics faster and cheaper.' },
      { title: 'B2 Final Review', topic: 'B2 Complete review', grammar: 'Simple Present', dictationSentence: 'Proficiency in English is an invaluable asset worldwide.', translation: 'İngilizce yeterliliği dünya genelinde paha biçilmez bir varlıktır.', transcript: 'Celebrate your achievement! Proficiency in English is an invaluable asset worldwide. You should be very proud.' },
    ],
  }

  return sets[level].map((u, i) => ({
    ...u,
    id: i + 1,
    completed: false,
    locked: level === 'A1' ? i > 0 : level === 'A2' ? i > 1 : true,
    progress: 0,
  }))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

function normalizeWord(s: string) {
  return s.toLowerCase().replace(/[.,!?;:"']/g, '').trim()
}

type HintPart = { word: string; kind: 'ok' | 'hint' | 'mask' }

function maskedHint(correctText: string, typedText: string): { allOk: boolean; parts: HintPart[] } {
  const correct = correctText.trim().split(/\s+/).filter(Boolean)
  const typed = typedText.trim().split(/\s+/).filter(Boolean)
  let k = 0
  while (k < correct.length && k < typed.length && normalizeWord(correct[k]) === normalizeWord(typed[k])) k++
  const allOk = k === correct.length && typed.length === correct.length
  if (allOk) return { allOk: true, parts: [] }
  const parts: HintPart[] = []
  for (let i = 0; i < k; i++) parts.push({ word: correct[i], kind: 'ok' })
  if (k < correct.length) parts.push({ word: correct[k], kind: 'hint' })
  for (let i = k + 1; i < correct.length; i++) parts.push({ word: '*'.repeat(correct[i].length), kind: 'mask' })
  return { allOk: false, parts }
}

function compareWords(typed: string, target: string) {
  const tWords = typed.trim().split(/\s+/)
  const rWords = target.trim().split(/\s+/)
  return rWords.map((ref, i) => {
    const t = (tWords[i] ?? '').replace(/[^a-zA-Z']/g, '')
    const r = ref.replace(/[^a-zA-Z']/g, '')
    return {
      word: ref,
      typed: tWords[i] ?? '',
      correct: t.toLowerCase() === r.toLowerCase(),
    }
  })
}

// ─── Shared small components ──────────────────────────────────────────────────

const MODULE_META = {
  grammar:   { label: 'Grammar',     icon: '📖', color: '#6366F1', bg: '#EEF2FF' },
  audio:     { label: 'Audio/Video', icon: '🎧', color: '#0EA5E9', bg: '#E0F2FE' },
  dictation: { label: 'Dictation',   icon: '✍️',  color: '#F59E0B', bg: '#FEF3C7' },
  shadowing: { label: 'Shadowing',   icon: '🎙️', color: '#10B981', bg: '#D1FAE5' },
}

function Chip({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 500,
      letterSpacing: '0.06em', textTransform: 'uppercase',
      color, background: bg, padding: '2px 7px', borderRadius: '4px',
    }}>{label}</span>
  )
}

function BackBtn({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      background: 'none', border: 'none', cursor: 'pointer',
      color: 'var(--muted-foreground)', fontSize: '13px', fontWeight: 500,
      padding: '0', transition: 'color 0.15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary)')}
      onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted-foreground)')}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" /></svg>
      {label}
    </button>
  )
}

// ─── MiniPlayer ───────────────────────────────────────────────────────────────

interface MiniPlayerHandle {
  playSegment: (start: number, end: number) => void
}

const MiniPlayer = forwardRef<MiniPlayerHandle, {
  audioUrl?: string
  duration?: number
  showTranscript: boolean
  onToggleTranscript: () => void
}>(function MiniPlayer({ audioUrl, duration: fallbackDuration = 142, showTranscript, onToggleTranscript }, ref) {
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [duration, setDuration] = useState(fallbackDuration)
  const [speed, setSpeed] = useState(1)
  const ivRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const segmentEndRef = useRef<number | null>(null)

  useImperativeHandle(ref, () => ({
    playSegment(start, end) {
      segmentEndRef.current = end
      const audio = audioRef.current
      if (audioUrl && audio) {
        audio.currentTime = start
        audio.play()
      } else {
        setElapsed(start)
        setPlaying(true)
      }
    },
  }), [audioUrl])

  // Real playback: drive elapsed/duration/playing off the <audio> element.
  useEffect(() => {
    const audio = audioRef.current
    if (!audioUrl || !audio) return
    const onTimeUpdate = () => {
      setElapsed(audio.currentTime)
      if (segmentEndRef.current != null && audio.currentTime >= segmentEndRef.current) {
        audio.pause()
        segmentEndRef.current = null
      }
    }
    const onLoadedMetadata = () => setDuration(audio.duration || fallbackDuration)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
    }
  }, [audioUrl, fallbackDuration])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed
  }, [speed])

  // Fallback simulated progress when no real audio source is wired up.
  useEffect(() => {
    if (audioUrl) return
    if (playing) {
      ivRef.current = setInterval(() => {
        setElapsed(e => {
          if (e >= duration) { setPlaying(false); return duration }
          return e + 0.5 * speed
        })
      }, 500)
    } else if (ivRef.current) clearInterval(ivRef.current)
    return () => { if (ivRef.current) clearInterval(ivRef.current) }
  }, [playing, speed, duration, audioUrl])

  function togglePlay() {
    if (audioUrl && audioRef.current) {
      if (playing) audioRef.current.pause()
      else { segmentEndRef.current = null; audioRef.current.play() }
    } else {
      setPlaying(p => !p)
    }
  }

  function seek(t: number) {
    const clamped = Math.max(0, Math.min(duration, t))
    if (audioUrl && audioRef.current) {
      segmentEndRef.current = null
      audioRef.current.currentTime = clamped
    }
    setElapsed(clamped)
  }

  const pct = (elapsed / duration) * 100

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: '14px', padding: '14px 18px',
      display: 'flex', flexDirection: 'column', gap: '10px',
      boxShadow: '0 1px 6px rgba(15,23,42,0.06)',
    }}>
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Rewind */}
        <button onClick={() => seek(elapsed - 10)} style={{ ...iconBtn }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6 8.5 6V6l-8.5 6z" /></svg>
        </button>
        {/* Play/Pause */}
        <button onClick={togglePlay} style={{
          width: '38px', height: '38px', borderRadius: '50%',
          background: 'var(--primary)', color: '#fff',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, transition: 'transform 0.15s, box-shadow 0.15s',
          boxShadow: '0 2px 10px rgba(79,70,229,0.35)',
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.07)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
        >
          {playing
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6zm8-14v14h4V5z" /></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>}
        </button>
        {/* Forward */}
        <button onClick={() => seek(elapsed + 10)} style={{ ...iconBtn }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" /></svg>
        </button>

        {/* Scrubber */}
        <div style={{ flex: 1, cursor: 'pointer' }}
          onClick={e => {
            const r = e.currentTarget.getBoundingClientRect()
            seek(((e.clientX - r.left) / r.width) * duration)
          }}>
          <div style={{ height: '4px', background: 'var(--muted)', borderRadius: '4px', position: 'relative' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--primary)', borderRadius: '4px', position: 'relative', transition: 'width 0.3s linear' }}>
              <div style={{ position: 'absolute', right: '-5px', top: '-3px', width: '10px', height: '10px', borderRadius: '50%', background: 'var(--primary)' }} />
            </div>
          </div>
        </div>

        {/* Time */}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted-foreground)', flexShrink: 0 }}>
          {fmt(elapsed)} / {fmt(duration)}
        </span>

        {/* Speed */}
        <select value={speed} onChange={e => setSpeed(Number(e.target.value))} style={{
          fontFamily: 'var(--font-mono)', fontSize: '11px',
          background: 'var(--secondary)', border: '1px solid var(--border)',
          color: 'var(--foreground)', borderRadius: '6px',
          padding: '4px 6px', cursor: 'pointer', outline: 'none', flexShrink: 0,
        }}>
          {[0.75, 1, 1.25, 1.5].map(s => <option key={s} value={s}>{s}×</option>)}
        </select>

        {/* Transcript toggle */}
        <button onClick={onToggleTranscript} style={{
          padding: '6px 12px', borderRadius: '8px',
          border: `1px solid ${showTranscript ? 'rgba(79,70,229,0.4)' : 'var(--border)'}`,
          background: showTranscript ? 'rgba(79,70,229,0.08)' : 'var(--secondary)',
          color: showTranscript ? 'var(--primary)' : 'var(--muted-foreground)',
          fontSize: '12px', fontWeight: 600, cursor: 'pointer', flexShrink: 0,
          transition: 'all 0.15s', whiteSpace: 'nowrap',
        }}>
          {showTranscript ? 'Hide Transcript' : 'Show Transcript'}
        </button>
      </div>
    </div>
  )
})

const iconBtn: React.CSSProperties = {
  background: 'var(--secondary)', border: '1px solid var(--border)',
  borderRadius: '8px', padding: '6px', cursor: 'pointer',
  color: 'var(--foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'background 0.15s', flexShrink: 0,
}

// ─── Views ────────────────────────────────────────────────────────────────────

function DashboardView({ level, units, onSelectUnit }: {
  level: Level
  units: Unit[]
  onSelectUnit: (u: Unit) => void
}) {
  return (
    <div className="anim-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 700, margin: '0 0 4px', color: 'var(--foreground)' }}>
          {LEVEL_META[level].label}
        </h1>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--muted-foreground)' }}>
          {units.filter(u => u.completed).length} of {units.length} units completed · {Math.round(units.filter(u => u.completed).length / units.length * 100)}% progress
        </p>
      </div>

      {/* Overall progress bar */}
      <div style={{ height: '6px', background: 'var(--muted)', borderRadius: '6px', overflow: 'hidden' }}>
        <div style={{
          width: `${(units.filter(u => u.completed).length / units.length) * 100}%`,
          height: '100%', background: 'linear-gradient(90deg, var(--primary), #818CF8)',
          borderRadius: '6px', transition: 'width 0.6s ease',
        }} />
      </div>

      {/* Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: '14px',
      }}>
        {units.filter(u => !((level === 'A1' || level === 'A2') && u.locked)).map(unit => {
          const isLocked = unit.locked
          return (
            <button
              key={unit.id}
              onClick={() => !isLocked && onSelectUnit(unit)}
              style={{
                textAlign: 'left', background: isLocked ? 'var(--secondary)' : 'var(--card)',
                border: `1px solid ${unit.completed ? 'rgba(16,185,129,0.25)' : isLocked ? 'var(--border)' : 'var(--border)'}`,
                borderRadius: '14px', padding: '16px',
                cursor: isLocked ? 'not-allowed' : 'pointer',
                boxShadow: isLocked ? 'none' : '0 1px 4px rgba(15,23,42,0.06)',
                transition: 'all 0.18s', opacity: isLocked ? 0.55 : 1,
                display: 'flex', flexDirection: 'column', gap: '10px',
                position: 'relative', overflow: 'hidden',
              }}
              onMouseEnter={e => { if (!isLocked) { e.currentTarget.style.boxShadow = '0 4px 16px rgba(79,70,229,0.14)'; e.currentTarget.style.borderColor = 'rgba(79,70,229,0.3)' } }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = isLocked ? 'none' : '0 1px 4px rgba(15,23,42,0.06)'; e.currentTarget.style.borderColor = unit.completed ? 'rgba(16,185,129,0.25)' : 'var(--border)' }}
            >
              {unit.completed && (
                <div style={{
                  position: 'absolute', top: '10px', right: '10px',
                  width: '20px', height: '20px', borderRadius: '50%',
                  background: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                </div>
              )}
              {isLocked && (
                <div style={{ position: 'absolute', top: '10px', right: '10px', color: 'var(--muted-foreground)', fontSize: '14px' }}>🔒</div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 500,
                  color: 'var(--primary)', background: 'rgba(79,70,229,0.08)',
                  padding: '2px 7px', borderRadius: '4px', letterSpacing: '0.06em',
                }}>
                  {unit.unitLabel ?? `Unit ${unit.id}`}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>{unit.topic}</span>
              </div>

              <div>
                <h3 style={{
                  fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 600,
                  margin: '0 0 4px', lineHeight: 1.3, color: isLocked ? 'var(--muted-foreground)' : 'var(--foreground)',
                }}>{unit.title}</h3>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
                  {unit.grammar}
                </p>
              </div>

              {/* Module chips */}
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                {(Object.keys(MODULE_META) as (keyof typeof MODULE_META)[]).map(k => (
                  <Chip key={k} label={MODULE_META[k].label} color={MODULE_META[k].color} bg={MODULE_META[k].bg} />
                ))}
              </div>

              {/* Progress bar */}
              {unit.progress > 0 && (
                <div style={{ height: '3px', background: 'var(--muted)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${unit.progress}%`, height: '100%', background: 'var(--success)', borderRadius: '3px' }} />
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function UnitDetailView({ unit, onBack, onModule, onQuestion }: {
  unit: Unit
  onBack: () => void
  onModule: (m: keyof typeof MODULE_META) => void
  onQuestion: (index: number) => void
}) {
  return (
    <div className="anim-slide-down" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <BackBtn onClick={onBack} label="All Units" />

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--primary)',
            background: 'rgba(79,70,229,0.1)', padding: '3px 9px', borderRadius: '5px', letterSpacing: '0.06em',
          }}>{unit.unitLabel ?? `Unit ${unit.id}`}</span>
          <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>{unit.topic}</span>
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '32px', fontWeight: 700, margin: '0 0 6px' }}>{unit.title}</h2>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--muted-foreground)' }}>Grammar focus: {unit.grammar}</p>
      </div>

      {unit.questionChain ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {unit.questionChain.map((q, i) => (
            <button
              key={i}
              onClick={() => onQuestion(i)}
              style={{
                textAlign: 'left', background: 'var(--card)',
                border: '1px solid var(--border)', borderRadius: '16px',
                padding: '24px', cursor: 'pointer',
                boxShadow: '0 1px 5px rgba(15,23,42,0.06)',
                transition: 'all 0.18s', display: 'flex', flexDirection: 'column', gap: '14px',
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 6px 24px ${MODULE_META.grammar.color}22`; e.currentTarget.style.borderColor = `${MODULE_META.grammar.color}44` }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 5px rgba(15,23,42,0.06)'; e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              <div style={{
                width: '48px', height: '48px', borderRadius: '12px',
                background: MODULE_META.grammar.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '22px',
              }}>📖</div>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, margin: '0 0 4px' }}>{q.label}</h3>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted-foreground)', lineHeight: 1.5 }}>{q.question}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill={MODULE_META.grammar.color}><path d="M10 17l5-5-5-5v10z" /></svg>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {(Object.entries(MODULE_META) as [keyof typeof MODULE_META, typeof MODULE_META[keyof typeof MODULE_META]][]).map(([key, meta]) => {
            const isModuleLocked = !!unit.moduleLocks?.[key]
            return (
              <button
                key={key}
                onClick={() => !isModuleLocked && onModule(key)}
                disabled={isModuleLocked}
                style={{
                  textAlign: 'left', background: isModuleLocked ? 'var(--secondary)' : 'var(--card)',
                  border: '1px solid var(--border)', borderRadius: '16px',
                  padding: '24px', cursor: isModuleLocked ? 'not-allowed' : 'pointer',
                  boxShadow: isModuleLocked ? 'none' : '0 1px 5px rgba(15,23,42,0.06)',
                  opacity: isModuleLocked ? 0.55 : 1,
                  transition: 'all 0.18s', display: 'flex', flexDirection: 'column', gap: '14px',
                  position: 'relative',
                }}
                onMouseEnter={e => { if (!isModuleLocked) { e.currentTarget.style.boxShadow = `0 6px 24px ${meta.color}22`; e.currentTarget.style.borderColor = `${meta.color}44` } }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = isModuleLocked ? 'none' : '0 1px 5px rgba(15,23,42,0.06)'; e.currentTarget.style.borderColor = 'var(--border)' }}
              >
                {isModuleLocked && (
                  <div style={{ position: 'absolute', top: '14px', right: '14px', color: 'var(--muted-foreground)', fontSize: '14px' }}>🔒</div>
                )}
                <div style={{
                  width: '48px', height: '48px', borderRadius: '12px',
                  background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '22px',
                }}>{meta.icon}</div>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, margin: '0 0 4px', color: isModuleLocked ? 'var(--muted-foreground)' : 'var(--foreground)' }}>{meta.label}</h3>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
                    {key === 'grammar' && 'Rules, patterns, and examples explained clearly.'}
                    {key === 'audio' && (unit.passiveVideo ? 'Watch the video.' : 'Listen to native speakers with speed control.')}
                    {key === 'dictation' && (isModuleLocked ? 'Content coming later for this unit.' : 'Type what you hear and check your accuracy.')}
                    {key === 'shadowing' && (isModuleLocked ? 'Content coming later for this unit.' : 'Record yourself and compare with the original.')}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Chip label={meta.label} color={meta.color} bg={meta.bg} />
                  {!isModuleLocked && <svg width="18" height="18" viewBox="0 0 24 24" fill={meta.color}><path d="M10 17l5-5-5-5v10z" /></svg>}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Sentence preview */}
      {!unit.hidePracticeSentence && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(79,70,229,0.06), rgba(129,140,248,0.06))',
          border: '1px solid rgba(79,70,229,0.12)', borderRadius: '14px', padding: '20px 24px',
        }}>
          <p style={{ margin: '0 0 6px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--primary)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Practice sentence
          </p>
          <p style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 500, lineHeight: 1.5 }}>{unit.dictationSentence}</p>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--muted-foreground)', fontStyle: 'italic' }}>{unit.translation}</p>
        </div>
      )}
    </div>
  )
}

const PLACEHOLDER_RULE = {
  rule: 'Unit content will be added after this lesson is taught.',
  ruleTr: '',
  examples: [{ en: 'Example sentence.', tr: 'Example sentence.', highlight: '' }],
}

function HighlightedSentence({ text, highlight }: { text: string; highlight: string }) {
  if (!highlight) return <>{text}</>
  const idx = text.indexOf(highlight)
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ color: '#2563EB', fontWeight: 700 }}>{text.slice(idx, idx + highlight.length)}</span>
      {text.slice(idx + highlight.length)}
    </>
  )
}

function renderGrammarBlocks(blocks: GrammarBlock[]) {
  return blocks.map((block, i) => {
    if (block.kind === 'box') {
      return (
        <div key={i} style={{ background: '#EEF2FF', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '14px', padding: '20px 24px' }}>
          <p style={{ margin: '0 0 6px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: '#6366F1', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{block.label}</p>
          {block.en && <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.7, color: '#1E1B4B' }}>{block.en}</p>}
          {block.tr && <p style={{ margin: '6px 0 0', fontSize: '13px', lineHeight: 1.6, color: '#4F46E5', fontStyle: 'italic' }}>({block.tr})</p>}
        </div>
      )
    }
    if (block.kind === 'list') {
      return (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{block.label}</p>
          {block.items?.map((item, j) => (
            <div key={j} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 20px' }}>
              <p style={{ margin: '0 0 5px', fontSize: '15px', fontWeight: 500, lineHeight: 1.5 }}>{item.term}</p>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted-foreground)', lineHeight: 1.6 }}>{item.explanation}</p>
            </div>
          ))}
        </div>
      )
    }
    return (
      <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px 24px' }}>
        <p style={{ margin: '0 0 6px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{block.label}</p>
        {block.en && <p style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 500 }}>{block.en}</p>}
        {block.tr && <p style={{ margin: 0, fontSize: '14px', color: 'var(--muted-foreground)', lineHeight: 1.7, fontStyle: block.en ? 'italic' : 'normal' }}>{block.tr}</p>}
      </div>
    )
  })
}

function AudioIconButton({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement>(null)
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.play()}
        aria-label="Play audio"
        style={{
          width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
          border: 'none', background: '#6366F1', color: '#fff', fontSize: '15px',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >🔊</button>
      <audio ref={ref} src={src} preload="none" />
    </>
  )
}

function renderDefinitionCard(title?: string, text?: string) {
  if (!title && !text) return null
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px 24px' }}>
      {title && <p style={{ margin: text ? '0 0 6px' : 0, fontSize: '16px', fontWeight: 700, color: 'var(--foreground)' }}>{title}</p>}
      {text && <p style={{ margin: 0, fontSize: '14px', color: 'var(--muted-foreground)', lineHeight: 1.7 }}>{text}</p>}
    </div>
  )
}

function renderAnalogyCard(text?: string) {
  if (!text) return null
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px 24px' }}>
      <p style={{ margin: 0, fontSize: '14px', color: 'var(--foreground)', lineHeight: 1.7, fontStyle: 'italic' }}>{text}</p>
    </div>
  )
}

function GrammarView({ unit, question, onBack }: { unit: Unit; question?: QuestionItem; onBack: () => void }) {
  const [showAnswer, setShowAnswer] = useState(false)
  const rule = unit.grammarPlaceholder ? PLACEHOLDER_RULE : (GRAMMAR_RULES[unit.grammar] ?? GRAMMAR_RULES['Simple Present'])
  return (
    <div className="anim-slide-down" style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '680px' }}>
      <BackBtn onClick={onBack} label={unit.title} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: MODULE_META.grammar.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>📖</div>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 700, margin: 0 }}>
            {question ? `${question.sectionTitle || unit.grammar.split(' / ')[0]} / ${question.label}` : unit.grammar}
          </h2>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted-foreground)' }}>Grammar · {unit.title}</p>
        </div>
      </div>

      {question ? (
        <>
          {/* Question box, with listen icon */}
          <div style={{ background: '#EEF2FF', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '14px', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            <div>
              <p style={{ margin: '0 0 6px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: '#6366F1', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Question</p>
              <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, lineHeight: 1.7, color: '#1E1B4B' }}>{question.question}</p>
            </div>
            {question.questionAudioUrl && <AudioIconButton src={question.questionAudioUrl} />}
          </div>

          {/* Translation box */}
          {question.questionTranslation && (
            <div style={{ background: '#EEF2FF', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '14px', padding: '20px 24px' }}>
              <p style={{ margin: '0 0 6px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: '#6366F1', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Translation</p>
              <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.7, color: '#1E1B4B' }}>{question.questionTranslation}</p>
            </div>
          )}

          {/* Question explanation, shown before the answer is revealed */}
          {question.explanation && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 20px' }}>
              <p style={{ margin: 0, fontSize: '14px', color: 'var(--muted-foreground)', lineHeight: 1.7 }}>{question.explanation}</p>
            </div>
          )}

          {/* Pre-answer definition + analogy */}
          {renderDefinitionCard(question.preDefinitionTitle, question.preDefinitionText)}
          {renderAnalogyCard(question.preAnalogy)}

          {!showAnswer && (question.answerEn || question.postDefinitionText || question.postAnalogy) && (
            <button
              onClick={() => setShowAnswer(true)}
              style={{
                alignSelf: 'flex-start', background: 'var(--primary)', color: '#fff', border: 'none',
                borderRadius: '10px', padding: '10px 22px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              Cevabı gör
            </button>
          )}

          {showAnswer && (
            <div className="anim-slide-down" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {question.answerEn && (
                <div style={{ background: '#EEF2FF', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '14px', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                  <div>
                    <p style={{ margin: '0 0 6px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: '#6366F1', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Answer</p>
                    <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#1E1B4B' }}>{question.answerEn}</p>
                  </div>
                  {question.answerAudioUrl && <AudioIconButton src={question.answerAudioUrl} />}
                </div>
              )}
              {question.answerTr && (
                <div style={{ background: '#EEF2FF', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '14px', padding: '20px 24px' }}>
                  <p style={{ margin: '0 0 6px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: '#6366F1', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Translation</p>
                  <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.7, color: '#1E1B4B' }}>{question.answerTr}</p>
                </div>
              )}
              {renderDefinitionCard(question.postDefinitionTitle, question.postDefinitionText)}
              {renderAnalogyCard(question.postAnalogy)}
            </div>
          )}
        </>
      ) : unit.customGrammarBlocks ? (
        renderGrammarBlocks(unit.customGrammarBlocks)
      ) : (
        <>
          {/* Rule box */}
          <div style={{ background: '#EEF2FF', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '14px', padding: '20px 24px' }}>
            <p style={{ margin: '0 0 6px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: '#6366F1', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Rule</p>
            <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.7, color: '#1E1B4B' }}>{rule.rule}</p>
            {rule.ruleTr && <p style={{ margin: '6px 0 0', fontSize: '13px', lineHeight: 1.6, color: '#4F46E5', fontStyle: 'italic' }}>({rule.ruleTr})</p>}
          </div>

          {/* Examples */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Examples</p>
            {rule.examples.map((ex, i) => (
              <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 20px' }}>
                <p style={{ margin: '0 0 5px', fontSize: '15px', fontWeight: 500, lineHeight: 1.5 }}><HighlightedSentence text={ex.en} highlight={ex.highlight} /></p>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted-foreground)', fontStyle: 'italic' }}>{ex.tr}</p>
              </div>
            ))}
          </div>

          {/* Key sentence */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px 24px' }}>
            <p style={{ margin: '0 0 6px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Unit sentence</p>
            <p style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 500 }}>{unit.dictationSentence}</p>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--muted-foreground)', fontStyle: 'italic' }}>{unit.translation}</p>
          </div>
        </>
      )}
    </div>
  )
}

function AudioView({ unit, onBack }: { unit: Unit; onBack: () => void }) {
  const [showTranscript, setShowTranscript] = useState(false)

  if (unit.passiveVideo && unit.videoUrl) {
    return (
      <div className="anim-slide-down" style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '720px' }}>
        <BackBtn onClick={onBack} label={unit.title} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: MODULE_META.audio.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>🎧</div>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 700, margin: 0 }}>Audio / Video</h2>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted-foreground)' }}>{unit.title} · Watch the video</p>
          </div>
        </div>

        <video
          src={unit.videoUrl}
          controls
          controlsList="nodownload noplaybackrate"
          style={{ width: '100%', borderRadius: '16px', background: '#000' }}
        />
      </div>
    )
  }

  return (
    <div className="anim-slide-down" style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '720px' }}>
      <BackBtn onClick={onBack} label={unit.title} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: MODULE_META.audio.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>🎧</div>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 700, margin: 0 }}>Audio / Video</h2>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted-foreground)' }}>{unit.title} · Listening practice</p>
        </div>
      </div>

      {/* Visual player card */}
      <div style={{
        background: 'linear-gradient(135deg, #1E3A8A, #3730A3)',
        borderRadius: '20px', padding: '32px', color: '#fff',
        display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center',
      }}>
        <div style={{ fontSize: '36px', marginBottom: '8px' }}>🎧</div>
        <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600 }}>{unit.title}</p>
        <p style={{ margin: 0, fontSize: '13px', opacity: 0.65, fontFamily: 'var(--font-mono)' }}>2:22 · Listening</p>
      </div>

      <MiniPlayer audioUrl={unit.audioUrl} showTranscript={showTranscript} onToggleTranscript={() => setShowTranscript(t => !t)} duration={142} />

      {showTranscript && (
        <div className="anim-slide-down" style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px 24px' }}>
          <p style={{ margin: '0 0 8px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Transcript</p>
          <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.8, color: 'var(--foreground)' }}>{unit.transcript}</p>
        </div>
      )}
    </div>
  )
}

function DictationView({ unit, onBack }: { unit: Unit; onBack: () => void }) {
  const segments = useMemo<DictationSegment[]>(
    () => (unit.dictationSegments && unit.dictationSegments.length > 0)
      ? unit.dictationSegments
      : [{ start: 0, end: 0, text: unit.dictationSentence }],
    [unit.dictationSegments, unit.dictationSentence]
  )

  const [showTranscript, setShowTranscript] = useState(false)
  const [typed, setTyped] = useState('')
  const [curIndex, setCurIndex] = useState(0)
  const [checked, setChecked] = useState(false)
  const [readyForNext, setReadyForNext] = useState(false)
  const [answered, setAnswered] = useState<boolean[]>(() => new Array(segments.length).fill(false))
  const [correctCount, setCorrectCount] = useState(0)
  const [hintOnWrong, setHintOnWrong] = useState(true)
  const [fullOnWrong, setFullOnWrong] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recSec, setRecSec] = useState(0)
  const recRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const playerRef = useRef<MiniPlayerHandle>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const done = curIndex >= segments.length
  const currentSegment = done ? null : segments[curIndex]

  // Reset practice state whenever a different unit's segments load in.
  useEffect(() => {
    setCurIndex(0)
    setAnswered(new Array(segments.length).fill(false))
    setCorrectCount(0)
  }, [segments])

  // Load a fresh segment: reset the answer box, and play the new audio range.
  useEffect(() => {
    setTyped('')
    setChecked(false)
    setReadyForNext(false)
    setRecording(false)
    setRecSec(0)
    if (recRef.current) clearInterval(recRef.current)
    if (currentSegment) {
      playerRef.current?.playSegment(currentSegment.start, currentSegment.end)
      textareaRef.current?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curIndex, segments])

  const hint = checked && currentSegment ? maskedHint(currentSegment.text, typed) : null
  const results = checked && currentSegment ? compareWords(typed, currentSegment.text) : []
  const allCorrect = hint?.allOk ?? false

  function checkAnswer() {
    if (!currentSegment || !typed.trim()) return
    const result = maskedHint(currentSegment.text, typed)
    setChecked(true)
    setReadyForNext(result.allOk)
    if (!answered[curIndex]) {
      setAnswered(a => { const next = [...a]; next[curIndex] = true; return next })
      if (result.allOk) setCorrectCount(c => c + 1)
    }
  }

  function goNext() {
    setCurIndex(i => Math.min(segments.length, i + 1))
  }

  function goPrev() {
    setCurIndex(i => Math.max(0, i - 1))
  }

  function replay() {
    if (currentSegment) playerRef.current?.playSegment(currentSegment.start, currentSegment.end)
  }

  function handleRecord() {
    if (recording) {
      if (recRef.current) clearInterval(recRef.current)
      setRecording(false)
    } else {
      setRecSec(0)
      setRecording(true)
      recRef.current = setInterval(() => setRecSec(s => s + 1), 1000)
    }
  }

  function handleReset() {
    setCurIndex(0)
    setAnswered(new Array(segments.length).fill(false))
    setCorrectCount(0)
    setShowTranscript(false)
  }

  // Keyboard shortcuts: Enter checks/advances, Ctrl+R replays, ←/→ navigate segments.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const inTextarea = document.activeElement === textareaRef.current
      if (inTextarea && e.key === 'Enter') {
        e.preventDefault()
        if (readyForNext) goNext(); else checkAnswer()
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'r') {
        e.preventDefault()
        replay()
      }
      if (e.key === 'ArrowLeft' && !inTextarea) { if (curIndex > 0) goPrev() }
      if (e.key === 'ArrowRight' && !inTextarea) { if (curIndex < segments.length - 1) goNext() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curIndex, readyForNext, typed, answered, segments])

  return (
    <div className="anim-slide-down" style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '680px' }}>
      <BackBtn onClick={onBack} label={unit.title} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: MODULE_META.dictation.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>✍️</div>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 700, margin: 0 }}>Dictation</h2>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted-foreground)' }}>{unit.title} · Type what you hear</p>
            {unit.readingTitle && <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--primary)', fontWeight: 500 }}>📖 {unit.readingTitle}</p>}
          </div>
        </div>
        <button onClick={() => setShowSettings(s => !s)} title="Settings" style={{ ...iconBtn, borderRadius: '50%' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94a7.14 7.14 0 0 0 .06-.94 7.14 7.14 0 0 0-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.14 7.14 0 0 0-.06.94c0 .32.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.42.32.6.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54c.05.24.25.42.5.42h3.84c.25 0 .45-.18.5-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.24.1.5 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7" /></svg>
        </button>
      </div>

      {showSettings && (
        <div className="anim-slide-down" style={{ background: 'var(--secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
            <input type="checkbox" checked={hintOnWrong} onChange={e => setHintOnWrong(e.target.checked)} />
            Yanlışta ipucu göster
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
            <input type="checkbox" checked={fullOnWrong} onChange={e => setFullOnWrong(e.target.checked)} />
            Yanlışta tam cevabı göster
          </label>
        </div>
      )}

      {/* Segment progress */}
      {!done && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '6px' }}>
            <span>Segment {curIndex + 1} / {segments.length}</span>
            <span>{correctCount} correct</span>
          </div>
          <div style={{ height: '4px', background: 'var(--muted)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${(curIndex / segments.length) * 100}%`, height: '100%', background: 'var(--primary)', transition: 'width 0.2s' }} />
          </div>
        </div>
      )}

      {/* Player */}
      <MiniPlayer ref={playerRef} audioUrl={unit.audioUrl} showTranscript={showTranscript} onToggleTranscript={() => setShowTranscript(t => !t)} />

      {showTranscript && (
        <div className="anim-slide-down" style={{ background: '#FFFBEB', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '12px', padding: '16px 20px' }}>
          <p style={{ margin: '0 0 6px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Transcript (Hint)</p>
          <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.7 }}>{unit.transcript}</p>
        </div>
      )}

      {done ? (
        /* ── Completion State ── */
        <div className="anim-slide-down" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{
            background: '#ECFDF5', border: '1px solid rgba(16,185,129,0.3)',
            borderRadius: '14px', padding: '18px 22px',
            display: 'flex', alignItems: 'center', gap: '14px',
          }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '50%',
              background: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
            </div>
            <div>
              <p style={{ margin: '0 0 2px', fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: '#065F46' }}>Tebrikler, dersi tamamladın! 🎉</p>
              <p style={{ margin: 0, fontSize: '13px', color: '#047857' }}>{correctCount}/{segments.length} doğru</p>
            </div>
          </div>

          <div className="anim-slide-down" style={{
            background: 'linear-gradient(135deg, #1E3A8A 0%, #3730A3 100%)',
            borderRadius: '14px', padding: '20px 24px', color: '#fff',
          }}>
            <p style={{ margin: '0 0 8px', fontFamily: 'var(--font-mono)', fontSize: '10px', opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.12em' }}>🇹🇷 Turkish Translation</p>
            <p style={{ margin: '0 0 10px', fontSize: '15px', fontWeight: 600, lineHeight: 1.5, opacity: 0.95 }}>{unit.dictationSentence}</p>
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.15)', marginBottom: '10px' }} />
            <p style={{ margin: 0, fontSize: '16px', fontStyle: 'italic', lineHeight: 1.6, opacity: 0.9 }}>{unit.translation}</p>
          </div>

          <button onClick={handleReset} style={{
            padding: '12px', borderRadius: '10px',
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--muted-foreground)', fontSize: '14px', fontWeight: 500,
            cursor: 'pointer', transition: 'all 0.15s',
          }}>Restart</button>
        </div>
      ) : (
        <>
          {/* Input area */}
          <div style={{ position: 'relative' }}>
            <textarea
              ref={textareaRef}
              value={typed}
              onChange={e => { setTyped(e.target.value); setChecked(false); setReadyForNext(false) }}
              placeholder="Type the sentence you hear from the audio…"
              rows={4}
              disabled={checked && allCorrect}
              style={{
                width: '100%', resize: 'vertical',
                padding: '16px 56px 16px 18px',
                fontFamily: 'var(--font-body)', fontSize: '16px', lineHeight: 1.7,
                color: 'var(--foreground)',
                background: 'var(--card)',
                border: `1.5px solid ${checked ? (allCorrect ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.4)') : 'var(--border)'}`,
                borderRadius: '14px', outline: 'none',
                boxShadow: '0 1px 4px rgba(15,23,42,0.06)',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => { if (!checked) e.target.style.borderColor = 'rgba(79,70,229,0.5)' }}
              onBlur={e => { if (!checked) e.target.style.borderColor = 'var(--border)' }}
            />
            {/* Mic button */}
            <div style={{ position: 'absolute', right: '14px', top: '14px' }}>
              <div style={{ position: 'relative', display: 'inline-flex' }}>
                {recording && <div className="mic-ring" style={{ position: 'absolute', inset: 0, borderRadius: '50%' }} />}
                <button
                  onClick={handleRecord}
                  title={recording ? 'Stop recording' : 'Start voice shadowing'}
                  style={{
                    width: '36px', height: '36px', borderRadius: '50%', border: 'none',
                    background: recording ? 'var(--error)' : 'rgba(79,70,229,0.1)',
                    color: recording ? '#fff' : 'var(--primary)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.2s', flexShrink: 0, position: 'relative', zIndex: 1,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {recording && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '3px', alignItems: 'center', height: '20px' }}>
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="wave-bar" style={{ width: '4px', background: 'var(--error)', borderRadius: '3px', height: '4px', animationDuration: `${0.4 + i * 0.07}s` }} />
                ))}
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--error)' }}>Recording {fmt(recSec)}</span>
            </div>
          )}

          {/* Buttons row */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => { if (readyForNext) goNext(); else checkAnswer() }}
              disabled={!typed.trim()}
              style={{
                flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
                background: typed.trim() ? 'var(--primary)' : 'var(--muted)',
                color: typed.trim() ? '#fff' : 'var(--muted-foreground)',
                fontSize: '14px', fontWeight: 600, cursor: typed.trim() ? 'pointer' : 'not-allowed',
                letterSpacing: '0.02em', transition: 'all 0.15s',
              }}
            >{readyForNext ? 'Next →' : 'Check Answer'}</button>
            <button onClick={replay} style={{
              padding: '12px 16px', borderRadius: '10px',
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--muted-foreground)', fontSize: '14px', fontWeight: 500,
              cursor: 'pointer', transition: 'all 0.15s',
            }}>Replay ↻</button>
            <button onClick={handleReset} style={{
              padding: '12px 16px', borderRadius: '10px',
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--muted-foreground)', fontSize: '14px', fontWeight: 500,
              cursor: 'pointer', transition: 'all 0.15s',
            }}>Reset</button>
          </div>

          {/* Segment nav row */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={goPrev} disabled={curIndex === 0} style={{
              flex: 1, padding: '10px', borderRadius: '10px',
              border: '1px solid var(--border)', background: 'transparent',
              color: curIndex === 0 ? 'var(--muted)' : 'var(--muted-foreground)', fontSize: '13px', fontWeight: 500,
              cursor: curIndex === 0 ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
            }}>← Previous</button>
            <button onClick={goNext} style={{
              flex: 1, padding: '10px', borderRadius: '10px',
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--muted-foreground)', fontSize: '13px', fontWeight: 500,
              cursor: 'pointer', transition: 'all 0.15s',
            }}>Next →</button>
          </div>
          <p style={{ margin: 0, fontSize: '11px', color: 'var(--muted-foreground)' }}>
            <kbd>Enter</kbd> check · correct then <kbd>Enter</kbd> again for next &nbsp; <kbd>Ctrl+R</kbd> replay &nbsp; <kbd>←</kbd>/<kbd>→</kbd> segments
          </p>

          {/* ── Error State ── */}
          {checked && !allCorrect && (
            <div className="anim-slide-down" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Word-by-word review */}
              <div style={{ background: '#FFF5F5', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '14px', padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '18px' }}>⚠️</span>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '14px', color: '#B91C1C' }}>Some words need correction</p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: hint && (hintOnWrong || fullOnWrong) ? '14px' : 0 }}>
                  {results.map((r, i) => (
                    <span key={i} style={{
                      padding: '3px 9px', borderRadius: '6px', fontSize: '15px', fontWeight: 500,
                      background: r.correct ? '#DCFCE7' : '#FEE2E2',
                      color: r.correct ? '#15803D' : '#B91C1C',
                      border: `1px solid ${r.correct ? 'rgba(21,128,61,0.2)' : 'rgba(185,28,28,0.25)'}`,
                      textDecoration: r.correct ? 'none' : 'underline wavy rgba(185,28,28,0.5)',
                    }}>{r.typed || '—'}</span>
                  ))}
                </div>
                {/* Masked/full hint */}
                {fullOnWrong && currentSegment && (
                  <div style={{ background: '#fff', border: '1px dashed rgba(239,68,68,0.3)', borderRadius: '10px', padding: '12px 16px' }}>
                    <p style={{ margin: '0 0 4px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Correct sentence</p>
                    <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.6, color: '#374151' }}>{currentSegment.text}</p>
                  </div>
                )}
                {!fullOnWrong && hintOnWrong && hint && hint.parts.length > 0 && (
                  <div style={{ background: '#fff', border: '1px dashed rgba(239,68,68,0.3)', borderRadius: '10px', padding: '12px 16px' }}>
                    <p style={{ margin: '0 0 4px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Hint</p>
                    <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.6, fontFamily: 'var(--font-mono)' }}>
                      {hint.parts.map((p, i) => {
                        if (p.kind === 'ok') return <span key={i} style={{ color: '#374151' }}>{p.word} </span>
                        if (p.kind === 'hint') return <span key={i} style={{ color: '#15803D', fontWeight: 700 }}>{p.word} </span>
                        return <span key={i} style={{ color: 'var(--muted-foreground)' }}>{p.word} </span>
                      })}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Success State ── */}
          {checked && allCorrect && (
            <div className="anim-slide-down" style={{
              background: '#ECFDF5', border: '1px solid rgba(16,185,129,0.3)',
              borderRadius: '14px', padding: '18px 22px',
              display: 'flex', alignItems: 'center', gap: '14px',
            }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '50%',
                background: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
              </div>
              <div>
                <p style={{ margin: '0 0 2px', fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: '#065F46' }}>Doğru! 🎉</p>
                <p style={{ margin: 0, fontSize: '13px', color: '#047857' }}>Press Enter or Next to continue.</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ShadowingView({ unit, onBack }: { unit: Unit; onBack: () => void }) {
  const segments = useMemo<DictationSegment[]>(
    () => (unit.dictationSegments && unit.dictationSegments.length > 0)
      ? unit.dictationSegments
      : [{ start: 0, end: 0, text: unit.dictationSentence }],
    [unit.dictationSegments, unit.dictationSentence]
  )

  const [current, setCurrent] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [loop, setLoop] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const loopRef = useRef(loop)
  loopRef.current = loop
  // Bumped on every navigation/stop so stale timeupdate/timeout callbacks from a
  // previous sentence can recognize they're outdated and do nothing.
  const playTokenRef = useRef(0)

  useEffect(() => {
    setCurrent(0)
    playTokenRef.current++
    setIsPlaying(false)
  }, [segments])

  useEffect(() => {
    itemRefs.current[current]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [current])

  // Stop everything cleanly on unmount.
  useEffect(() => () => { playTokenRef.current++; audioRef.current?.pause() }, [])

  function playSegment(index: number) {
    const audio = audioRef.current
    if (!audio || !unit.audioUrl) return
    const seg = segments[index]
    playTokenRef.current++
    const token = playTokenRef.current
    audio.pause()
    audio.playbackRate = speed
    audio.currentTime = seg.start
    const onTime = () => {
      if (token !== playTokenRef.current) { audio.removeEventListener('timeupdate', onTime); return }
      if (audio.currentTime >= seg.end) {
        audio.pause()
        audio.removeEventListener('timeupdate', onTime)
        setIsPlaying(false)
        if (loopRef.current) {
          setTimeout(() => { if (token === playTokenRef.current) playSegment(index) }, 400)
        }
      }
    }
    audio.addEventListener('timeupdate', onTime)
    audio.play()
    setIsPlaying(true)
  }

  function goTo(index: number) {
    const clamped = Math.max(0, Math.min(segments.length - 1, index))
    setCurrent(clamped)
    playSegment(clamped)
  }

  function togglePlayPause() {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      playSegment(current)
    }
  }

  const sentences = segments.map(s => s.text)

  return (
    <div className="anim-slide-down" style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '680px' }}>
      <BackBtn onClick={onBack} label={unit.title} />
      {unit.audioUrl && <audio ref={audioRef} src={unit.audioUrl} preload="metadata" />}

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: MODULE_META.shadowing.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>🎙️</div>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 700, margin: 0 }}>Shadowing</h2>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted-foreground)' }}>{unit.title} · {sentences.length} sentences</p>
          {unit.readingTitle && <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--primary)', fontWeight: 500 }}>📖 {unit.readingTitle}</p>}
        </div>
      </div>

      {/* Playback controls — kept at the top so they never scroll out of view */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px',
        display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center',
      }}>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted-foreground)', textAlign: 'center' }}>
          Sentence {current + 1} / {sentences.length} — play it, then shadow it out loud
        </p>
        <p style={{ margin: '-8px 0 0', fontSize: '15px', fontWeight: 500, textAlign: 'center', color: 'var(--foreground)' }}>
          {sentences[current]}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={() => setLoop(l => !l)} title="Repeat this sentence automatically" style={{
            padding: '7px 12px', borderRadius: '9px', border: `1px solid ${loop ? 'rgba(16,185,129,0.4)' : 'var(--border)'}`,
            background: loop ? '#ECFDF5' : 'var(--secondary)', color: loop ? '#059669' : 'var(--foreground)',
            fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17 17H7v-4l-5 5 5 5v-4h12v-6h-2v4zM7 7h10v4l5-5-5-5v4H5v6h2V7z" /></svg>
            Loop this sentence
          </button>

          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '9px', overflow: 'hidden' }}>
            {[0.75, 1, 1.25].map(r => (
              <button key={r} onClick={() => setSpeed(r)} style={{
                padding: '7px 10px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                background: speed === r ? 'var(--primary)' : 'var(--secondary)',
                color: speed === r ? '#fff' : 'var(--foreground)',
              }}>{r}x</button>
            ))}
          </div>
        </div>

        <button onClick={togglePlayPause} style={{
          width: '68px', height: '68px', borderRadius: '50%', border: 'none',
          background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
          color: '#fff', cursor: 'pointer', fontSize: '26px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(99,102,241,0.35)',
          transition: 'transform 0.15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.06)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
        >
          {isPlaying
            ? <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
            : <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '3px' }}><path d="M8 5v14l11-7z" /></svg>}
        </button>

        <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
          <button
            onClick={() => goTo(current - 1)}
            disabled={current === 0}
            style={{ flex: 1, padding: '9px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--secondary)', color: current === 0 ? 'var(--muted-foreground)' : 'var(--foreground)', fontSize: '13px', fontWeight: 500, cursor: current === 0 ? 'not-allowed' : 'pointer' }}
          >← Previous</button>
          <button
            onClick={() => goTo(current + 1)}
            disabled={current === sentences.length - 1}
            style={{ flex: 1, padding: '9px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--secondary)', color: current === sentences.length - 1 ? 'var(--muted-foreground)' : 'var(--foreground)', fontSize: '13px', fontWeight: 500, cursor: current === sentences.length - 1 ? 'not-allowed' : 'pointer' }}
          >Next →</button>
        </div>
      </div>

      {/* Sentence list — fixed height, scrolls independently, auto-scrolls active line into view */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: '8px',
        maxHeight: '340px', overflowY: 'auto', paddingRight: '4px',
      }}>
        {sentences.map((s, i) => (
          <button
            key={i}
            ref={el => { itemRefs.current[i] = el }}
            onClick={() => goTo(i)}
            style={{
              textAlign: 'left', padding: '14px 18px', borderRadius: '12px',
              border: `1.5px solid ${i === current ? 'rgba(99,102,241,0.45)' : 'var(--border)'}`,
              background: i === current ? '#EEF2FF' : 'var(--card)',
              cursor: 'pointer', transition: 'all 0.15s',
              display: 'flex', alignItems: 'flex-start', gap: '12px', flexShrink: 0,
            }}
          >
            <div style={{
              width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0, marginTop: '1px',
              background: i === current ? 'rgba(99,102,241,0.15)' : 'var(--muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: i === current ? '2px solid rgba(99,102,241,0.5)' : 'none',
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: i === current ? '#4F46E5' : 'var(--muted-foreground)' }}>{i + 1}</span>
            </div>
            <span style={{ fontSize: '14px', lineHeight: 1.6, color: i === current ? '#3730A3' : 'var(--foreground)', fontWeight: i === current ? 500 : 400 }}>{s}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Root App ─────────────────────────────────────────────────────────────────

const LEVELS: Level[] = ['A1', 'A2', 'B1', 'B2']
const LEVEL_META: Record<Level, { code: string; label: string; color: string; disabled?: boolean }> = {
  A1: { code: 'AF', label: 'English Group A', color: '#10B981' },
  A2: { code: 'H',  label: 'English Group B', color: '#0EA5E9' },
  B1: { code: 'B1', label: 'Others',          color: '#8B5CF6', disabled: true },
  B2: { code: 'B2', label: 'Coming soon',     color: '#94A3B8', disabled: true },
}

// ─── Sheets-backed content loading (100Q) ──────────────────────────────────────
// The "Foundations and Rules" (100Q) unit's questions live in a published
// Google Sheet, not in this file. To add/edit a question, edit the Sheet —
// no code change needed. This file only knows how to fetch + parse it.

const QUESTIONS_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRAB45RBWdRWxtKNj-qaIZePkgTD4y8HXNkc7h4wb_VnjVRETobN-uSQi8osDEIqusZKiamvu_qL40I/pub?output=csv'

// Minimal CSV parser: handles quoted fields, commas/newlines inside quotes, and "" escaped quotes.
function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += c
      }
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { row.push(field); field = '' }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else if (c === '\r') { /* ignore, \n handles the line break */ }
      else field += c
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  const [header, ...dataRows] = rows
  if (!header) return []
  return dataRows
    .filter(r => r.some(cell => cell.trim() !== ''))
    .map(r => {
      const obj: Record<string, string> = {}
      header.forEach((h, i) => { obj[h.trim()] = (r[i] ?? '').trim() })
      return obj
    })
}

// Converts parsed Sheet rows into the QuestionItem shape the app already renders.
// Column names must match the Sheet header exactly (case-sensitive):
// label, question, questionAudioUrl, questionTranslation, preDefinitionTitle,
// preDefinitionText, preAnalogy, answerEn, answerTr, answerAudioUrl,
// postDefinitionTitle, postDefinitionText, postAnalogy, videoUrl
function rowsToQuestionChain(rows: Record<string, string>[]): QuestionItem[] {
  return rows.map(r => ({
    label: r.label || '',
    sectionTitle: r.sectionTitle || undefined,
    question: r.question || '',
    questionAudioUrl: r.questionAudioUrl || undefined,
    questionTranslation: r.questionTranslation || undefined,
    preDefinitionTitle: r.preDefinitionTitle || undefined,
    preDefinitionText: r.preDefinitionText || undefined,
    preAnalogy: r.preAnalogy || undefined,
    answerEn: r.answerEn || undefined,
    answerTr: r.answerTr || undefined,
    answerAudioUrl: r.answerAudioUrl || undefined,
    postDefinitionTitle: r.postDefinitionTitle || undefined,
    postDefinitionText: r.postDefinitionText || undefined,
    postAnalogy: r.postAnalogy || undefined,
    videoUrl: r.videoUrl || undefined,
  }))
}

export default function App() {
  const [level, setLevel] = useState<Level>('A1')
  const [view, setView] = useState<View>('dashboard')
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null)
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState<number | null>(null)

  // Sheet-backed 100Q data. Starts null (meaning: "use the hardcoded fallback
  // below until the Sheet has loaded"), then fills in once the fetch succeeds.
  // If the fetch ever fails (offline, Sheet unpublished, etc.), we silently
  // keep the hardcoded fallback so the site never breaks.
  const [sheetQuestions, setSheetQuestions] = useState<QuestionItem[] | null>(null)

  useEffect(() => {
    fetch(QUESTIONS_SHEET_CSV_URL)
      .then(res => res.text())
      .then(text => {
        const parsed = rowsToQuestionChain(parseCSV(text))
        if (parsed.length > 0) setSheetQuestions(parsed)
      })
      .catch(() => { /* keep hardcoded fallback on any error */ })
  }, [])

  const units = buildUnits(level).map(u =>
    (u.unitLabel === '100Q' && sheetQuestions) ? { ...u, questionChain: sheetQuestions } : u
  )

  const selectedUnitLive = selectedUnit ? units.find(u => u.id === selectedUnit.id) ?? selectedUnit : null
  const selectedQuestion = selectedUnitLive?.questionChain && selectedQuestionIndex !== null
    ? selectedUnitLive.questionChain[selectedQuestionIndex]
    : undefined

  function goUnit(u: Unit) { setSelectedUnit(u); setSelectedQuestionIndex(null); setView('unit') }
  function goModule(m: keyof typeof MODULE_META) { setSelectedQuestionIndex(null); setView(m as View) }
  function goQuestion(i: number) { setSelectedQuestionIndex(i); setView('grammar') }
  function goBack() {
    if (view === 'dashboard') return
    if (view === 'unit') { setView('dashboard'); setSelectedUnit(null) }
    else { setView('unit'); setSelectedQuestionIndex(null) }
  }

  const breadcrumbs = [
    { label: LEVEL_META[level].code, onClick: () => { setView('dashboard'); setSelectedUnit(null) } },
    ...(selectedUnitLive ? [{ label: selectedUnitLive.unitLabel ?? `Unit ${selectedUnitLive.id}`, onClick: () => { setView('unit'); setSelectedQuestionIndex(null) } }] : []),
    ...(view !== 'dashboard' && view !== 'unit' ? [{ label: selectedQuestion?.label ?? MODULE_META[view as keyof typeof MODULE_META]?.label }] : []),
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      {/* ── Nav ── */}
      <header style={{
        flexShrink: 0,
        background: '#fff',
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 1px 4px rgba(15,23,42,0.06)',
        zIndex: 20,
      }}>
        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', height: '58px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '9px', background: 'linear-gradient(135deg, #4F46E5, #818CF8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>🇬🇧</div>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--foreground)' }}>
              Neuro<span style={{ color: 'var(--primary)' }}>cosmos</span>
            </span>
          </div>

          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {breadcrumbs.map((b, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {i > 0 && <span style={{ color: 'var(--muted-foreground)', fontSize: '12px' }}>/</span>}
                <button onClick={b.onClick} disabled={!b.onClick || i === breadcrumbs.length - 1} style={{
                  background: 'none', border: 'none', cursor: b.onClick && i < breadcrumbs.length - 1 ? 'pointer' : 'default',
                  fontSize: '13px', fontWeight: i === breadcrumbs.length - 1 ? 600 : 400,
                  color: i === breadcrumbs.length - 1 ? 'var(--foreground)' : 'var(--primary)',
                  padding: '0',
                }}>{b.label}</button>
              </span>
            ))}
          </div>

          {/* User */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted-foreground)' }}>🔥 14 days</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, #4F46E5, #818CF8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: '#fff' }}>S</div>
          </div>
        </div>

        {/* Level tabs — only on dashboard */}
        {view === 'dashboard' && (
          <div style={{ display: 'flex', gap: '0', borderTop: '1px solid var(--border)', padding: '0 28px' }}>
            {LEVELS.map(l => {
              const isDisabled = LEVEL_META[l].disabled
              return (
                <button
                  key={l}
                  onClick={() => { if (!isDisabled) { setLevel(l); setSelectedUnit(null) } }}
                  disabled={isDisabled}
                  style={{
                    padding: '10px 24px', background: 'none', border: 'none',
                    borderBottom: `2.5px solid ${level === l && !isDisabled ? 'var(--primary)' : 'transparent'}`,
                    color: isDisabled ? 'var(--muted-foreground)' : (level === l ? 'var(--primary)' : 'var(--muted-foreground)'),
                    opacity: isDisabled ? 0.5 : 1,
                    fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: level === l && !isDisabled ? 700 : 500,
                    cursor: isDisabled ? 'not-allowed' : 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '8px',
                    marginBottom: '-1px',
                  }}
                >
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700,
                  }}>{LEVEL_META[l].code}{isDisabled && ' 🔒'}</span>
                  <span style={{
                    fontSize: '11px', color: level === l && !isDisabled ? LEVEL_META[l].color : 'var(--muted-foreground)',
                    background: level === l && !isDisabled ? `${LEVEL_META[l].color}18` : 'transparent',
                    padding: '1px 6px', borderRadius: '4px',
                  }}>{LEVEL_META[l].label}</span>
                </button>
              )
            })}
          </div>
        )}
      </header>

      {/* ── Main content ── */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '32px 28px 48px' }}>
        {view === 'dashboard' && (
          <DashboardView level={level} units={units} onSelectUnit={goUnit} />
        )}
        {view === 'unit' && selectedUnitLive && (
          <UnitDetailView unit={selectedUnitLive} onBack={() => { setView('dashboard'); setSelectedUnit(null) }} onModule={goModule} onQuestion={goQuestion} />
        )}
        {view === 'grammar' && selectedUnitLive && (
          <GrammarView unit={selectedUnitLive} question={selectedQuestion} onBack={() => { setView('unit'); setSelectedQuestionIndex(null) }} />
        )}
        {view === 'audio' && selectedUnitLive && (
          <AudioView unit={selectedUnitLive} onBack={() => setView('unit')} />
        )}
        {view === 'dictation' && selectedUnitLive && (
          <DictationView unit={selectedUnitLive} onBack={() => setView('unit')} />
        )}
        {view === 'shadowing' && selectedUnitLive && (
          <ShadowingView unit={selectedUnitLive} onBack={() => setView('unit')} />
        )}
      </main>
    </div>
  )
}