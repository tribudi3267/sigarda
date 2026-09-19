/**
 * KATALOG SKU PENEGAK (resmi)
 *
 * Sumber: Keputusan Kwartir Nasional Gerakan Pramuka Nomor 198 Tahun 2011,
 * Lampiran III "Syarat-Syarat Kecakapan Umum (Golongan Penegak)".
 *   SKU Penegak Bantara : 23 butir
 *   SKU Penegak Laksana : 22 butir
 *
 * Butir nomor 1 (ketakwaan) memiliki sub-butir yang BERBEDA menurut agama peserta.
 * Dokumen resmi hanya merinci Islam, Katolik, Protestan, Hindu, dan Buddha.
 * Untuk agama lain (mis. Khonghucu) dipakai satu butir pengganti (AGAMA_LAIN).
 *
 * Aturan id: BAN-xx / LAK-xx untuk butir biasa, BAN-xx-ISL-n untuk sub-butir agama.
 * Jangan ubah id setelah ada data progres, karena id dipakai sebagai kunci penyimpanan.
 */

export const AGAMA = ['Islam', 'Katolik', 'Protestan', 'Hindu', 'Buddha', 'Khonghucu'];

const KODE_AGAMA = { Islam: 'ISL', Katolik: 'KAT', Protestan: 'PRO', Hindu: 'HIN', Buddha: 'BUD', Khonghucu: 'KHO' };
export const kodeAgama = (agama) => KODE_AGAMA[agama] ?? 'LAIN';

// Dokumen resmi tidak merinci butir agama ini. Ditetapkan Pembina bersama Dewan Ambalan.
const AGAMA_LAIN = [
  'Materi uji butir agama ditetapkan Pembina bersama Dewan Ambalan (tidak dirinci pada dokumen SKU Penegak Kwarnas).',
];

/* ------------------------------ SKU BANTARA ------------------------------ */
const BUTIR_BANTARA = [
  {
    no: 1,
    agama: {
      Islam: [
        'Dapat menjelaskan makna Rukun Iman dan Rukun Islam.',
        'Mampu menjelaskan makna Sholat berjamaah dan dapat mendirikan Sholat sunah secara individu.',
        'Mampu menjelaskan makna berpuasa serta macam-macam Puasa.',
        'Tahu tata cara merawat atau mengurus jenazah (Tajhizul Jenazah).',
        'Dapat membaca doa Ijab Qobul Zakat.',
        'Dapat menghafal minimal sebuah hadist dan menjelaskan hadist tersebut.',
      ],
      Katolik: [
        'Tahu dan paham makna dan arti Gereja Katolik.',
        'Dapat memimpin doa dan membangun serta membuat gerakan cinta kasih pada keberagaman agama di luar Gereja Katolik.',
      ],
      Protestan: ['Mendalami Hukum Kasih dan mengamalkannya dalam kehidupan sehari-hari.'],
      Hindu: [
        'Dapat menjelaskan sejarah perkembangan agama Hindu di Indonesia.',
        'Dapat menjelaskan makna dan hakikat dari tujuan melaksanakan persembahyangan sehari-hari dan hari besar keagamaan Hindu.',
        'Dapat menjelaskan maksud dan tujuan kelahiran menjadi manusia menurut agama Hindu.',
        'Dapat menjelaskan makna dan hakekat ajaran Tri Hita Karana dengan pelestarian alam lingkungan.',
        'Dapat mempraktikkan bentuk gerakan Asanas dari Hatta Yoga.',
        'Dapat melafalkan dan mengkidungkan salah satu bentuk Dharma Gita.',
        'Dapat mendeskripsikan struktur, fungsi dan sejarah pura dalam cakupan Sad Kahyangan.',
      ],
      Buddha: [
        'Saddha: Mengungkapkan Buddha Dharma sebagai salah satu agama.',
        'Merumuskan dasar-dasar keyakinan dan cara mengembangkannya.',
        'Menjelaskan sejarah Buddha Gotama.',
        'Menjelaskan Tiratana sebagai pelindung.',
        'Menjelaskan kisah-kisah sejarah penulisan kitab suci tripitaka.',
      ],
    },
  },
  { no: 2, teks: 'Berani menyampaikan kritik dan saran dengan sopan dan santun kepada sesama teman.' },
  { no: 3, teks: 'Dapat mengikuti jalannya diskusi dengan baik.' },
  { no: 4, teks: 'Dapat saling menghormati dan toleransi dalam bakti antar umat beragama.' },
  { no: 5, teks: 'Mengikuti pertemuan Ambalan sekurang-kurangnya 2 kali setiap bulan.' },
  { no: 6, teks: 'Setia membayar iuran kepada gugus depan, dengan uang yang diperoleh dari usaha sendiri.' },
  { no: 7, teks: 'Dapat berbahasa Indonesia dengan baik dan benar dalam pergaulan sehari-hari.' },
  { no: 8, teks: 'Telah membantu mengelola kegiatan di Ambalan.' },
  { no: 9, teks: 'Telah ikut aktif kerja bakti di masyarakat minimal 2 kali.' },
  { no: 10, teks: 'Dapat menampilkan kesenian daerah di depan umum minimal satu kali.' },
  { no: 11, teks: 'Mengenal, mengerti dan memahami isi AD & ART Gerakan Pramuka.' },
  { no: 12, teks: 'Dapat menjelaskan sejarah Kepramukaan Indonesia dan dunia.' },
  { no: 13, teks: 'Dapat menggunakan jam, kompas, tanda jejak dan tanda-tanda alam lainnya dalam pengembaraan.' },
  { no: 14, teks: 'Dapat menjelaskan bentuk pengamalan Pancasila dalam kehidupan sehari-hari.' },
  { no: 15, teks: 'Dapat menjelaskan tentang organisasi ASEAN dan PBB.' },
  { no: 16, teks: 'Dapat menjelaskan tentang kewirausahaan.' },
  { no: 17, teks: 'Dapat mendaur ulang barang bekas menjadi barang yang bermanfaat.' },
  { no: 18, teks: 'Dapat menerapkan pengetahuannya tentang tali temali dan pionering dalam kehidupan sehari-hari.' },
  { no: 19, teks: 'Selalu berolahraga, mampu melakukan olahraga renang gaya bebas dan menguasai 1 (satu) cabang olahraga tim.' },
  { no: 20, teks: 'Dapat menjelaskan perkembangan fisik laki-laki dan perempuan.' },
  { no: 21, teks: 'Dapat memimpin baris-berbaris dan menjelaskan peraturannya kepada anggota sangganya.' },
  { no: 22, teks: 'Dapat menyebutkan beberapa penyakit infeksi, degeneratif dan penyakit yang disebabkan perilaku tidak sehat.' },
  { no: 23, teks: 'Ikut serta dalam perkemahan selama 3 hari berturut-turut.' },
];

