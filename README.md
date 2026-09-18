# GitHub Activity Trace

Aplikasi pemantau dan perangkum riwayat komit GitHub pribadi dan organisasi untuk kebutuhan pelaporan kerja berkala.

## Fitur Utama

- **Filter Penulis Otomatis**: Hanya menampilkan repositori dan komit yang dibuat oleh akun pengguna terautentikasi (mengabaikan komit anggota tim lain di organisasi).
- **Filter Pemilik Repositori**: Filter cepat berdasarkan akun pribadi atau organisasi tempat berkontribusi.
- **Rentang Tanggal**: Memfilter aktivitas komit berdasarkan periode tanggal mulai dan selesai.
- **Paginasi Tabel**: Navigasi data 10 baris per halaman dengan antarmuka responsif setinggi viewport (`100vh`) dan header tabel tetap (*sticky*).
- **Terjemahan Bahasa Indonesia**: Toggle langsung di tabel untuk menerjemahkan pesan komit ke Bahasa Indonesia.
- **Salin Teks Praktis**: Tombol salin per baris saat *hover* dan tombol "Salin Semua" untuk seluruh halaman.
- **Ekspor Excel & Rangkuman AI**:
  - Mengelompokkan komit per tanggal dan repositori.
  - Merangkum daftar komit harian menjadi deskripsi tugas terpadu dalam Bahasa Indonesia menggunakan API kompatibel OpenAI.
  - Mengunduh file Excel (`.xls` SpreadsheetML) dengan format kolom: `Tanggal` (`DD-MM-YYYY`), `Repo`, `Task`.

## Kebutuhan Sistem

- Node.js 18.17+ / 20+
- Token GitHub Personal Access Token (PAT)
- (Opsional) Kredensial API OpenAI-compatible untuk fitur rangkuman AI

## Konfigurasi Lingkungan (`.env.local`)

Salin file template atau buat file `.env.local` di direktori utama:

```env
# GitHub Personal Access Token (Wajib)
# Scopes: repo, user:email, read:user
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx

# Port server (opsional, bawaan: 3001)
PORT=3001

# Konfigurasi OpenAI-compatible untuk rangkuman tugas (Opsional)
# Jika dikosongkan, tugas akan otomatis menggunakan daftar poin pesan komit
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
OPENAI_MODEL=gpt-4o-mini
```

## Menjalankan Proyek

1. **Instal dependensi**:
   ```bash
   npm install
   ```

2. **Jalankan mode pengembangan**:
   ```bash
   npm run dev
   ```
   Akses aplikasi di browser pada `http://localhost:3000` (atau sesuai `PORT` yang disetel).

3. **Build untuk produksi**:
   ```bash
   npm run build
   npm run start
   ```

4. **Menjalankan pengujian (Unit Tests)**:
   ```bash
   npm test
   ```

## Lisensi

MIT
