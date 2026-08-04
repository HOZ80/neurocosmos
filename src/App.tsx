import { useState, useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Level = 'A1' | 'A2' | 'B1' | 'B2'
type View = 'dashboard' | 'unit' | 'grammar' | 'audio' | 'dictation' | 'shadowing'

interface DictationSegment {
  start: number
  end: number
  text: string
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
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const GRAMMAR_RULES: Record<string, { rule: string; examples: { en: string; tr: string }[] }> = {
  'Subject Pronouns': {
    rule: 'Subject pronouns replace nouns as the subject of a sentence. They tell us who or what performs the action of the verb.',
    examples: [
      { en: 'I am a student.', tr: 'Ben bir öğrenciyim.' },
      { en: 'She speaks English very well.', tr: 'O İngilizceyi çok iyi konuşuyor.' },
      { en: 'They live in London.', tr: 'Onlar Londra\'da yaşıyor.' },
    ],
  },
  'Simple Present': {
    rule: 'Use the simple present for habits, routines, and general truths. Add -s/-es for third person singular (he/she/it).',
    examples: [
      { en: 'She works at a hospital every day.', tr: 'O her gün bir hastanede çalışıyor.' },
      { en: 'The sun rises in the east.', tr: 'Güneş doğudan doğar.' },
      { en: 'We study English together.', tr: 'Birlikte İngilizce çalışıyoruz.' },
    ],
  },
  'Present Continuous': {
    rule: 'Use present continuous for actions happening right now or temporary situations. Form: am/is/are + verb-ing.',
    examples: [
      { en: 'I am reading a book right now.', tr: 'Şu an bir kitap okuyorum.' },
      { en: 'They are working on a new project.', tr: 'Yeni bir proje üzerinde çalışıyorlar.' },
    ],
  },
  'Past Simple': {
    rule: 'Use past simple for completed actions in the past. Regular verbs add -ed; irregular verbs change form.',
    examples: [
      { en: 'She visited Paris last summer.', tr: 'Geçen yaz Paris\'i ziyaret etti.' },
      { en: 'We went to the cinema yesterday.', tr: 'Dün sinemaya gittik.' },
    ],
  },
  'Future Plans': {
    rule: 'Use "going to" for plans and intentions you\'ve already decided, or for predictions based on evidence.',
    examples: [
      { en: 'I am going to study abroad next year.', tr: 'Gelecek yıl yurt dışında okuyacağım.' },
      { en: 'It is going to rain soon.', tr: 'Yakında yağmur yağacak.' },
    ],
  },
}

function buildUnits(level: Level): Unit[] {
  const sets: Record<Level, Omit<Unit, 'id' | 'completed' | 'locked' | 'progress'>[]> = {
    A1: [
      { title: 'Hello & Introductions', topic: 'Greetings', grammar: 'Subject Pronouns', dictationSentence: 'My name is Sarah and I am from England.', translation: 'Benim adım Sarah ve ben İngiltere\'denim.', transcript: 'Hello! My name is Sarah. I am from England. Nice to meet you! I am twenty-two years old and I am a student.', audioUrl: '/working-in-my-yard.mp3', dictationSegments: [
        {"start":0.0,"end":2.17,"text":"Working in my yard."},
        {"start":2.17,"end":6.05,"text":"I live in a house that has a small yard."},
        {"start":6.05,"end":9.08,"text":"In my yard, there is some lawn and a garden."},
        {"start":9.08,"end":15.56,"text":"There is also a sidewalk that leads to the front walk, and a driveway that leads to my garage."},
        {"start":15.56,"end":20.03,"text":"Throughout the year, I work to maintain my yard."},
        {"start":20.03,"end":26.35,"text":"During the summer, I cut the grass that grows in my yard using a lawn mower."},
        {"start":26.35,"end":37.87,"text":"I like the smell of the grass that has just been cut, but it's better not to cut the grass too short when the weather is dry."},
        {"start":37.87,"end":46.52,"text":"I also put water on the lawn and garden so that the grass and flowers can grow."},
        {"start":46.52,"end":53.25,"text":"During the fall, I rake the leaves off the trees in my yard. I use a rake to collect the leaves from the lawn."},
        {"start":53.25,"end":61.14,"text":"Then I put the leaves into bags. I can use the leaves to make fertilizer."},
        {"start":61.14,"end":67.2,"text":"When I was a kid, I didn't like the job of raking leaves, but now I don't mind it."},
        {"start":67.2,"end":74.81,"text":"At the end of the fall, before cold weather arrives, I remove flowers from the garden."},
        {"start":74.81,"end":82.46,"text":"During the winter, there is no work to do on the lawn or garden because they're covered in snow."},
        {"start":82.46,"end":87.25,"text":"But I need to keep the snow off my sidewalk and driveway."},
        {"start":87.25,"end":93.78,"text":"Whenever it snows, I use a shovel to clear the snow off the sidewalk and driveway."},
        {"start":93.78,"end":100.8,"text":"Sometimes it snows a lot; if I didn't shovel the snow, it would soon be impossible to get into my house."},
        {"start":100.8,"end":110.51,"text":"During the spring, snow melts. I clean out my yard by sweeping away leaves and removing weeds from the lawn."},
        {"start":110.51,"end":114.39,"text":"I also put flowers back into the garden."},
        {"start":114.39,"end":118.48,"text":"It's nice to see them again after the long, cold winter."},
        {"start":118.48,"end":125.38,"text":"When spring comes, the grass grows very quickly, so I need to cut the grass quite often."},
        {"start":125.38,"end":127.94,"text":"Working in the yard can be very satisfying work."},
        {"start":127.94,"end":132.65,"text":"At night, the lawn and garden are looking green and healthy."}
      ] },
      { title: 'Numbers & Counting', topic: 'Numbers 1–100', grammar: 'Simple Present', dictationSentence: 'There are twenty students in the classroom.', translation: 'Sınıfta yirmi öğrenci var.', transcript: 'How many students are there? There are twenty students in the classroom today. Please count them carefully.' },
      { title: 'Colors & Adjectives', topic: 'Describing things', grammar: 'Subject Pronouns', dictationSentence: 'The big red apple is on the table.', translation: 'Büyük kırmızı elma masanın üzerinde.', transcript: 'Look at the fruit bowl. The big red apple is on the table next to the yellow banana.' },
      { title: 'Family Members', topic: 'Family vocabulary', grammar: 'Simple Present', dictationSentence: 'She has two brothers and one sister.', translation: 'Onun iki erkek kardeşi ve bir kız kardeşi var.', transcript: 'Tell me about your family. She has two brothers and one sister. They all live together in a house.' },
      { title: 'Days & Time', topic: 'Calendar & Clock', grammar: 'Simple Present', dictationSentence: 'The meeting starts at nine o\'clock on Monday.', translation: 'Toplantı Pazartesi günü saat dokuzda başlar.', transcript: 'Please remember: the meeting starts at nine o\'clock on Monday. Do not be late!' },
      { title: 'Food & Drinks', topic: 'Restaurant vocabulary', grammar: 'Simple Present', dictationSentence: 'I would like a cup of tea, please.', translation: 'Bir fincan çay lütfen.', transcript: 'Welcome to the café. What would you like? I would like a cup of tea, please. Of course, here you go.' },
      { title: 'Shopping & Prices', topic: 'Money & stores', grammar: 'Subject Pronouns', dictationSentence: 'How much does this jacket cost?', translation: 'Bu ceket ne kadar?', transcript: 'Excuse me, how much does this jacket cost? It costs forty-five pounds. Do you have a smaller size?' },
      { title: 'Weather & Seasons', topic: 'Climate vocabulary', grammar: 'Simple Present', dictationSentence: 'It is very cold and windy today.', translation: 'Bugün çok soğuk ve rüzgarlı.', transcript: 'Good morning. Here is the weather forecast. It is very cold and windy today. Please wear a coat.' },
      { title: 'My Home & Rooms', topic: 'House vocabulary', grammar: 'Subject Pronouns', dictationSentence: 'The kitchen is next to the living room.', translation: 'Mutfak oturma odasının yanında.', transcript: 'Let me show you my house. The kitchen is next to the living room. My bedroom is upstairs on the left.' },
      { title: 'Daily Routines', topic: 'Everyday actions', grammar: 'Simple Present', dictationSentence: 'She wakes up at seven every morning.', translation: 'Her sabah saat yedide uyanır.', transcript: 'Tell me about your routine. She wakes up at seven every morning. Then she has breakfast and goes to work.' },
      { title: 'Animals & Nature', topic: 'Wildlife vocabulary', grammar: 'Subject Pronouns', dictationSentence: 'The dog is running in the garden.', translation: 'Köpek bahçede koşuyor.', transcript: 'Look outside! The dog is running in the garden with the children. It loves playing outside.' },
      { title: 'Body Parts & Health', topic: 'Medical vocabulary', grammar: 'Simple Present', dictationSentence: 'I have a headache and a sore throat.', translation: 'Başım ağrıyor ve boğazım acıyor.', transcript: 'I do not feel well today. I have a headache and a sore throat. I think I need to see a doctor.' },
      { title: 'Transport & Directions', topic: 'Getting around', grammar: 'Subject Pronouns', dictationSentence: 'Turn left at the traffic lights.', translation: 'Trafik ışıklarında sola dönün.', transcript: 'Excuse me, where is the train station? Go straight ahead and turn left at the traffic lights. It is on your right.' },
      { title: 'Jobs & Workplaces', topic: 'Professions', grammar: 'Simple Present', dictationSentence: 'He works as a teacher in a primary school.', translation: 'O ilköğretim okulunda öğretmen olarak çalışıyor.', transcript: 'What do you do for work? He works as a teacher in a primary school. He loves his job very much.' },
      { title: 'Hobbies & Free Time', topic: 'Leisure activities', grammar: 'Simple Present', dictationSentence: 'She enjoys reading books in her free time.', translation: 'Boş zamanlarında kitap okumayı seviyor.', transcript: 'What do you like to do? She enjoys reading books in her free time. She reads about two books a week.' },
      { title: 'Clothes & Fashion', topic: 'Clothing vocabulary', grammar: 'Subject Pronouns', dictationSentence: 'He is wearing a blue shirt and black trousers.', translation: 'Mavi bir gömlek ve siyah pantolon giyiyor.', transcript: 'Describe what you see. He is wearing a blue shirt and black trousers. His shoes are brown leather.' },
      { title: 'Feelings & Emotions', topic: 'Emotional vocabulary', grammar: 'Simple Present', dictationSentence: 'I feel nervous before every exam.', translation: 'Her sınavdan önce gergin hissediyorum.', transcript: 'How do you feel about exams? I feel nervous before every exam. But after I study well, I feel more confident.' },
      { title: 'School & Education', topic: 'Academic life', grammar: 'Subject Pronouns', dictationSentence: 'The library opens at eight in the morning.', translation: 'Kütüphane sabah sekizde açılıyor.', transcript: 'Do you know the library schedule? The library opens at eight in the morning and closes at nine at night.' },
      { title: 'Sports & Activities', topic: 'Physical activities', grammar: 'Simple Present', dictationSentence: 'They play football every Saturday afternoon.', translation: 'Her Cumartesi öğleden sonra futbol oynuyorlar.', transcript: 'What sports do they enjoy? They play football every Saturday afternoon in the local park near the school.' },
      { title: 'Review & Assessment', topic: 'A1 Complete review', grammar: 'Simple Present', dictationSentence: 'Learning English opens many doors in life.', translation: 'İngilizce öğrenmek hayatta birçok kapı açar.', transcript: 'Congratulations on reaching the final unit! Learning English opens many doors in life. Keep practising every day.' },
    ],
    A2: [
      { title: 'Past Experiences', topic: 'Past Simple', grammar: 'Past Simple', dictationSentence: 'She visited Paris for the first time last year.', translation: 'Geçen yıl ilk kez Paris\'i ziyaret etti.', transcript: 'Have you ever been to Paris? She visited Paris for the first time last year and absolutely loved it.' },
      { title: 'Comparing Things', topic: 'Comparatives', grammar: 'Simple Present', dictationSentence: 'This restaurant is much better than the other one.', translation: 'Bu restoran diğerinden çok daha iyi.', transcript: 'What do you think of the two restaurants? This restaurant is much better than the other one. The food is fresher.' },
      { title: 'Making Plans', topic: 'Future with going to', grammar: 'Future Plans', dictationSentence: 'We are going to visit my grandparents this weekend.', translation: 'Bu hafta sonu büyükanne ve büyükbabamı ziyaret edeceğiz.', transcript: 'What are your plans? We are going to visit my grandparents this weekend. I am really looking forward to it.' },
      { title: 'Asking Questions', topic: 'Question words', grammar: 'Simple Present', dictationSentence: 'Where did you go for your last holiday?', translation: 'Son tatilinizde nereye gittiniz?', transcript: 'I would like to ask you something. Where did you go for your last holiday? How long did you stay there?' },
      { title: 'Abilities & Possibilities', topic: 'Modal: can, could', grammar: 'Simple Present', dictationSentence: 'Could you help me with this exercise, please?', translation: 'Bu egzersizde bana yardım edebilir misiniz?', transcript: 'I need some help. Could you help me with this exercise, please? I do not understand the third question.' },
      { title: 'Recent Events', topic: 'Present Perfect', grammar: 'Simple Present', dictationSentence: 'I have already finished my homework.', translation: 'Ödevimi zaten bitirdim.', transcript: 'Have you done your homework? I have already finished my homework. I completed it before dinner last night.' },
      { title: 'Quantities', topic: 'Countable & Uncountable', grammar: 'Simple Present', dictationSentence: 'There is not much milk left in the fridge.', translation: 'Buzdolabında fazla süt kalmadı.', transcript: 'We need to go shopping. There is not much milk left in the fridge. We also need some bread and butter.' },
      { title: 'Locations', topic: 'Prepositions of place', grammar: 'Subject Pronouns', dictationSentence: 'The keys are on top of the cupboard.', translation: 'Anahtarlar dolabın üstünde.', transcript: 'Have you seen my keys? The keys are on top of the cupboard, behind the vase. I found them for you.' },
      { title: 'How Often?', topic: 'Adverbs of frequency', grammar: 'Simple Present', dictationSentence: 'She usually goes for a run before breakfast.', translation: 'Genellikle kahvaltıdan önce koşuya çıkar.', transcript: 'Is she very active? She usually goes for a run before breakfast. She does this almost every weekday morning.' },
      { title: 'Too Much & Enough', topic: 'Too & Enough', grammar: 'Simple Present', dictationSentence: 'The coffee is too hot to drink right now.', translation: 'Kahve şu an içmek için çok sıcak.', transcript: 'Why are you waiting? The coffee is too hot to drink right now. I will wait for it to cool down a little.' },
      { title: 'Belonging', topic: 'Possessives', grammar: 'Subject Pronouns', dictationSentence: 'Whose bag is this on the floor?', translation: 'Yerdeki bu çanta kimin?', transcript: 'Look at this. Whose bag is this on the floor? I think it belongs to the student who sits near the window.' },
      { title: 'Adding Information', topic: 'Relative clauses', grammar: 'Simple Present', dictationSentence: 'The book that I am reading is very exciting.', translation: 'Okuduğum kitap çok heyecan verici.', transcript: 'Tell me about your book. The book that I am reading is very exciting. It is about a detective in New York.' },
      { title: 'If & Then', topic: 'First Conditional', grammar: 'Simple Present', dictationSentence: 'If it rains tomorrow, we will stay inside.', translation: 'Yarın yağmur yağarsa içeride kalacağız.', transcript: 'What are your plans for tomorrow? If it rains tomorrow, we will stay inside and watch some films together.' },
      { title: 'Likes & Dislikes', topic: 'Preferences', grammar: 'Simple Present', dictationSentence: 'I prefer tea to coffee in the mornings.', translation: 'Sabahları kahveye çay tercih ediyorum.', transcript: 'Which do you prefer? I prefer tea to coffee in the mornings. Coffee makes me feel too anxious early on.' },
      { title: 'Giving Advice', topic: 'Making suggestions', grammar: 'Simple Present', dictationSentence: 'Why don\'t you try speaking English every day?', translation: 'Her gün İngilizce konuşmayı denesene?', transcript: 'I want to improve faster. Why don\'t you try speaking English every day? Even short conversations help a lot.' },
      { title: 'Childhood Memories', topic: 'Past Continuous', grammar: 'Past Simple', dictationSentence: 'When I was young, I was learning to play piano.', translation: 'Küçükken piyano çalmayı öğreniyordum.', transcript: 'Tell me about your childhood. When I was young, I was learning to play piano. I had lessons every Saturday.' },
      { title: 'Travel & Holidays', topic: 'Travel vocabulary', grammar: 'Past Simple', dictationSentence: 'We booked a hotel near the beach for two weeks.', translation: 'İki haftalık sahil yakınında bir otel ayırttık.', transcript: 'Tell me about your trip. We booked a hotel near the beach for two weeks. The weather was absolutely perfect.' },
      { title: 'Technology & Media', topic: 'Digital life', grammar: 'Present Continuous', dictationSentence: 'She is streaming a documentary about wildlife.', translation: 'Yaban hayatı hakkında bir belgesel izliyor.', transcript: 'What is she watching? She is streaming a documentary about wildlife on her laptop. She finds it fascinating.' },
      { title: 'Culture & Society', topic: 'Social topics', grammar: 'Simple Present', dictationSentence: 'Many people celebrate different festivals around the world.', translation: 'Dünyanın dört bir yanında pek çok insan farklı festivalleri kutlar.', transcript: 'Let us talk about culture. Many people celebrate different festivals around the world. It is a beautiful thing.' },
      { title: 'A2 Final Review', topic: 'A2 Complete review', grammar: 'Past Simple', dictationSentence: 'I have learned so much English this year.', translation: 'Bu yıl çok fazla İngilizce öğrendim.', transcript: 'You have reached the end of A2! I have learned so much English this year. I feel much more confident now.' },
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
    completed: i < (level === 'A1' ? 9 : level === 'A2' ? 5 : level === 'B1' ? 2 : 0),
    locked: i > (level === 'A1' ? 12 : level === 'A2' ? 8 : level === 'B1' ? 4 : 2),
    progress: i < (level === 'A1' ? 9 : 5) ? 100 : i === (level === 'A1' ? 9 : 5) ? 45 : 0,
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
          {level} Course
        </h1>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--muted-foreground)' }}>
          {units.filter(u => u.completed).length} of 20 units completed · {Math.round(units.filter(u => u.completed).length / 20 * 100)}% progress
        </p>
      </div>

      {/* Overall progress bar */}
      <div style={{ height: '6px', background: 'var(--muted)', borderRadius: '6px', overflow: 'hidden' }}>
        <div style={{
          width: `${(units.filter(u => u.completed).length / 20) * 100}%`,
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
        {units.map(unit => {
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
                  Unit {unit.id}
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

function UnitDetailView({ unit, onBack, onModule }: {
  unit: Unit
  onBack: () => void
  onModule: (m: keyof typeof MODULE_META) => void
}) {
  return (
    <div className="anim-slide-down" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <BackBtn onClick={onBack} label="All Units" />

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--primary)',
            background: 'rgba(79,70,229,0.1)', padding: '3px 9px', borderRadius: '5px', letterSpacing: '0.06em',
          }}>Unit {unit.id}</span>
          <span style={{ fontSize: '12px', color: 'var(--muted-foreground)' }}>{unit.topic}</span>
        </div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '32px', fontWeight: 700, margin: '0 0 6px' }}>{unit.title}</h2>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--muted-foreground)' }}>Grammar focus: {unit.grammar}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
        {(Object.entries(MODULE_META) as [keyof typeof MODULE_META, typeof MODULE_META[keyof typeof MODULE_META]][]).map(([key, meta]) => (
          <button
            key={key}
            onClick={() => onModule(key)}
            style={{
              textAlign: 'left', background: 'var(--card)',
              border: '1px solid var(--border)', borderRadius: '16px',
              padding: '24px', cursor: 'pointer',
              boxShadow: '0 1px 5px rgba(15,23,42,0.06)',
              transition: 'all 0.18s', display: 'flex', flexDirection: 'column', gap: '14px',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 6px 24px ${meta.color}22`; e.currentTarget.style.borderColor = `${meta.color}44` }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 5px rgba(15,23,42,0.06)'; e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <div style={{
              width: '48px', height: '48px', borderRadius: '12px',
              background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '22px',
            }}>{meta.icon}</div>
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, margin: '0 0 4px' }}>{meta.label}</h3>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
                {key === 'grammar' && 'Rules, patterns, and examples explained clearly.'}
                {key === 'audio' && 'Listen to native speakers with speed control.'}
                {key === 'dictation' && 'Type what you hear and check your accuracy.'}
                {key === 'shadowing' && 'Record yourself and compare with the original.'}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Chip label={meta.label} color={meta.color} bg={meta.bg} />
              <svg width="18" height="18" viewBox="0 0 24 24" fill={meta.color}><path d="M10 17l5-5-5-5v10z" /></svg>
            </div>
          </button>
        ))}
      </div>

      {/* Sentence preview */}
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
    </div>
  )
}

function GrammarView({ unit, onBack }: { unit: Unit; onBack: () => void }) {
  const rule = GRAMMAR_RULES[unit.grammar] ?? GRAMMAR_RULES['Simple Present']
  return (
    <div className="anim-slide-down" style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '680px' }}>
      <BackBtn onClick={onBack} label={unit.title} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: MODULE_META.grammar.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>📖</div>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 700, margin: 0 }}>{unit.grammar}</h2>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted-foreground)' }}>Grammar · {unit.title}</p>
        </div>
      </div>

      {/* Rule box */}
      <div style={{ background: '#EEF2FF', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '14px', padding: '20px 24px' }}>
        <p style={{ margin: '0 0 6px', fontFamily: 'var(--font-mono)', fontSize: '10px', color: '#6366F1', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Rule</p>
        <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.7, color: '#1E1B4B' }}>{rule.rule}</p>
      </div>

      {/* Examples */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Examples</p>
        {rule.examples.map((ex, i) => (
          <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 20px' }}>
            <p style={{ margin: '0 0 5px', fontSize: '15px', fontWeight: 500, lineHeight: 1.5 }}>{ex.en}</p>
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
    </div>
  )
}

function AudioView({ unit, onBack }: { unit: Unit; onBack: () => void }) {
  const [showTranscript, setShowTranscript] = useState(false)
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
  const sentences = unit.transcript.split('. ').filter(Boolean).map(s => s.endsWith('.') ? s : s + '.')
  const [current, setCurrent] = useState(0)
  const [recording, setRecording] = useState(false)
  const [done, setDone] = useState<boolean[]>(new Array(sentences.length).fill(false))
  const [recSec, setRecSec] = useState(0)
  const recRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function handleRecord() {
    if (recording) {
      if (recRef.current) clearInterval(recRef.current)
      setRecording(false)
      setDone(d => d.map((v, i) => i === current ? true : v))
    } else {
      setRecSec(0)
      setRecording(true)
      recRef.current = setInterval(() => setRecSec(s => s + 1), 1000)
    }
  }

  return (
    <div className="anim-slide-down" style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '680px' }}>
      <BackBtn onClick={onBack} label={unit.title} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: MODULE_META.shadowing.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>🎙️</div>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 700, margin: 0 }}>Shadowing</h2>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted-foreground)' }}>{unit.title} · {done.filter(Boolean).length}/{sentences.length} sentences recorded</p>
        </div>
      </div>

      {/* Sentence list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {sentences.map((s, i) => (
          <button
            key={i}
            onClick={() => { setCurrent(i); setRecording(false) }}
            style={{
              textAlign: 'left', padding: '14px 18px', borderRadius: '12px',
              border: `1.5px solid ${i === current ? 'rgba(16,185,129,0.45)' : done[i] ? 'rgba(16,185,129,0.2)' : 'var(--border)'}`,
              background: i === current ? '#ECFDF5' : done[i] ? '#F0FDF4' : 'var(--card)',
              cursor: 'pointer', transition: 'all 0.15s',
              display: 'flex', alignItems: 'flex-start', gap: '12px',
            }}
          >
            <div style={{
              width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0, marginTop: '1px',
              background: done[i] ? 'var(--success)' : i === current ? 'rgba(16,185,129,0.15)' : 'var(--muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: i === current && !done[i] ? '2px solid rgba(16,185,129,0.5)' : 'none',
            }}>
              {done[i]
                ? <svg width="11" height="11" viewBox="0 0 24 24" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                : <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: i === current ? '#059669' : 'var(--muted-foreground)' }}>{i + 1}</span>}
            </div>
            <span style={{ fontSize: '14px', lineHeight: 1.6, color: i === current ? '#065F46' : done[i] ? '#047857' : 'var(--foreground)', fontWeight: i === current ? 500 : 400 }}>{s}</span>
          </button>
        ))}
      </div>

      {/* Recording controls */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px',
        display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center',
      }}>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted-foreground)', textAlign: 'center' }}>
          Listen to sentence {current + 1}, then record yourself saying it aloud
        </p>
        <div style={{ position: 'relative', display: 'inline-flex' }}>
          {recording && <div className="mic-ring" style={{ position: 'absolute', inset: 0, borderRadius: '50%' }} />}
          <button onClick={handleRecord} style={{
            width: '68px', height: '68px', borderRadius: '50%', border: 'none',
            background: recording ? 'linear-gradient(135deg, #EF4444, #DC2626)' : 'linear-gradient(135deg, #10B981, #059669)',
            color: '#fff', cursor: 'pointer', fontSize: '26px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: recording ? '0 4px 20px rgba(239,68,68,0.4)' : '0 4px 20px rgba(16,185,129,0.3)',
            transition: 'all 0.2s', position: 'relative', zIndex: 1,
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.06)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
          >
            {recording ? '⏹' : '🎙️'}
          </button>
        </div>
        {recording && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
              {[1,2,3,4,5].map(i => (
                <div key={i} className="wave-bar" style={{ width: '4px', background: '#EF4444', borderRadius: '3px', height: '4px', animationDuration: `${0.4 + i * 0.07}s` }} />
              ))}
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#EF4444' }}>Recording {fmt(recSec)}</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
          <button
            onClick={() => setCurrent(c => Math.max(0, c - 1))}
            disabled={current === 0}
            style={{ flex: 1, padding: '9px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--secondary)', color: current === 0 ? 'var(--muted-foreground)' : 'var(--foreground)', fontSize: '13px', fontWeight: 500, cursor: current === 0 ? 'not-allowed' : 'pointer' }}
          >← Previous</button>
          <button
            onClick={() => setCurrent(c => Math.min(sentences.length - 1, c + 1))}
            disabled={current === sentences.length - 1}
            style={{ flex: 1, padding: '9px', borderRadius: '9px', border: '1px solid var(--border)', background: 'var(--secondary)', color: current === sentences.length - 1 ? 'var(--muted-foreground)' : 'var(--foreground)', fontSize: '13px', fontWeight: 500, cursor: current === sentences.length - 1 ? 'not-allowed' : 'pointer' }}
          >Next →</button>
        </div>
      </div>
    </div>
  )
}

// ─── Root App ─────────────────────────────────────────────────────────────────

const LEVELS: Level[] = ['A1', 'A2', 'B1', 'B2']
const LEVEL_META: Record<Level, { label: string; color: string }> = {
  A1: { label: 'Beginner',       color: '#10B981' },
  A2: { label: 'Elementary',     color: '#0EA5E9' },
  B1: { label: 'Intermediate',   color: '#8B5CF6' },
  B2: { label: 'Upper-Intermed', color: '#F59E0B' },
}

export default function App() {
  const [level, setLevel] = useState<Level>('A1')
  const [view, setView] = useState<View>('dashboard')
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null)
  const units = buildUnits(level)

  function goUnit(u: Unit) { setSelectedUnit(u); setView('unit') }
  function goModule(m: keyof typeof MODULE_META) { setView(m as View) }
  function goBack() {
    if (view === 'dashboard') return
    if (view === 'unit') { setView('dashboard'); setSelectedUnit(null) }
    else setView('unit')
  }

  const breadcrumbs = [
    { label: level, onClick: () => { setView('dashboard'); setSelectedUnit(null) } },
    ...(selectedUnit ? [{ label: `Unit ${selectedUnit.id}`, onClick: () => setView('unit') }] : []),
    ...(view !== 'dashboard' && view !== 'unit' ? [{ label: MODULE_META[view as keyof typeof MODULE_META]?.label }] : []),
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
              Eng<span style={{ color: 'var(--primary)' }}>rise</span>
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
            {LEVELS.map(l => (
              <button
                key={l}
                onClick={() => { setLevel(l); setSelectedUnit(null) }}
                style={{
                  padding: '10px 24px', background: 'none', border: 'none',
                  borderBottom: `2.5px solid ${level === l ? 'var(--primary)' : 'transparent'}`,
                  color: level === l ? 'var(--primary)' : 'var(--muted-foreground)',
                  fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: level === l ? 700 : 500,
                  cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '8px',
                  marginBottom: '-1px',
                }}
              >
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700,
                }}>{l}</span>
                <span style={{
                  fontSize: '11px', color: level === l ? LEVEL_META[l].color : 'var(--muted-foreground)',
                  background: level === l ? `${LEVEL_META[l].color}18` : 'transparent',
                  padding: '1px 6px', borderRadius: '4px',
                }}>{LEVEL_META[l].label}</span>
              </button>
            ))}
          </div>
        )}
      </header>

      {/* ── Main content ── */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '32px 28px 48px' }}>
        {view === 'dashboard' && (
          <DashboardView level={level} units={units} onSelectUnit={goUnit} />
        )}
        {view === 'unit' && selectedUnit && (
          <UnitDetailView unit={selectedUnit} onBack={() => { setView('dashboard'); setSelectedUnit(null) }} onModule={goModule} />
        )}
        {view === 'grammar' && selectedUnit && (
          <GrammarView unit={selectedUnit} onBack={() => setView('unit')} />
        )}
        {view === 'audio' && selectedUnit && (
          <AudioView unit={selectedUnit} onBack={() => setView('unit')} />
        )}
        {view === 'dictation' && selectedUnit && (
          <DictationView unit={selectedUnit} onBack={() => setView('unit')} />
        )}
        {view === 'shadowing' && selectedUnit && (
          <ShadowingView unit={selectedUnit} onBack={() => setView('unit')} />
        )}
      </main>
    </div>
  )
}
