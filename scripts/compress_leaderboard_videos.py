import os
import subprocess
import imageio_ffmpeg

def compress_videos():
    videos = [
        (r'C:\Users\Admin\Downloads\wordmark1.mp4', r'd:\work\fest\web-for-sahi--main\web-for-sahi--main\public\videos\leaderboard_1.mp4')
    ]

    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()

    for src, dst in videos:
        if not os.path.exists(src):
            print(f"Source file missing: {src}")
            continue

        print(f"Compressing {src} -> {dst}...")
        cmd = [
            ffmpeg_exe, '-y',
            '-i', src,
            '-c:v', 'libx264',
            '-crf', '24',
            '-preset', 'fast',
            '-an', # Remove audio track for background video
            '-movflags', '+faststart',
            dst
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if res.returncode == 0:
            sz_mb = os.path.getsize(dst) / (1024 * 1024)
            print(f"Successfully compressed {dst} ({sz_mb:.2f} MB)")
        else:
            print(f"Error compressing {src}: {res.stderr.decode('utf-8', errors='ignore')}")

if __name__ == '__main__':
    compress_videos()
