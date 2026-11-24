# Panduan: Peringatan automatik Last Man Out

Untuk **Setiausaha Jabatan (SU) JPPP, KPTM Kuantan**.
Masa diperlukan: lebih kurang 20 minit, sekali sahaja. Anda tidak perlu tahu menulis kod.

Selepas dipasang, skrip ini menghantar notis Last Man Out (MQS) bagi pihak anda setiap pagi, daripada akaun Google KPTM anda sendiri.

> Nama menu Google mungkin berbeza sedikit mengikut bahasa akaun anda. Nama dalam bahasa Inggeris diberi dalam kurungan, cth. **Sambungan** (Extensions).

---

## 1. Apa yang berlaku

| Bila | Apa skrip buat | Siapa terima |
|---|---|---|
| **2 hari sebelum giliran**, sekitar 7 pagi (termasuk Sabtu dan Ahad). Contoh: giliran bermula Isnin, notis dihantar Sabtu. | Emel *"Giliran Last Man Out (MQS): ..."* dan **jemputan Google Calendar** (waktu bertugas setiap hari bekerja dalam giliran itu; lalai 18:00–18:15) | Pegawai bertugas |
| **Hari pertama giliran**, sekitar 7 pagi | Emel ringkasan dengan butang **Buka WhatsApp untuk (nama pegawai)** | Anda (SU) |
| **7 hari sebelum giliran**, jika pegawai itu tiada emel dalam Sheet | Amaran, supaya anda sempat mengisi emelnya | Anda (SU) |
| **Setiap hari bertugas, selepas tugas** (jika **butang Selesai** dipasang, Langkah 11) | 18:15: peringatan jika pegawai belum menekan Selesai. 18:30: amaran jika masih belum | Pegawai (peringatan); Ketua Jabatan, salinan kepada anda (amaran) |
| Bila ada masalah (tiada emel, kuota, ralat) | Disenaraikan dalam emel ringkasan dan dalam lajur **Catatan skrip** dalam Sheet | Anda (SU) |

- Skrip berjalan sendiri setiap pagi antara 7 dan 8 pagi (waktu Malaysia). Komputer atau telefon anda tidak perlu dibuka.
- Emel dihantar daripada akaun anda, jadi pegawai boleh terus membalas kepada anda (contoh: jika mereka bercuti atau berkursus).
- Jika skrip terlepas satu pagi, ia menghantar keesokan harinya, asalkan giliran belum bermula.
- Notis yang sudah dihantar **tidak dihantar semula**, walaupun anda import jadual baharu.
- Jemputan kalendar dalam kalendar anda sendiri ada peringatan pop-up 30 minit sebelum waktu bertugas bermula.

### Kenapa WhatsApp tidak dihantar secara automatik?

WhatsApp tidak membenarkan skrip percuma menghantar mesej bagi pihak anda. Cara rasmi (WhatsApp Business Platform) memerlukan akaun perniagaan yang disahkan oleh Meta, templat mesej yang diluluskan, dan bayaran bagi setiap mesej.

Jadi skrip **menyediakan mesej untuk anda**. Pada hari pertama giliran:

1. Buka emel ringkasan daripada skrip (sebaiknya di telefon).
2. Tekan butang **Buka WhatsApp untuk (nama pegawai)**.
3. WhatsApp dibuka dengan mesej peringatan siap ditulis kepada pegawai itu. Tekan **Hantar**.

Jika pegawai itu tiada No. WhatsApp dalam Sheet, emel ringkasan memberi mesej untuk anda salin dan hantar sendiri.

---

## 2. Cipta Google Sheet

1. Buka **https://sheets.google.com** dengan akaun Google KPTM anda.
2. Tekan **Kosong** (Blank) untuk hamparan baharu.
3. Klik **Hamparan tanpa tajuk** (Untitled spreadsheet) di kiri atas dan namakan, contohnya **Giliran Last Man Out JPPP**.
4. Di bahagian bawah, klik kanan tab **Helaian1** (Sheet1) › **Namakan semula** (Rename) › taip **Giliran** › tekan Enter.
5. Pilih **Fail › Tetapan** (File › Settings). Tetapkan:
   - Tempat (Locale): **Malaysia**
   - Zon masa (Time zone): **(GMT+08:00) Kuala Lumpur**

   Tekan **Simpan tetapan** (Save settings).
