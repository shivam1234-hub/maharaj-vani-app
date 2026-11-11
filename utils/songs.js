/**
 * The Prayers & Songs catalogue: the prayers chanted daily in ISKCON temples
 * (mangalacarana, pranamas, astakas), the songs of the Vaisnava acaryas, and
 * the great prayers of the Srimad-Bhagavatam — each with the spellings its
 * lectures go by on audio.iskcondesiretree.com and YouTube.
 *
 * Shared by scripts/build-song-index.js (which files archive lectures under
 * each entry) and the app (which lists them and filters live YouTube results),
 * so both agree on what names "Gurvastakam".
 *
 * Matching runs on a lowercased, diacritic-free, underscore-to-space copy of
 * a file name or video title (see `normalize`). Patterns are deliberately
 * specific: a song's opening words or its established title, never a bare
 * deity name ("Gopinath" alone is also a temple and a devotee).
 */

/** Optional "sri " and spacing/hyphen variations are handled by `normalize`. */
const A = 'a?sh?th?a?k'; // astakam / ashtakam / asthakam / astak

const GROUPS = [
  { key: 'mangala', name: 'Mangalacarana & Pranamas', blurb: 'The invocations and obeisances that open every class' },
  { key: 'astaka', name: 'Astakas & Stotras', blurb: 'Eight-verse prayers of the acaryas' },
  { key: 'bhaktivinoda', name: 'Songs of Bhaktivinoda Thakura', blurb: 'Saranagati, Gitavali, Kalyana-kalpataru' },
  { key: 'narottama', name: 'Songs of Narottama dasa Thakura', blurb: 'Prema-bhakti-candrika and Prarthana' },
  { key: 'other', name: 'Other Vaisnava Songs', blurb: 'Songs of Locana dasa, Govinda dasa and other acaryas' },
  { key: 'bhagavatam', name: 'Prayers in Srimad-Bhagavatam', blurb: 'Kunti, Bhisma, Prahlada, Gajendra, the gopis and more' },
];

/**
 * id: stable key (URLs, saved place). name: display title. author. group.
 * line: the opening words, as sung. re: what a lecture title must contain.
 */