/* ------------------------------ SKU LAKSANA ------------------------------ */
const BUTIR_LAKSANA = [
  {
    no: 1,
    agama: {
      Islam: [
        'Dapat menjelaskan makna Rukun Iman dan Rukun Islam di muka Pasukan Penggalang atau Ambalan Penegak.',
        'Dapat menjelaskan rukun sholat dan dapat mendirikan sholat sunah.',
        'Dapat menjelaskan rukun puasa serta dapat melakukan salah satu puasa sunah.',
        'Memahami tata cara merawat/mengurus jenazah.',
        'Pernah menjadi amil zakat.',
        'Dapat menghafal ayat tematik, dari alquran dan mampu menjelaskannya.',
      ],
      Katolik: [
        'Memahami dan mendalami 7 sakramen.',
        'Menghayati dan dapat menceritakan riwayat salah satu Santo / Santa.',
        'Membahas 10 Perintah Allah, dilengkapi dengan contoh kehidupan sehari-hari.',
      ],
      Protestan: [
        'Dapat memberi kesaksian di depan jemaat atau teman sebaya.',
        'Dapat berpartisipasi aktif dalam pelayanan Gereja sesuai bakat dan kemampuannya.',
        'Telah mengikuti pengajaran Agama (Katekisasi).',
      ],
      Hindu: [
        'Dapat menjelaskan sejarah kerajaan/candi-candi agama Hindu di Indonesia.',
        'Dapat melafalkan dan bertindak sebagai pemimpin persembahyangan Panca Sembah.',
        'Dapat menjelaskan Samsara/Punarbawa atau reinkarnasi sebagai bentuk untuk penyempurnaan kelahiran berikutnya.',
        'Dapat menjelaskan konsep Ajaran Asta Brata.',
        'Dapat melakukan gerakan dan menjelaskan fungsi, serta manfaat dari setiap gerakan Yoga Asanas.',
        'Dapat melafalkan dan mengkidungkan lebih dari satu bentuk Dharma Gita.',
        'Dapat menjelaskan bentuk dan fungsi dari seni sakral keagamaan Hindu.',
      ],
      Buddha: [
        'Dapat memimpin dan mengorganisir kebaktian (pagi dan sore) serta perayaan hari-hari besar Agama Buddha; hari Waisak, Asadha, Kathina, Maggapuja.',
        'Saddha: Mendiskripsikan ruang lingkup dan intisari Tripitaka.',
        'Menjelaskan makna dan manfaat puja serta doa.',
        'Mendiskripsikan sila sebagai bagian dari jalan mulia berunsur delapan.',
        'Menjelaskan kebenaran yang terdapat dalam tripitaka.',
      ],
    },
  },
  { no: 2, teks: 'Dapat menerima kritik orang lain, serta berani mengeluarkan pendapatnya dengan tertib, sopan dan santun kepada orang-orang di sekitarnya.' },
  { no: 3, teks: 'Dapat mengikuti atau memimpin diskusi Ambalan dan mampu mengambil keputusan.' },
  { no: 4, teks: 'Dapat menjadi penengah (memberi solusi), jika terjadi ketidaksepahaman dalam kelompoknya.' },
  { no: 5, teks: 'Mengikuti pertemuan Ambalan sekurang-kurangnya 3 kali setiap bulan.' },
  { no: 6, teks: 'Setia membayar iuran kepada gugus depannya, dengan uang yang diperoleh dari usaha sendiri, serta membantu Ambalan dalam mengelola administrasi keuangan.' },
  { no: 7, teks: 'Dapat memimpin rapat dan membuat risalah dengan baik.' },
  { no: 8, teks: 'Pernah memimpin kegiatan di tingkat Ambalan.' },
  { no: 9, teks: 'Pernah memimpin kerja bakti di masyarakat minimal 2 kali.' },
  { no: 10, teks: 'Dapat memimpin kelompok dalam menampilkan salah satu jenis kesenian daerah.' },
  { no: 11, teks: 'Dapat menjelaskan isi AD & ART Gerakan Pramuka kepada Ambalan.' },
  { no: 12, teks: 'Dapat menjelaskan di muka umum tentang sejarah kepramukaan Indonesia dan dunia.' },
  { no: 13, teks: 'Dapat melakukan pengembaraan selama 3 hari dan atau mengatur kehidupan perkemahan selama minimal 3 hari.' },
  { no: 14, teks: 'Dapat menjelaskan sejarah, arti, tatacara penggunaan dan kiasan Sang Merah Putih.' },
  { no: 15, teks: 'Dapat menjelaskan peran Indonesia dalam organisasi ASEAN dan PBB.' },
  { no: 16, teks: 'Telah memiliki keterampilan kewirausahaan yang dapat menghasilkan uang.' },
  { no: 17, teks: 'Dapat membuat salah satu jenis peralatan teknologi tepat guna.' },
  { no: 18, teks: 'Secara berkelompok dapat membuat struktur dari keterampilan tali temali dan pionering, yang dapat digunakan masyarakat.' },
  { no: 19, teks: 'Selalu berolahraga. Dapat melakukan olahraga renang selain gaya bebas dan menguasai 1 (satu) cabang olahraga lainnya.' },
  { no: 20, teks: 'Dapat memahami dan menjelaskan tentang kesehatan reproduksi.' },
  { no: 21, teks: 'Dapat mempersiapkan dan melaksanakan upacara umum minimal 3 kali.' },
  { no: 22, teks: 'Dapat menyebutkan penyebab dan cara pencegahan penyakit infeksi, degeneratif dan penyakit yang disebabkan perilaku tidak sehat.' },
];