6. **Jangan kongsi** Sheet ini. Ia akan mengandungi nama, emel dan nombor telefon staf.

---

## 3. Masukkan jadual giliran dari planner

1. Dalam planner: menu **⋯** › **Giliran Last Man Out** › **Eksport CSV untuk Google Sheet**.
   Satu fail bernama seperti `giliran-lmo-2026-12-01.csv` dimuat turun.
2. Dalam Google Sheet, klik tab **Giliran**, kemudian klik sel **A1**.
3. Pilih **Fail › Import** (File › Import) › tab **Muat naik** (Upload) › seret fail CSV tadi ke dalam kotak.
4. Dalam tetingkap **Import fail** (Import file):
   - Lokasi import (Import location): **Gantikan helaian semasa** (Replace current sheet)
   - Jenis pemisah (Separator type): **Kesan secara automatik** (Detect automatically)
   - **Buang tanda** pada **Tukar teks kepada nombor, tarikh dan formula** (Convert text to numbers, dates, and formulas)
   - Tekan **Import data**.
5. Semak baris 1. Ia mesti mengandungi tajuk ini:
   `ID, Mula, Tamat, Masa mula, Masa tamat, Nama, Emel, No WhatsApp, Jawatan, Program, Cuti, Emel dihantar, Kalendar dihantar, WhatsApp dihantar, Had pengesahan, Kod pengesahan, Emel KJ, Hari tiada tugas`

   (Fail CSV daripada planner versi lama tidak mempunyai 4 lajur terakhir. Skrip masih berfungsi, tetapi butang Selesai memerlukan planner terkini.)
6. Semak lajur **Emel**. Pegawai tanpa emel tidak akan menerima emel atau jemputan kalendar (skrip akan memberitahu anda).
7. Pastikan nama tab masih **Giliran**.

Kenapa buang tanda "Tukar teks...": supaya nombor seperti `60123456789` dan tarikh `2026-12-07` kekal seperti dalam planner. Jika terlupa, skrip masih faham tarikh seperti `7/12/2026`.

---

## 4. Tampal kod skrip

1. Dalam Google Sheet: **Sambungan › Apps Script** (Extensions › Apps Script). Satu tab baharu dibuka.
2. Klik **Projek tanpa tajuk** (Untitled project) di kiri atas dan namakan **Last Man Out**.
3. Buka kod skrip di GitHub:
   **https://github.com/hafizi-ui/planner/blob/main/automation/LastManOut.gs**
   Tekan butang **Copy raw file** (ikon dua segi empat) di sebelah kanan atas kotak kod.
4. Kembali ke Apps Script. Dalam fail **Kod.gs** (Code.gs), tekan **Ctrl+A** (pilih semua) dan **Delete**, kemudian **Ctrl+V** (tampal).
5. Tekan ikon **Simpan projek** (Save project, ikon cakera) atau **Ctrl+S**.
6. Di sebelah kiri, tekan ikon gear **Tetapan projek** (Project Settings). Pada **Zon masa** (Time zone), pilih **(GMT+08:00) Kuala Lumpur**.
7. Tutup tab Apps Script. Kembali ke Google Sheet dan **muat semula** halaman (tekan **F5**).
   Selepas beberapa saat, menu baharu **Last Man Out** muncul di sebelah **Bantuan** (Help).

Menu **Last Man Out** mengandungi:

