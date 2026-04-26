#!/usr/bin/env python3
"""
TikTok Video Downloader
Downloads all videos from a TikTok profile and zips them.

Usage:
    python download_tiktok.py

Requirements:
    pip install yt-dlp
"""

import argparse
import os
import sys
import zipfile
import subprocess
from pathlib import Path

def parse_args():
    parser = argparse.ArgumentParser(description="Download a TikTok profile and zip the results.")
    parser.add_argument("--username", default="ironvalley1_elise", help="TikTok username without @")
    parser.add_argument("--output-dir", default="tiktok_videos", help="Directory for downloaded videos")
    parser.add_argument("--zip-name", default="ironvalley1_elise.zip", help="Path to output zip file")
    return parser.parse_args()


def check_yt_dlp():
    """Make sure yt-dlp is installed."""
    try:
        subprocess.run(["yt-dlp", "--version"], check=True, capture_output=True)
    except (FileNotFoundError, subprocess.CalledProcessError):
        print("yt-dlp not found. Installing...")
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "yt-dlp"], check=True)
        print("yt-dlp installed successfully.\n")


def download_videos(url: str, output_dir: str):
    """Download all videos from a TikTok profile using yt-dlp."""
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    output_template = os.path.join(output_dir, "%(upload_date)s_%(title).60s_%(id)s.%(ext)s")

    cmd = [
        "yt-dlp",
        "--no-warnings",
        "--progress",
        "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "--merge-output-format", "mp4",
        "--embed-metadata",
        "--retries", "5",
        "--fragment-retries", "5",
        "-o", output_template,
        url,
    ]

    print(f"Downloading videos from: {url}")
    print(f"Saving to folder      : {output_dir}/\\n")

    result = subprocess.run(cmd)

    if result.returncode != 0:
        print("\\n[WARNING] yt-dlp exited with a non-zero code. Some videos may have failed to download.")
    else:
        print("\\nAll videos downloaded successfully.")


def zip_videos(output_dir: str, zip_name: str):
    """Zip all downloaded video files."""
    video_files = sorted(Path(output_dir).glob("*.mp4"))

    if not video_files:
        print("No video files found to zip.")
        return

    print(f"\\nZipping {len(video_files)} video(s) -> {zip_name} ...")

    with zipfile.ZipFile(zip_name, "w", zipfile.ZIP_DEFLATED, compresslevel=1) as zf:
        for video in video_files:
            zf.write(video, arcname=video.name)
            print(f"  + {video.name}")

    zip_size_mb = Path(zip_name).stat().st_size / (1024 * 1024)
    print(f"\\nDone! Zip created: {zip_name} ({zip_size_mb:.1f} MB)")


def main():
    args = parse_args()
    username = args.username.replace("@", "").strip()
    tiktok_url = f"https://www.tiktok.com/@{username}"

    check_yt_dlp()
    download_videos(tiktok_url, args.output_dir)
    zip_videos(args.output_dir, args.zip_name)


if __name__ == "__main__":
    main()