const p2 = (n) => String(n).padStart(2, '0');

function bangun(kode, judul, daftar) {
  return {
    kode,
    judul,
    butir: daftar.map((b) => ({ ...b, id: `${kode}-${p2(b.no)}`, teks: b.teks ?? null, agama: b.agama ?? null })),
  };
}

export const TINGKAT = {
  Bantara: bangun('BAN', 'SKU Penegak Bantara', BUTIR_BANTARA),
  Laksana: bangun('LAK', 'SKU Penegak Laksana', BUTIR_LAKSANA),
};

export const DAFTAR_TINGKAT = Object.keys(TINGKAT);

/**
 * Unit yang diuji untuk satu butir. Butir biasa = 1 unit. Butir agama = satu unit per sub-butir
 * sesuai agama peserta. Bentuk unit: { id, tingkat, butirNo, sub (1..n atau null), agama, teks }.
 */
export function unitButir(tingkat, butir, agama) {
  if (!butir.agama) {
    return [{ id: butir.id, tingkat, butirNo: butir.no, sub: null, agama: null, teks: butir.teks }];
  }
  const kode = kodeAgama(agama);
  const teks = butir.agama[agama] ?? AGAMA_LAIN;
  return teks.map((t, i) => ({
    id: `${butir.id}-${kode}-${i + 1}`,
    tingkat,
    butirNo: butir.no,
    sub: i + 1,
    agama: butir.agama[agama] ? agama : agama || 'Lainnya',
    teks: t,
  }));
}

const HURUF = 'abcdefghijklmnopqrstuvwxyz';
export const hurufSub = (sub) => HURUF[sub - 1] ?? String(sub);
/** Contoh: "Butir 5", "Butir 1a" */
export const labelPoin = (p) => `Butir ${p.butirNo}${p.sub ? hurufSub(p.sub) : ''}`;

// Indeks id -> unit untuk seluruh agama, agar pencarian cepat tanpa tahu agama pesertanya
export const INDEKS_POIN = {};
for (const [tingkat, t] of Object.entries(TINGKAT)) {
  for (const b of t.butir) {
    for (const agama of [...AGAMA, '']) {
      for (const u of unitButir(tingkat, b, agama)) INDEKS_POIN[u.id] = u;
    }
  }
}
