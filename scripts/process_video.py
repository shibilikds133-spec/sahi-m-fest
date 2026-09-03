import cv2
import numpy as np
import subprocess
import imageio_ffmpeg
import os
import sys

def process_video():
    input_path = "D:/worck/font/Logo_animation_transparent (1).webm"
    output_path = "d:/work/fest/web-for-sahi--main/web-for-sahi--main/public/videos/logo_bg.webm"

    if not os.path.exists(input_path):
        print(f"Error: Input file {input_path} not found.")
        sys.exit(1)

    cap = cv2.VideoCapture(input_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    print(f"Processing {total_frames} frames with aggressive Alpha Choke & RGB Dilation...")

    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()

    cmd = [
        ffmpeg_exe, '-y',
        '-f', 'rawvideo',
        '-vcodec', 'rawvideo',
        '-s', f'{width}x{height}',
        '-pix_fmt', 'rgba',
        '-r', str(fps),
        '-i', '-',
        '-c:v', 'libvpx-vp9',
        '-pix_fmt', 'yuva420p',
        '-b:v', '3500k',
        '-crf', '16',
        '-auto-alt-ref', '0',
        output_path
    ]

    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

    # 5x5 kernel for alpha choke (removes 2px white halo)
    kernel_erode = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    # 11x11 kernel for RGB color dilation (bleeds logo blue 5px out)
    kernel_dilate = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))

    frame_idx = 0
    while True:
        ret, bgr = cap.read()
        if not ret:
            break

        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0

        r = rgb[:, :, 0]
        g = rgb[:, :, 1]
        b = rgb[:, :, 2]

        min_channel = np.minimum(np.minimum(r, g), b)
        dist_from_white = 1.0 - min_channel
        dist_red = 1.0 - r

        bg_metric = np.maximum(dist_from_white, dist_red)

        # Alpha thresholding
        bg_min = 0.12
        bg_max = 0.28
        alpha_raw = np.clip((bg_metric - bg_min) / (bg_max - bg_min), 0.0, 1.0)

        # Apply 2px morphological erosion choke to pull alpha boundary inside the blue region
        alpha_eroded = cv2.erode(alpha_raw, kernel_erode, iterations=1)
        alpha_final = np.where(alpha_raw < 0.20, 0.0, alpha_eroded)

        # Un-premultiply
        alpha_raw_3d = np.maximum(alpha_raw[:, :, np.newaxis], 1e-4)
        fg_unpremult = np.clip((rgb - (1.0 - alpha_raw_3d)) / alpha_raw_3d, 0.0, 1.0)

        fg_u8 = (fg_unpremult * 255.0).astype(np.uint8)
        mask_solid = (alpha_final > 0.01).astype(np.uint8)

        # RGB Color Bleed Padding
        fg_padded = np.zeros_like(fg_u8)
        for c in range(3):
            ch = fg_u8[:, :, c]
            ch_masked = cv2.bitwise_and(ch, ch, mask=mask_solid)
            dilated = cv2.dilate(ch_masked, kernel_dilate, iterations=2)
            fg_padded[:, :, c] = np.where(mask_solid > 0, ch, dilated)

        rgba = np.zeros((height, width, 4), dtype=np.uint8)
        rgba[:, :, 0:3] = fg_padded
        rgba[:, :, 3] = (alpha_final * 255.0).astype(np.uint8)

        proc.stdin.write(rgba.tobytes())

        frame_idx += 1

    cap.release()
    proc.stdin.close()
    proc.wait()

    print(f"Aggressive alpha choke processing completed for {output_path}!")

if __name__ == "__main__":
    process_video()