const SONGS = [
  // ------------------------------------------------ mangalacarana & pranamas
  { id: 'mangalacarana', group: 'mangala', name: 'Mangalacarana', author: 'Traditional', line: 'vande ’haṁ śrī-guroḥ śrī-yuta-pada-kamalaṁ',
    re: /mangala\s*c(?:h)?ara?na|mangalacharan|vande\s*h?a?m\s*sri\s*guro/ },
  { id: 'om-ajnana', group: 'mangala', name: 'Om Ajnana-timirandhasya', author: 'Gautamiya Tantra', line: 'oṁ ajñāna-timirāndhasya',
    re: /ajn?a?ana\s*timir|agyan\s*timir|agyana\s*timir/ },
  { id: 'prabhupada-pranati', group: 'mangala', name: 'Sri Prabhupada Pranati', author: 'Traditional', line: 'nama oṁ viṣṇu-pādāya kṛṣṇa-preṣṭhāya bhū-tale',
    re: /prabhupada\s*pranat|nama\s*om\s*vishnu\s*padaya|nama\s*om\s*visnu\s*padaya|namah?\s*om\s*vi?s?h?nu\s*pad/ },
  { id: 'panca-tattva', group: 'mangala', name: 'Panca-tattva Maha-mantra', author: 'Traditional', line: 'śrī-kṛṣṇa-caitanya prabhu nityānanda',
    re: /pa[nñ]c?h?a\s*tatt?va\s*(?:maha\s*)?mantra|panca\s*tattva\s*pranam/ },
  { id: 'maha-mantra', group: 'mangala', name: 'Hare Krsna Maha-mantra', author: 'Kali-santarana Upanisad', line: 'hare kṛṣṇa hare kṛṣṇa kṛṣṇa kṛṣṇa hare hare',
    re: /maha\s*mantra|mahamantra/ },
  { id: 'nrsimha-pranama', group: 'mangala', name: 'Prayers to Lord Nrsimhadeva', author: 'Traditional', line: 'namas te nara-siṁhāya prahlādāhlāda-dāyine',
    re: /namaste\s*nara?s(?:i|im)h?ay|namas\s*te\s*nara?s|n(?:a|r)?r?s(?:i|im)+ha\s*(?:deva\s*)?(?:pranam|prayers?|kavac|stuti|arati|aarti)|narsimha\s*(?:pranam|prayers?|kavac)/ },
  { id: 'tulasi', group: 'mangala', name: 'Sri Tulasi Pranama & Kirtana', author: 'Traditional', line: 'vṛndāyai tulasī-devyai priyāyai keśavasya ca',
    re: /tulasi\s*(?:devi\s*)?(?:pranam|kirtan|puja|pooja|arati|aarti|prayers?|stuti)|namo\s*namah?\s*tulasi|vrndayai\s*tulasi|vrindayai\s*tulasi/ },
  { id: 'jaya-radha-madhava', group: 'mangala', name: 'Jaya Radha-Madhava', author: 'Bhaktivinoda Thakura', line: 'jaya rādhā-mādhava kuñja-bihārī',
    re: /jaya\s*radha\s*madhava/ },
  { id: 'gaura-arati', group: 'mangala', name: 'Sri Gaura-arati', author: 'Bhaktivinoda Thakura', line: 'jaya jaya gorācāṅder āratiko śobhā',
    re: /gaura?\s*arati|gaura?\s*aarti|gora\s*cand(?:er)?\s*arati|jaya\s*jaya\s*gora\s*cand/ },
  { id: 'guru-vandana', group: 'mangala', name: 'Sri Guru-vandana', author: 'Narottama dasa Thakura', line: 'śrī-guru-caraṇa-padma, kevala-bhakati-sadma',
    re: /guru\s*c(?:h)?ar(?:a)?na?\s*padma|guru\s*vandana/ },

  // ------------------------------------------------ astakas & stotras
  { id: 'gurvastakam', group: 'astaka', name: 'Sri Sri Gurv-astakam', author: 'Visvanatha Cakravarti Thakura', line: 'saṁsāra-dāvānala-līḍha-loka',
    re: new RegExp(`gur(?:u|v)\\s*v?${A}|gurvast|gurvasht|samsara\\s*dava`) },
  { id: 'siksastakam', group: 'astaka', name: 'Sri Siksastakam', author: 'Sri Caitanya Mahaprabhu', line: 'ceto-darpaṇa-mārjanaṁ',
    re: /\bs(?:h)?ik?s(?:h)?a?\s*a?sh?th?a?k|ceto\s*darpan|cheto\s*darpan/ },
  { id: 'damodarastakam', group: 'astaka', name: 'Sri Damodarastakam', author: 'Satyavrata Muni (Padma Purana)', line: 'namāmīśvaraṁ sac-cid-ānanda-rūpaṁ',
    re: new RegExp(`damodar(?:a)?\\s*${A}|namamisvaram|namami\\s*isvaram|namami\\s*ishvaram`) },
  { id: 'jagannathastakam', group: 'astaka', name: 'Sri Jagannathastakam', author: 'Sri Caitanya Mahaprabhu', line: 'kadācit kālindī-taṭa-vipina-saṅgīta-tarala',
    re: new RegExp(`jagann?ath(?:a)?\\s*${A}`) },
  { id: 'sad-gosvami', group: 'astaka', name: 'Sri Sad-gosvamy-astakam', author: 'Srinivasa Acarya', line: 'kṛṣṇotkīrtana-gāna-nartana-parau',
    re: new RegExp(`(?:sad|shad|six)\\s*g[oa]s(?:h)?(?:w|v)am(?:i|y|is)\\s*${A}|krsnotkirtana|krishnotkirtan`) },
  { id: 'madhurastakam', group: 'astaka', name: 'Sri Madhurastakam', author: 'Vallabhacarya', line: 'adharaṁ madhuraṁ vadanaṁ madhuram',
    re: new RegExp(`madhur(?:a)?\\s*${A}|adharam\\s*madhuram`) },
  { id: 'caurastakam', group: 'astaka', name: 'Sri Caurastakam', author: 'Bilvamangala Thakura', line: 'vraje prasiddhaṁ navanīta-cauraṁ',
    re: new RegExp(`c(?:h)?aur(?:a)?\\s*${A}`) },
  { id: 'nandanandanastakam', group: 'astaka', name: 'Sri Nanda-nandanastakam', author: 'Traditional', line: 'sucāru-vaktra-maṇḍalaṁ',
    re: new RegExp(`nanda\\s*nandan(?:a)?\\s*${A}`) },
  { id: 'saci-tanayastakam', group: 'astaka', name: 'Sri Saci-tanayastakam', author: 'Sarvabhauma Bhattacarya', line: 'ujjvala-varaṇa-gaura-vara-dehaṁ',
    re: /s(?:h)?ac(?:h)?i\s*tanay/ },
  { id: 'radha-kripa-kataksa', group: 'astaka', name: 'Sri Radha-krpa-kataksa-stava', author: 'Lord Siva (Urdhvamnaya Tantra)', line: 'muni-vṛnda-vandya-triloka-śoka-hāriṇi',
    re: /(?:kripa|krpa|krupa)\s*katak?s(?:h)?a/ },
  { id: 'radhika-stava', group: 'astaka', name: 'Sri Radhika-stava (Radhe Jaya Jaya)', author: 'Rupa Gosvami', line: 'rādhe jaya jaya mādhava-dayite',
    re: /radhe\s*jaya\s*jaya\s*madhava|radhika\s*stava/ },
  { id: 'dasavatara', group: 'astaka', name: 'Sri Dasavatara-stotra', author: 'Jayadeva Gosvami', line: 'pralaya-payodhi-jale dhṛtavān asi vedam',
    re: /da(?:s|sh)?h?a\s*avatar(?:a)?\s*stot|dasavatara\s*stot|dashavatar\s*stot|pralaya\s*payodhi|jaya\s*jagadis(?:h|a)\s*hare/ },
  { id: 'namastakam', group: 'astaka', name: 'Sri Namastakam', author: 'Rupa Gosvami', line: 'nikhila-śruti-mauli-ratna-mālā',
    re: new RegExp(`\\bnam(?:a)?\\s*${A}`) },
  { id: 'govardhana-radhakunda', group: 'astaka', name: 'Sri Govardhana & Radha-kunda Astakas', author: 'Raghunatha dasa Gosvami & others', line: 'govardhana-vāsa-prārthanā-daśakam',
    re: new RegExp(`govardhan(?:a)?\\s*${A}|radha\\s*kunda?\\s*${A}|govardhan(?:a)?\\s*vasa\\s*prarthana`) },

  // ------------------------------------------------ Bhaktivinoda Thakura
  { id: 'saranagati', group: 'bhaktivinoda', name: 'Saranagati (the book of songs)', author: 'Bhaktivinoda Thakura', line: 'śrī-kṛṣṇa-caitanya prabhu jīve dayā kari',
    re: /s(?:h)?ara?nagati\s*(?:songs?|bhajans?|book|by|of\s*bhakti)|saranagati\s*(?:\d|day|part|session|class|seminar|lecture)|jive\s*daya\s*kari/ },
  { id: 'manasa-deha-geha', group: 'bhaktivinoda', name: 'Manasa, Deha, Geha', author: 'Bhaktivinoda Thakura', line: 'mānasa, deha, geha, jo kichu mor',
    re: /manasa?\s*deha\s*geha/ },
  { id: 'amara-jivana', group: 'bhaktivinoda', name: 'Amara Jivana', author: 'Bhaktivinoda Thakura', line: 'āmāra jīvana, sadā pāpe rata',
    re: /amara?\s*jivana?\s*(?:sada|song|bhajan)|amara\s*jivana/ },
  { id: 'gopinatha', group: 'bhaktivinoda', name: 'Gopinatha', author: 'Bhaktivinoda Thakura', line: 'gopīnātha, mama nivedana śuno',
    re: /gopinath(?:a)?\s*(?:mama|song|bhajan|prayers?|kirtan\s*explan)|mama\s*nivedana/ },
  { id: 'ki-jani-ki-bale', group: 'bhaktivinoda', name: 'Ki Jani Ki Bale', author: 'Bhaktivinoda Thakura', line: 'ki jāni ki bale, tomāra dhāmete',
    re: /ki\s*jani\s*ki\s*bale/ },
  { id: 'jiv-jago', group: 'bhaktivinoda', name: 'Jiv Jago', author: 'Bhaktivinoda Thakura', line: 'jīv jāgo, jīv jāgo, gauracānda bole',
    re: /jiva?\s*jago/ },
  { id: 'arunodaya-kirtana', group: 'bhaktivinoda', name: 'Arunodaya-kirtana (Udilo Aruna)', author: 'Bhaktivinoda Thakura', line: 'udilo aruṇa pūraba-bhāge',
    re: /udilo\s*arun|arunodaya\s*kirtan/ },
  { id: 'vibhavari-sesa', group: 'bhaktivinoda', name: 'Vibhavari Sesa', author: 'Bhaktivinoda Thakura', line: 'vibhāvarī śeṣa, āloka-praveśa',
    re: /vibhavari/ },
  { id: 'yasomati-nandana', group: 'bhaktivinoda', name: 'Yasomati-nandana', author: 'Bhaktivinoda Thakura', line: 'yaśomatī-nandana, braja-baro-nāgara',
    re: /yas(?:h)?o(?:mati|da)\s*nandan(?:a)?\s*(?:braja|vraja|song|bhajan)|yas(?:h)?omati\s*nandana/ },
  { id: 'gay-gora', group: 'bhaktivinoda', name: 'Gay Gora Madhur Sware', author: 'Bhaktivinoda Thakura', line: 'gāy gorā madhur sware',
    re: /gaya?\s*gora\s*madhur/ },
  { id: 'kabe-habe-bolo', group: 'bhaktivinoda', name: 'Kabe Habe Bolo', author: 'Bhaktivinoda Thakura', line: 'kabe ha’be bolo se-dina āmār',
    re: /kabe\s*ha\s*?'?\s*be\s*bolo|kabe\s*habe\s*bolo/ },
  { id: 'ohe-vaisnava-thakura', group: 'bhaktivinoda', name: 'Ohe! Vaisnava Thakura', author: 'Bhaktivinoda Thakura', line: 'ohe! vaiṣṇaba ṭhākura, doyāra sāgara',
    re: /ohe\s*vais?h?n?a?b?v?a\s*thakur/ },
  { id: 'prasada-sevaya', group: 'bhaktivinoda', name: 'Prasada-sevaya (Sarira Avidya-jal)', author: 'Bhaktivinoda Thakura', line: 'śarīra avidyā-jāl, joḍendriya tāhe kāl',
    re: /s(?:h)?ar[ei]ra\s*avidya|prasad(?:a|am)?\s*sevaya/ },
  { id: 'suddha-bhakata', group: 'bhaktivinoda', name: 'Suddha-bhakata', author: 'Bhaktivinoda Thakura', line: 'śuddha-bhakata-caraṇa-reṇu',
    re: /s(?:h)?uddha\s*bhakat/ },
  { id: 'durlabha-manava', group: 'bhaktivinoda', name: 'Durlabha Manava-janma', author: 'Bhaktivinoda Thakura', line: 'durlabha mānava-janma labhiyā saṁsāre',
    re: /durlabh(?:a)?\s*manava/ },
  { id: 'emona-durmati', group: 'bhaktivinoda', name: 'Emona Durmati', author: 'Bhaktivinoda Thakura', line: 'emona durmati, saṁsāra bhitore',
    re: /emon(?:a)?\s*durmati/ },
  { id: 'kali-kukkura', group: 'bhaktivinoda', name: 'Kali-kukkura', author: 'Bhaktivinoda Thakura', line: 'kali-kukkura-kadana yadi cāo he',
    re: /kali\s*kukkur/ },
  { id: 'nadiya-godrume', group: 'bhaktivinoda', name: 'Nadiya-godrume', author: 'Bhaktivinoda Thakura', line: 'nadīyā-godrume nityānanda mahājana',
    re: /nadiya?\s*godrum/ },
  { id: 'hari-haraye', group: 'bhaktivinoda', name: 'Hari Haraye Namah Krsna', author: 'Narottama dasa Thakura', line: 'hari haraye namaḥ kṛṣṇa yādavāya namaḥ',
    re: /hari\s*haraye\s*nama/ },
  { id: 'radha-krsna-bol', group: 'bhaktivinoda', name: 'Radha-Krsna Bol', author: 'Bhaktivinoda Thakura', line: '‘rādhā-kṛṣṇa’ bol bol bolo re sobāi',
    re: /radha\s*kr?s?h?i?s?n?a\s*bol\s*bol/ },
  { id: 'bhaja-gauranga', group: 'bhaktivinoda', name: 'Bhaja Gauranga Kaha Gauranga', author: 'Bhaktivinoda Thakura', line: 'bhaja gaurāṅga kaha gaurāṅga',
    re: /bhaja\s*gauranga\s*kaha/ },
  { id: 'bhajan-rahasya', group: 'bhaktivinoda', name: 'Sri Bhajana-rahasya', author: 'Bhaktivinoda Thakura', line: 'the confidential secrets of bhajana',
    re: /bhajana?\s*rahasya/ },
  { id: 'kalyana-kalpataru', group: 'bhaktivinoda', name: 'Kalyana-kalpataru & Gitavali', author: 'Bhaktivinoda Thakura', line: 'songs of the wish-fulfilling tree',
    re: /kalyana\s*kalpa\s*taru|gitavali/ },

  // ------------------------------------------------ Narottama dasa Thakura
  { id: 'ei-bara-karuna', group: 'narottama', name: 'Ei Bara Karuna Koro', author: 'Narottama dasa Thakura', line: 'ei bāra karuṇā koro vaiṣṇava gosāi',
    re: /ei\s*bara\s*karuna/ },
  { id: 'hari-hari-biphale', group: 'narottama', name: 'Hari Hari Biphale', author: 'Narottama dasa Thakura', line: 'hari hari! biphale janama goṇāinu',
    re: /hari\s*hari\s*(?:b|v)iphal/ },
  { id: 'nitai-pada-kamala', group: 'narottama', name: 'Nitai Pada Kamala', author: 'Narottama dasa Thakura', line: 'nitāi-pada-kamala, koṭī-candra-suśītala',
    re: /nitai\s*pada\s*kamal/ },
  { id: 'gauranga-bolite', group: 'narottama', name: 'Gauranga Bolite Habe', author: 'Narottama dasa Thakura', line: '‘gaurāṅga’ bolite ha’be pulaka-śarīra',
    re: /gauranga\s*bolite/ },
  { id: 'je-anilo-prema-dhana', group: 'narottama', name: 'Je Anilo Prema-dhana', author: 'Narottama dasa Thakura', line: 'je ānilo prema-dhana karuṇā pracur',
    re: /je\s*anilo\s*prema/ },
  { id: 'thakura-vaisnava-pada', group: 'narottama', name: 'Thakura Vaisnava-pada', author: 'Narottama dasa Thakura', line: 'ṭhākura vaiṣṇava-pada, avanīra su-sampada',
    re: /thakura?\s*vais?h?n?a?va\s*pada/ },
  { id: 'sri-rupa-manjari', group: 'narottama', name: 'Sri Rupa-manjari-pada', author: 'Narottama dasa Thakura', line: 'śrī-rūpa-mañjarī-pada, sei mora sampada',
    re: /rupa\s*manjari\s*pada/ },
  { id: 'radha-krsna-prana-mora', group: 'narottama', name: 'Radha-Krsna Prana Mora', author: 'Narottama dasa Thakura', line: 'rādhā-kṛṣṇa prāṇa mora yugala-kiśora',
    re: /radha\s*kr?s?h?i?s?n?a\s*prana\s*mora/ },
  { id: 'prema-bhakti-candrika', group: 'narottama', name: 'Prema-bhakti-candrika', author: 'Narottama dasa Thakura', line: 'the moonrays of loving devotion',
    re: /prema\s*bhakti\s*c(?:h)?andrika/ },
  { id: 'gaura-pahu-narottama', group: 'narottama', name: 'Gaura Pahu Na Bhajiya', author: 'Narottama dasa Thakura', line: 'gaurā pahū nā bhajiyā goinu',
    re: /gaura?\s*pa(?:h)?un?\b/ },

  // ------------------------------------------------ other acaryas
  { id: 'parama-karuna', group: 'other', name: 'Parama Karuna', author: 'Locana dasa Thakura', line: 'parama karuṇa, pahū dui jana',
    re: /parama\s*karuna/ },
  { id: 'bhajahu-re-mana', group: 'other', name: 'Bhajahu Re Mana', author: 'Govinda dasa Kaviraja', line: 'bhajahū re mana śrī-nanda-nandana',
    re: /bhaja\s*hu?\s*re\s*mana|bhajahu?\s*re\s*mana/ },
  { id: 'daya-kara-more', group: 'other', name: 'Sri Krsna Caitanya Prabhu Doya Koro More', author: 'Narottama dasa Thakura', line: 'śrī-kṛṣṇa-caitanya prabhu doyā koro more',
    re: /d(?:a|o)ya\s*k(?:a|o)ra?o?\s*more/ },
  { id: 'vaisnava-ke', group: 'other', name: 'Vaisnava Ke?', author: 'Bhaktisiddhanta Sarasvati Thakura', line: 'duṣṭa mana! tumi kiser vaiṣṇava?',
    re: /vais?h?n?a?va\s*ke\b|kiser\s*vais/ },
  { id: 'krsna-tava-punya', group: 'other', name: 'Markine Bhagavata-dharma', author: 'Srila Prabhupada', line: 'baḍa-kṛpā kaile kṛṣṇa adhamera prati',
    re: /markine\s*bhagavat|boston\s*poem|bada\s*krpa\s*kaile/ },
  { id: 'gita-govinda', group: 'other', name: 'Sri Gita-govinda', author: 'Jayadeva Gosvami', line: 'meghair meduram ambaram',
    re: /g(?:i|ee)ta\s*govind/ },

  // ------------------------------------------------ prayers in Srimad-Bhagavatam
  { id: 'kunti-prayers', group: 'bhagavatam', name: 'Prayers by Queen Kunti', author: 'SB 1.8', line: 'namasye puruṣaṁ tvādyam īśvaraṁ prakṛteḥ param',
    re: /kunti\s*(?:maharani\s*|devi\s*|mata\s*)?(?:ki\s*)?(?:prayers?|stuti|stava|prarthana)|queen\s*kunti|teachings\s*of\s*(?:queen\s*)?kunti/ },
  { id: 'bhisma-prayers', group: 'bhagavatam', name: 'Prayers by Bhismadeva', author: 'SB 1.9', line: 'iti matir upakalpitā vitṛṣṇā',
    re: /bhi?s(?:h)?ma(?:deva|dev)?\s*(?:ki\s*)?(?:prayers?|stuti|stava|prarthana)/ },
  { id: 'prahlada-prayers', group: 'bhagavatam', name: 'Prayers by Prahlada Maharaja', author: 'SB 7.9', line: 'brahmādayaḥ sura-gaṇā munayo ’tha siddhāḥ',
    re: /prahlad(?:a)?\s*(?:maharaj(?:a)?\s*)?(?:ki\s*)?(?:prayers?|stuti|prarthana)|teachings\s*of\s*prahlad/ },
  { id: 'gajendra-prayers', group: 'bhagavatam', name: 'Prayers by Gajendra', author: 'SB 8.3', line: 'oṁ namo bhagavate tasmai yata etac cid-ātmakam',
    re: /gajendra\s*(?:moksh?a|ki\s*prarthana|prayers?|stuti)|gajendra\s*'?s\s*prayers?/ },
  { id: 'brahma-prayers', group: 'bhagavatam', name: 'Prayers by Lord Brahma', author: 'SB 10.14', line: 'naumīḍya te ’bhra-vapuṣe taḍid-ambarāya',
    re: /brahma(?:ji)?\s*(?:ki\s*)?(?:prayers?|stuti|prarthana)|brahma\s*stuti|naumidya/ },
  { id: 'dhruva-prayers', group: 'bhagavatam', name: 'Prayers by Dhruva Maharaja', author: 'SB 4.9', line: 'yo ’ntaḥ praviśya mama vācam imāṁ prasuptāṁ',
    re: /dhruva\s*(?:maharaj(?:a)?\s*)?(?:ki\s*)?(?:prayers?|stuti|prarthana)/ },
  { id: 'vrtrasura-prayers', group: 'bhagavatam', name: 'Prayers by Vrtrasura', author: 'SB 6.11', line: 'ahaṁ hare tava pādaika-mūla',
    re: /vr?(?:i|r)?t(?:r)?asura\s*(?:ki\s*)?(?:prayers?|stuti|prarthana|catuh)/ },
  { id: 'akrura-prayers', group: 'bhagavatam', name: 'Prayers by Akrura', author: 'SB 10.40', line: 'nato ’smy ahaṁ tvākhila-hetu-hetuṁ',
    re: /akrura\s*(?:ki\s*)?(?:prayers?|stuti|prarthana)/ },
  { id: 'devaki-vasudeva-prayers', group: 'bhagavatam', name: 'Prayers by the Demigods for Lord Krsna in the Womb', author: 'SB 10.2', line: 'satya-vrataṁ satya-paraṁ tri-satyaṁ',
    re: /garbha\s*stuti|prayers?\s*(?:by|of)\s*(?:the\s*)?demigods\s*(?:for|to)\s*(?:lord\s*)?kr?s?h?i?s?n?a\s*in\s*the\s*womb|satya\s*vratam/ },
  { id: 'gopi-gita', group: 'bhagavatam', name: 'Gopi-gita', author: 'SB 10.31', line: 'jayati te ’dhikaṁ janmanā vrajaḥ',
    re: /gopi\s*g(?:i|ee)th?a/ },
  { id: 'venu-gita', group: 'bhagavatam', name: 'Venu-gita', author: 'SB 10.21', line: 'akṣaṇvatāṁ phalam idaṁ na paraṁ vidāmaḥ',
    re: /venu\s*g(?:i|ee)th?a/ },
  { id: 'bhramara-gita', group: 'bhagavatam', name: 'Bhramara-gita', author: 'SB 10.47', line: 'madhupa kitava-bandho mā spṛśāṅghriṁ sapatnyāḥ',
    re: /bhramara\s*g(?:i|ee)th?a/ },
  { id: 'nalakuvara-prayers', group: 'bhagavatam', name: 'Prayers by Nalakuvara & Manigriva', author: 'SB 10.10', line: 'kṛṣṇa kṛṣṇa mahā-yogiṁs tvam ādyaḥ puruṣaḥ paraḥ',
    re: /nala\s*kuvara|manigriva/ },
  { id: 'mucukunda-prayers', group: 'bhagavatam', name: 'Prayers by King Mucukunda', author: 'SB 10.51', line: 'vimohito ’yaṁ jana īśa māyayā',
    re: /mu(?:c|ch)ukunda/ },
  { id: 'vedas-prayers', group: 'bhagavatam', name: 'Prayers by the Personified Vedas', author: 'SB 10.87', line: 'jaya jaya jahy ajām ajita doṣa-gṛbhīta-guṇāṁ',
    re: /(?:prayers?\s*(?:by|of)\s*(?:the\s*)?)?personified\s*vedas|veda\s*stuti|sruti\s*gita|shruti\s*gita/ },
];

function normalize(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[_\-–.,()[\]]+/g, ' ')
    .toLowerCase()
    .replace(/\bshri\b|\bsri\b|\bsree\b/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Devotees are named after songs and prayers ("Shikshastakam Prabhu", "Saci
 * Tanaya Pr", "Parama Karuna Pr"): a match followed by an honorific is a
 * person, not the song.
 */
const HONORIFIC_AFTER = /^\s*(?:pr|prabhu|prabhuji|das|dasa|dasi|devi|mataji|mtj|sw|swami|maharaj)\b/;

const GLOBAL = new Map(SONGS.map((song) => [song.id, new RegExp(song.re.source, 'g')]));

/** Every catalogue entry a title names, in catalogue order. */
function matchSongs(text) {
  const s = normalize(text);
  if (!s) return [];
  return SONGS.filter((song) => {
    const re = GLOBAL.get(song.id);
    re.lastIndex = 0;
    for (let m = re.exec(s); m; m = re.exec(s)) {
      // Finish the word first: "shikshastak|am prabhu".
      const after = s.slice(m.index + m[0].length).replace(/^[a-z]*/, '');
      if (!HONORIFIC_AFTER.test(after)) return true;
      if (m[0].length === 0) re.lastIndex++;
    }
    return false;
  }).map((song) => song.id);
}

/** Words that mark a talk about a song rather than the song being sung. */
const EXPLAINED = /explan|purport|meaning|tatparya|vyakhya|bhavartha|artha\b|lecture|class|seminar|talk|commentary|discussion|discourse|katha|q\s*&?\s*a|question|session|course|day\s*\d|reflection|insight|glories|study/;
/** Where a recording is a kirtan, a bhajan or a studio track. */
const PERFORMANCE = /kirtan|bhajans?\b|music|album|recitation|recital|tune|chants?\b|\bcd\b|instrumental|studio|melod|harmonium|karaoke|aarti\s*songs?|soundtrack/;

/**
 * A recording of the song being sung (kirtan, bhajan album, recitation)
 * rather than a lecture on it — unless its title also says it is explained.
 * `text` is the file name and folder (or a video title).
 */
function isPerformance(text) {
  const s = normalize(text);
  return PERFORMANCE.test(s) && !EXPLAINED.test(s);
}

module.exports = { GROUPS, SONGS, matchSongs, isPerformance, normalize };
