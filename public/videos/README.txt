Background video loops (all sourced from Pexels, free commercial license,
compressed with ffmpeg to ~10s H.264 loops, no audio, faststart):

- hero.mp4  (1.3MB)  landing hero: dark animated data dashboard
- cta.mp4   (0.8MB)  landing CTA section: teal animated charts
- login.mp4 (0.5MB)  login brand panel: doctor using a tablet (portrait)
- clinic-reserve.mp4 (0.5MB) clinic reception, held in reserve (unused)
- *.jpg posters shown instantly while a video streams

To swap any slot: replace the file, keep the name. The HeroMotion component
falls back to its canvas animation if a video is missing or fails, and shows
the poster instead of autoplaying for users who prefer reduced motion.