| Menu | Fungsi |
|---|---|
| **Pasang (sekali sahaja)** | Mulakan peringatan automatik setiap pagi |
| **Uji tanpa hantar** | Lihat apa yang akan dihantar pada sesuatu tarikh. Tiada apa-apa dihantar. |
| **Hantar emel ujian kepada saya** | Terima contoh emel, jemputan kalendar dan emel WhatsApp. Hanya anda yang terima. |
| **Jalankan sekarang** | Hantar sekarang notis yang perlu dihantar hari ini (tanpa tunggu esok pagi) |
| **Pautan Selesai (web app)** | Simpan URL web app untuk butang Selesai (Langkah 11) |
| **Emel Ketua Jabatan** | Tetapkan emel lain untuk amaran, contohnya pemangku Ketua Jabatan (Langkah 11) |
| **Henti automatik** | Hentikan semua peringatan automatik |

---

## 5. Pasang (sekali sahaja)

1. Pilih **Last Man Out › Pasang (sekali sahaja)**.
2. Kali pertama, Google meminta kebenaran:
   - **Kebenaran diperlukan** (Authorization required) › **Teruskan** (Continue).
   - Pilih akaun KPTM anda.
   - Jika muncul **Google belum mengesahkan apl ini** (Google hasn't verified this app): ini **dijangka**, kerana skrip ini milik anda sendiri dan bukan apl awam. Tekan **Lanjutan** (Advanced) › **Pergi ke Last Man Out (tidak selamat)** (Go to Last Man Out (unsafe)).
   - Baca senarai kebenaran dan tekan **Benarkan** (Allow). Skrip memerlukan kebenaran untuk:
     - melihat dan mengubah **Sheet ini sahaja** (untuk membaca jadual dan menulis tarikh dihantar);
     - menghantar emel sebagai anda;
     - mengurus kalendar anda (untuk mencipta jemputan);
     - berjalan semasa anda tiada (jadual setiap pagi, dan semakan butang Selesai setiap 10 minit);
     - memaparkan menu dan kotak mesej dalam Sheet;
     - melihat alamat emel anda (supaya emel ringkasan sampai kepada anda).
3. Jika klik pertama hanya memaparkan skrin kebenaran, pilih **Pasang (sekali sahaja)** sekali lagi.
4. Mesej **Automatik dipasang** muncul, bersama bilangan giliran yang dijumpai dalam tab Giliran.

Menekan **Pasang** dua kali tidak mendatangkan masalah: hanya dua jadual disimpan (larian harian 7 pagi, dan semakan butang Selesai setiap 10 minit pada hari bekerja mulai 17:00; semakan ini tidak berbuat apa-apa selagi butang Selesai belum dipasang).

Jika anda memasang selepas jam 8 pagi, larian automatik pertama ialah esok pagi. Jika ada notis yang perlu dihantar hari ini, pilih **Jalankan sekarang**.

---

## 6. Uji dengan selamat

### A. Uji tanpa hantar (tiada apa-apa dihantar)

1. Pilih **Last Man Out › Uji tanpa hantar**.
2. Taip satu tarikh, contohnya **hari Sabtu sebelum giliran pertama** (`5/12/2026` untuk giliran yang bermula Isnin 7/12/2026). Kosongkan untuk hari ini.
3. Satu kotak menyenaraikan apa yang skrip **akan** buat pada hari itu: emel kepada siapa, jemputan kalendar berapa hari, dan masalah (jika ada).
4. Cuba juga tarikh **hari pertama giliran**. Kotak itu sepatutnya menyebut *"Emel kepada anda dengan pautan WhatsApp untuk ..."*.

### B. Hantar emel ujian kepada saya

1. Pilih **Last Man Out › Hantar emel ujian kepada saya**.
2. Anda menerima **dua emel bertanda [UJIAN]**:
   - emel yang sama seperti yang akan diterima pegawai giliran seterusnya;
   - contoh emel hari bertugas dengan butang WhatsApp. Anda boleh tekan butang itu untuk melihat mesej dalam WhatsApp, tetapi **jangan tekan Hantar** (mesej itu ditujukan kepada pegawai).
3. Satu acara **[UJIAN] Last Man Out (MQS): ...** dicipta dalam Google Calendar anda pada tarikh giliran seterusnya. Tiada jemputan dihantar kepada sesiapa.
   **Padam acara ujian itu** selepas menyemak: klik acara › ikon tong sampah › pilih **Semua acara** (All events).

Ujian ini tidak dikira sebagai "sudah dihantar". Pegawai sebenar tetap menerima notis pada masanya.

---

## 7. Tandakan tetapan dalam planner

Dalam planner: menu **⋯** › **Giliran Last Man Out** › **Tetapan giliran** › tandakan
**Emel & kalendar dihantar automatik oleh Google Apps Script**.

Selepas itu:

- planner tidak lagi meminta anda menghantar emel dan jemputan kalendar (skrip yang menghantar);
- planner masih mengingatkan anda tentang WhatsApp pada hari bertugas;
- planner memberi amaran apabila jadual berubah dan anda perlu eksport semula ke Google Sheet.

---

## 8. Bila giliran berubah

Setiap kali anda mengubah giliran dalam planner (tukar giliran, **Cuti umum / tiada tugas**, **Jana semula**, **Sambung satu pusingan**, atau mengemas kini emel / No. WhatsApp ahli):

1. Planner: **Eksport CSV untuk Google Sheet**.
2. Google Sheet: klik tab **Giliran**, kemudian **Fail › Import › Muat naik** dengan tetapan yang sama seperti Langkah 3 (**Gantikan helaian semasa**, buang tanda **Tukar teks...**), dan tekan **Import data**.

Apa yang skrip buat selepas itu:

- Pegawai yang sudah dimaklumkan **tidak** menerima emel kali kedua.
- Jika giliran ditukar **selepas** jemputan dihantar (hari D−2 atau D−1), jemputan kalendar pegawai lama **dibatalkan secara automatik**, dan pegawai baharu menerima emel serta jemputan pada larian pagi berikutnya. Untuk menghantar serta-merta, pilih **Jalankan sekarang**. Sila maklumkan juga pegawai lama secara peribadi; emel ringkasan akan mengingatkan anda.
- Jika giliran ditukar **selepas tugas bermula**, skrip tidak menghantar emel. Emel ringkasan meminta anda memaklumkan pegawai berkenaan sendiri.
- Minggu **Cuti umum / tiada tugas**: tiada notis. Jemputan yang sudah dihantar untuk minggu itu dibatalkan.
- Butang Selesai (Langkah 11): apabila pegawai bagi sesuatu giliran ditukar, planner memberi **kod baharu** kepada giliran itu. Pautan lama tidak sah lagi; pegawai baharu menerima pautan baharu dalam emel dan WhatsApp.

Lajur **Emel dihantar**, **Kalendar dihantar**, **ID acara** dan **Catatan skrip** diisi oleh skrip. Tidak mengapa jika lajur itu hilang selepas import semula; rekod "sudah dihantar" juga disimpan dalam skrip.

---

## 9. Henti automatik

Pilih **Last Man Out › Henti automatik**. Skrip tidak akan menghantar apa-apa lagi (termasuk peringatan dan amaran butang Selesai). Pautan Selesai masih boleh dibuka dan merekod pengesahan, tetapi tiada amaran dihantar.

- Rekod "sudah dihantar" disimpan. Jika anda **Pasang** semula kemudian, tiada sesiapa menerima notis berganda.
- Dalam planner, buang tanda tetapan di Langkah 7 supaya planner kembali mengingatkan anda menghantar emel dan jemputan kalendar sendiri.
- Untuk membuang sepenuhnya: padam Google Sheet itu.

---

## 10. Masalah lazim

| Masalah | Apa perlu dibuat |
|---|---|
| Pegawai kata tidak terima emel | Minta mereka semak folder **Spam** atau **Promosi** dan tekan **Bukan spam** (Not spam). Semak ejaan emel dalam lajur **Emel** dan lajur **Catatan skrip**. |
| Pegawai tidak nampak acara dalam kalendar | Minta mereka buka emel jemputan dan tekan **Ya** (Yes). Semak lajur **Kalendar dihantar**. |
| Emel ringkasan menyebut **kuota emel harian hampir habis** | Google mengehadkan bilangan emel sehari (akaun Google Workspace lebih kurang 1,500; Gmail peribadi 100). Skrip berhenti apabila baki kurang daripada 5 dan mencuba lagi esok, sebelum giliran bermula. Biasanya berlaku jika akaun yang sama menghantar emel beramai-ramai (mail merge). |
| Mesej **Akses disekat**, **This app is blocked**, atau "pentadbir anda telah menyekat..." | Unit IT KPTM mungkin menyekat Apps Script atau skrip yang belum disahkan. Hubungi Unit IT KPTM dan minta Google Apps Script dibenarkan untuk akaun anda (skrip sendiri dalam satu Sheet, yang menghantar emel, mencipta acara kalendar dan berjalan setiap pagi). Sementara itu, buang tanda tetapan di Langkah 7: planner akan memaparkan sepanduk dengan butang Emel / Kalendar / WhatsApp, satu tekan untuk setiap notis. |
| Menu **Last Man Out** tidak muncul | Muat semula Sheet (F5) dan tunggu 10 saat. Pastikan kod sudah disimpan (Langkah 4). Jika anda log masuk ke lebih daripada satu akaun Google dalam pelayar yang sama, log keluar akaun lain atau guna tetingkap Inkognito. |
| Emel **"skrip tidak dapat membaca Sheet"** | Tab **Giliran** telah dinamakan semula atau dipadam, atau baris tajuk hilang. Import semula CSV giliran ke tab **Giliran** (Langkah 3). |
| Tarikh kelihatan pelik, cth. `12/7/2026` untuk 7 Disember | Tetapkan Tempat (Locale) **Malaysia** (Langkah 2) dan import semula dengan **Tukar teks...** tidak bertanda. |
| Butang WhatsApp membuka nombor yang salah | Betulkan No. WhatsApp dalam planner (**Kenalan pasukan**; format `012-345 6789` diterima), eksport dan import semula. |
| Mahu tukar masa skrip berjalan | Dalam Apps Script, ubah `RUN_HOUR: 7` (contohnya kepada `6`), simpan, kemudian pilih **Pasang (sekali sahaja)** sekali lagi. |
| Mahu lihat apa yang skrip buat setiap hari | Dalam Apps Script, klik **Pelaksanaan** (Executions) di sebelah kiri. Lajur **Catatan skrip** dalam Sheet juga mencatat setiap tindakan. |

---

## 11. Butang Selesai (pengesahan selepas tugas)

Pilihan tambahan. Pegawai bertugas menekan **Selesai** selepas menyemak pejabat. Jika tiada pengesahan, Ketua Jabatan dimaklumkan secara automatik.

### 11.1 Apa yang berlaku

- Mesej WhatsApp, emel D−2 dan jemputan Google Calendar mengandungi **pautan peribadi** pegawai, contohnya:
  `https://script.google.com/macros/s/.../exec?t=lmo-2026-12-07&k=...`
- Selepas tugas, pegawai membuka pautan itu, menanda **lima perkara** senarai semak, dan menekan **Selesai / Done**. Butang boleh ditekan mulai 12:00 pada hari bertugas.
- **18:15**: jika belum disahkan, pegawai menerima emel peringatan dengan pautan yang sama.
- **18:30** (had pengesahan): jika masih belum, **Ketua Jabatan** menerima emel *"... belum mengesahkan tugas"*, dengan **salinan kepada anda**. Amaran sampai dalam masa lebih kurang 10 minit selepas had.
- Jika pegawai menekan Selesai selepas amaran, status direkod **Lewat** dan Ketua Jabatan menerima satu emel susulan (salinan kepada anda).
- Setiap pengesahan direkod dalam tab baharu **Pengesahan** (dicipta secara automatik): Tarikh, ID, Nama PIC, Masa disahkan, Status (**Tepat masa**, **Lewat**, **Tidak disahkan** atau **Tiada tugas**), Senarai semak, Peringatan PIC, Amaran KJ, Susulan KJ. Tab ini boleh dicetak sebagai **bukti audit MQS**.
- Hari **Tiada tugas** (contohnya cuti umum di tengah minggu, ditanda dalam planner) dan hari Sabtu/Ahad tidak disemak. Tiada amaran.
- Senarai semak kertas dan tandatangan masih boleh digunakan seperti biasa.
- Jika skrip gagal berjalan sepanjang petang (jarang berlaku), amaran dihantar keesokan paginya dengan tajuk berakhir *"(semalam)"*.
- Membuka pautan **tidak pernah** merekod apa-apa. Hanya butang Selesai merekod pengesahan, dan menekannya dua kali tidak mengubah apa-apa.

### 11.2 Kemas kini kod

1. Salin kod terkini **LastManOut.gs** dari GitHub (Langkah 4) dan tampal menggantikan kod lama dalam Apps Script. Simpan.
2. Dalam Google Sheet, pilih **Last Man Out › Pasang (sekali sahaja)** sekali lagi. Jika Google meminta kebenaran baharu, benarkan.

### 11.3 Deploy web app (sekali sahaja)

1. Dalam Apps Script, tekan butang biru **Deploy** di kanan atas › **New deployment** (dalam BM mungkin dipaparkan sebagai **Gunakan › Penggunaan baharu**).
2. Tekan ikon gear di sebelah **Select type** › pilih **Web app** (Apl web).
3. Isi:
   - Description: `Butang Selesai`
   - **Execute as** (Laksanakan sebagai): **Me** (akaun anda)
   - **Who has access** (Siapa yang mempunyai akses): **Anyone** (Sesiapa sahaja)
4. Tekan **Deploy**. Jika diminta, tekan **Authorize access** dan benarkan (seperti Langkah 5).
5. Salin **Web app URL**. URL itu bermula `https://script.google.com/` dan **berakhir dengan `/exec`**.

Kenapa **Anyone**: ramai pegawai membuka pautan WhatsApp dalam pelayar yang tidak log masuk ke akaun KPTM. Jika akses dihadkan, mereka melihat skrin log masuk, tidak dapat menekan Selesai, dan Ketua Jabatan menerima amaran palsu. Keselamatan dijaga oleh **kod rahsia** dalam setiap pautan: pautan tanpa kod yang betul hanya memaparkan *"Pautan ini tidak sah"*, tanpa nama sesiapa.

### 11.4 Simpan URL dalam Sheet

1. Dalam Google Sheet: **Last Man Out › Pautan Selesai (web app)**.
2. Tampal URL tadi dan tekan **OK**. Skrip menyimpan URL itu, menulis kod pengesahan bagi giliran yang belum ada kod, dan memaparkan URL itu semula.

### 11.5 Simpan URL dalam planner (hari yang sama)

1. Dalam planner: **⋯ › Giliran Last Man Out › Tetapan giliran**.
2. Tampal URL yang sama dalam **URL web app Selesai (pilihan)**. Semak **Had pengesahan Selesai** (lalai 18:30).
3. **Eksport CSV untuk Google Sheet** dan import semula ke tab **Giliran** (Langkah 3).

Buat Langkah 11.4 dan 11.5 pada hari yang sama, sebelum notis seterusnya dihantar, supaya pautan dalam mesej pegawai menggunakan kod yang sama seperti dalam Sheet.

Giliran yang sudah bermula sebelum URL disimpan tidak akan menimbulkan amaran (pegawai itu belum menerima pautan).

### 11.6 Emel Ketua Jabatan

- Skrip menggunakan emel kenalan planner yang **Jawatan**nya **Ketua Jabatan** (lajur **Emel KJ** dalam CSV). Pastikan kenalan itu ada emel, kemudian eksport dan import semula.
- Untuk pemangku Ketua Jabatan: **Last Man Out › Emel Ketua Jabatan**, tulis emel pemangku. Tulis **PADAM** untuk kembali kepada emel dalam Sheet.
- Jika tiada emel Ketua Jabatan, amaran dihantar **kepada anda sahaja**, dengan penjelasan di bahagian atas emel.

### 11.7 Uji dengan selamat

- **Uji tanpa hantar** kini menerima masa: tulis contohnya `8/12/2026 18:35`. Kotak itu menyenaraikan peringatan dan amaran yang **akan** dihantar pada masa itu. Tiada apa-apa dihantar.
- **Hantar emel ujian kepada saya**: emel ujian mengandungi pautan Selesai sebenar pegawai seterusnya. Anda boleh membukanya untuk melihat halaman (membuka pautan tidak merekod apa-apa), tetapi **jangan tekan Selesai** bagi pihak pegawai.

### 11.8 Bila kod dikemas kini kemudian

Jangan cipta **New deployment** baharu: URL baharu akan merosakkan semua pautan yang sudah dihantar. Sebaliknya:

**Deploy › Manage deployments** (Urus deployment) › ikon pensel (**Edit**) › **Version: New version** › **Deploy**. URL kekal sama.

### 11.9 Jika "Anyone" tidak ditawarkan

Pentadbir KPTM mungkin hanya membenarkan **Anyone within Kolej Poly-Tech MARA**. Pilih itu buat sementara, dan:

- pegawai mesti membuka pautan dalam pelayar yang log masuk dengan akaun `@kptm.edu.my` (dalam WhatsApp: tekan lama pautan › **Buka dalam Chrome** atau **Safari**);
- jangkakan beberapa amaran palsu kepada Ketua Jabatan sehingga Unit IT membenarkan **Anyone**. Minta Unit IT KPTM membenarkannya.

### 11.10 Masalah lazim (butang Selesai)

| Masalah | Apa perlu dibuat |
|---|---|
| Pegawai melihat *"Pautan ini tidak sah atau telah dibatalkan"* | Giliran diubah dalam planner (kod baharu) tetapi CSV belum diimport semula, atau pegawai membuka pautan lama selepas giliran ditukar. Eksport dan import semula, kemudian hantar pautan terkini. |
| Pegawai melihat skrin log masuk Google | Semak **Who has access** = **Anyone** (Langkah 11.3), atau lihat Langkah 11.9. |
| *"Butang Selesai boleh ditekan mulai 12:00"* | Pautan dibuka sebelum 12:00 pada hari bertugas. Cuba lagi selepas tugas. |
| *"Tiada tugas Last Man Out untuk ... hari ini"* | Bukan hari bertugas pegawai itu (atau hari itu ditanda **Tiada tugas**). |
| Ketua Jabatan menerima amaran walaupun pegawai sudah bertugas | Pegawai terlupa menekan Selesai. Status kekal dalam tab Pengesahan; jika pegawai menekan Selesai selepas itu, Ketua Jabatan menerima emel susulan. |
| Mahu hentikan amaran Selesai sahaja | Dalam Apps Script, ubah `CONFIRM: true` kepada `CONFIRM: false`, dan simpan. Notis giliran (emel, kalendar, WhatsApp) diteruskan. |
| Mahu tukar masa peringatan | `REMIND_BEFORE: 15` (minit sebelum had; `0` = tiada peringatan). Had pengesahan ditetapkan dalam planner. |

---

## Privasi data staf (PDPA)

- Google Sheet ini mengandungi nama, emel dan nombor telefon staf. **Jangan kongsi** dengan orang yang tidak berkenaan.
- **Jangan muat naik** fail CSV ahli atau CSV giliran ke GitHub atau tempat awam.
- Planner dan skrip ini tidak menghantar data ke mana-mana pelayan lain. Emel dan jemputan dihantar daripada akaun anda terus kepada pegawai bertugas sahaja.
- Adalah baik untuk memaklumkan staf bahawa emel kerja dan No. WhatsApp mereka digunakan untuk peringatan giliran Last Man Out.
- Halaman butang Selesai hanya memaparkan nama pegawai kepada orang yang memegang pautan peribadi dengan kod yang betul. Jangan kongsi pautan pegawai lain.
