# Panduan: Peringatan automatik Last Man Out

Untuk **Setiausaha Jabatan (SU) JPPP, KPTM Kuantan**.
Masa diperlukan: lebih kurang 20 minit, sekali sahaja. Anda tidak perlu tahu menulis kod.

Selepas dipasang, skrip ini menghantar notis Last Man Out (MQS) bagi pihak anda setiap pagi, daripada akaun Google KPTM anda sendiri.

> Nama menu Google mungkin berbeza sedikit mengikut bahasa akaun anda. Nama dalam bahasa Inggeris diberi dalam kurungan, cth. **Sambungan** (Extensions).

---

## 1. Apa yang berlaku

| Bila | Apa skrip buat | Siapa terima |
|---|---|---|
| **2 hari sebelum giliran**, sekitar 7 pagi (termasuk Sabtu dan Ahad). Contoh: giliran bermula Isnin, notis dihantar Sabtu. | Emel *"Giliran Last Man Out (MQS): ..."* dan **jemputan Google Calendar** (16:45–17:15 setiap hari bekerja dalam giliran itu) | Pegawai bertugas |
| **Hari pertama giliran**, sekitar 7 pagi | Emel ringkasan dengan butang **Buka WhatsApp untuk (nama pegawai)** | Anda (SU) |
| **7 hari sebelum giliran**, jika pegawai itu tiada emel dalam Sheet | Amaran, supaya anda sempat mengisi emelnya | Anda (SU) |
| Bila ada masalah (tiada emel, kuota, ralat) | Disenaraikan dalam emel ringkasan dan dalam lajur **Catatan skrip** dalam Sheet | Anda (SU) |

- Skrip berjalan sendiri setiap pagi antara 7 dan 8 pagi (waktu Malaysia). Komputer atau telefon anda tidak perlu dibuka.
- Emel dihantar daripada akaun anda, jadi pegawai boleh terus membalas kepada anda (contoh: jika mereka bercuti atau berkursus).
- Jika skrip terlepas satu pagi, ia menghantar keesokan harinya, asalkan giliran belum bermula.
- Notis yang sudah dihantar **tidak dihantar semula**, walaupun anda import jadual baharu.
- Jemputan kalendar dalam kalendar anda sendiri ada peringatan pop-up 30 minit sebelum 16:45.

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
   `ID, Mula, Tamat, Masa mula, Masa tamat, Nama, Emel, No WhatsApp, Jawatan, Program, Cuti, Emel dihantar, Kalendar dihantar, WhatsApp dihantar`
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
     - berjalan semasa anda tiada (jadual setiap pagi);
     - memaparkan menu dan kotak mesej dalam Sheet;
     - melihat alamat emel anda (supaya emel ringkasan sampai kepada anda).
3. Jika klik pertama hanya memaparkan skrin kebenaran, pilih **Pasang (sekali sahaja)** sekali lagi.
4. Mesej **Automatik dipasang** muncul, bersama bilangan giliran yang dijumpai dalam tab Giliran.

Menekan **Pasang** dua kali tidak mendatangkan masalah: hanya satu jadual harian disimpan.

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

Lajur **Emel dihantar**, **Kalendar dihantar**, **ID acara** dan **Catatan skrip** diisi oleh skrip. Tidak mengapa jika lajur itu hilang selepas import semula; rekod "sudah dihantar" juga disimpan dalam skrip.

---

## 9. Henti automatik

Pilih **Last Man Out › Henti automatik**. Skrip tidak akan menghantar apa-apa lagi.

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

## Privasi data staf (PDPA)

- Google Sheet ini mengandungi nama, emel dan nombor telefon staf. **Jangan kongsi** dengan orang yang tidak berkenaan.
- **Jangan muat naik** fail CSV ahli atau CSV giliran ke GitHub atau tempat awam.
- Planner dan skrip ini tidak menghantar data ke mana-mana pelayan lain. Emel dan jemputan dihantar daripada akaun anda terus kepada pegawai bertugas sahaja.
- Adalah baik untuk memaklumkan staf bahawa emel kerja dan No. WhatsApp mereka digunakan untuk peringatan giliran Last Man Out.
