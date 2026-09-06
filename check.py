import imageio_ffmpeg
import subprocess

ffprobe_path = imageio_ffmpeg.get_ffmpeg_exe().replace('ffmpeg', 'ffprobe')
cmd = [imageio_ffmpeg.get_ffmpeg_exe(), '-i', r'C:\Users\Admin\Downloads\wordmark1.mp4']
subprocess.run(cmd)
