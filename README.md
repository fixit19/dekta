# DEKTA

DEKTA adalah workspace untuk mencatat pelanggan, mengelola peluang, dan menjadwalkan follow-up. Aplikasi menyimpan pelanggan, peluang, penanggung jawab, dan tenggat di PostgreSQL.

## Coba di komputer sendiri

Pasang Node.js 24 dan jalankan:

```sh
npm ci
npm run dev:full
```

Buka `http://localhost:4173`. Gunakan email contoh saat masuk dan salin kode lokal yang ditampilkan DEKTA. Buat workspace kosong, tambah pelanggan, lalu buat peluang dengan jadwal follow-up. Mode lokal memakai PGlite dan berjalan di loopback.

## Deploy di Hostinger VPS

Tombol partner di bawah disiapkan untuk repo publik dan rilis `v0.1.0`. Kode referral diisi dari hPanel setelah Hostinger menerima proyek.

```markdown
[![Deploy on Hostinger](https://assets.hostinger.com/vps/deploy.svg)](https://www.hostinger.com/deploy?template=fixit19/dekta&ref=YOUR_PARTNER_CODE)
```

1. Siapkan database PostgreSQL khusus dengan TLS dan domain pengirim yang terverifikasi di Resend.
2. Dari checkout rilis, jalankan `npm ci`, lalu muat `DATABASE_URL` dengan koneksi admin langsung ke database baru dan atur `DEKTA_DATABASE_SSL=require`. Jalankan `npm run migrate`. Muat password acak 24 karakter atau lebih sebagai `DEKTA_APP_DATABASE_PASSWORD`, lalu jalankan `npm run provision:runtime-role`. Simpan kredensial admin hanya di lingkungan operator.
3. Di Docker Manager, gunakan Compose dari URL `https://raw.githubusercontent.com/fixit19/dekta/v0.1.0/compose.yaml`. Isi variabel di [.env.example](.env.example) lewat pengaturan deployment. Gunakan koneksi role `dekta_app` untuk `DATABASE_URL`, kunci Resend untuk `RESEND_API_KEY`, alamat pengirim terverifikasi untuk `DEKTA_EMAIL_FROM`, dan origin HTTPS aplikasi untuk `DEKTA_PUBLIC_BASE_URL`.
4. Selesaikan deploy dan arahkan reverse proxy HTTPS di VPS ke `127.0.0.1:4180`. Cek `/readyz` lalu masuk dengan email uji. Buat pelanggan, peluang, dan follow-up, lalu muat ulang pipeline untuk memastikan data tersimpan.

Setup database, pengirim email, dan domain HTTPS dilakukan per instalasi. Gunakan kredensial milik instalasi tersebut.

## Lisensi

Kode DEKTA tersedia di bawah [Lisensi MIT](LICENSE). Nama dan logo DEKTA serta Fixit tidak memberikan hak penggunaan merek. Dependensi mengikuti lisensi masing-masing.
