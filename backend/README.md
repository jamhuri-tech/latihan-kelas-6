# Kamera ujian dan foto privat

Drive/OAuth telah disetujui pemilik dan setupCameraStorage selesai. Deployment versi 4 aktif pada 21 November 2026 dengan batas 180 foto per sesi untuk interval satu menit. Endpoint capabilities telah diperiksa: ok=true, camera=true, version=3. Folder penyimpanan telah diperiksa dengan metadata Drive: shared=false. Sesi TKA memerlukan kamera dan penyimpanan yang berfungsi.

## Aktivasi pemilik

1. Buka proyek Apps Script yang terikat pada Sheet rekap. Simpan `apps_script_rekap_nilai.gs` sebagai Code.gs (sudah disiapkan di editor).
2. Setelah izin pemilik diberikan, jalankan `setupCameraStorage`. Google meminta akses Drive karena layanan membuat folder dan menyimpan JPEG. Folder `Foto Ujian TKA - Privat` tetap privat; jangan pilih berbagi publik.
3. Perbarui deployment web app yang sudah ada melalui Manage deployments → Edit → New version. Pertahankan URL /exec yang sudah dipakai situs dan pengaturan eksekusi pemilik yang sesuai.
4. Periksa GET `?action=capabilities`: harus menghasilkan `{ok:true,camera:true,version:3}`. Barulah frontend dapat diterbitkan.

## Perilaku

- Berlaku untuk sesi TKA yang belum selesai; sesi non-TKA dan tinjauan hasil lama tidak meminta kamera.
- Peserta dan orang tua menyetujui pemberitahuan di halaman, kemudian browser meminta video saja, tanpa mikrofon.
- Soal dan jawaban tidak tersedia selama kamera belum aktif atau alirannya terputus. Jawaban lama tetap tersimpan.
- Foto JPEG maksimal lebar 480 piksel, diambil setelah 1 menit dan setiap 1 menit selanjutnya ketika kamera aktif. Batas 180 foto per sesi. Tidak ada foto awal atau rekaman video.
- Foto diasosiasikan dengan ID sesi, bukan nama saja. Nomor foto dan nama file deterministik mencegah duplikasi saat kirim ulang.
- POST no-cors diikuti pemeriksaan tanda terima; respons jaringan saja tidak dianggap sebagai bukti tersimpan. Unggahan gagal dicoba kembali selama halaman ujian masih aktif. Menutup halaman dapat menghilangkan unggahan yang belum selesai; foto tidak disimpan ke localStorage.
- Jawaban dikirim atau peserta berganti: kamera dan timer pengambilan foto dimatikan. Unggahan yang sudah berjalan dapat menyelesaikan prosesnya.
- Delapan kolom nilai lama dipertahankan, kolom kesembilan menyimpan ID sesi. Sheet `Foto Ujian` menyimpan metadata tautan Drive; file gambar tetap privat. Sheet rekap yang sudah publik tidak diubah pengaturan berbaginya.
- Tombol Lihat foto pada rekap membuka tautan Drive privat yang hanya tersedia bagi akun pemilik penyimpanan. Fitur ini belum menyediakan akun orang tua terpisah untuk setiap keluarga. Jangan membagikan akses seluruh folder kepada peserta lain.
- Pemilik bisa menghapus foto melalui Google Drive; tautan rekap lalu tidak bisa dibuka. Belum ada penghapusan otomatis.
- Kamera dan jumlah perpindahan tab bukan bukti pasti penggunaan AI.

## Verifikasi tanpa mengirim data uji ke produksi

`node tests/quiz-camera.test.cjs`: izin, penolakan, aliran terputus, interval, tanda terima, identitas sesi, penghentian dan izin yang terlambat.

`node tests/camera-backend.test.cjs` (dari direktori induk proyek): validasi JPEG/ukuran/nomor, deduplikasi, pemisahan sesi, JSONP, dan kolom nilai lama. Pengujian menggunakan tiruan Drive/Sheet dan tidak memotret pengguna.
