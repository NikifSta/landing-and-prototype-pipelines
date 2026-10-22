"""Constants of one landing scroll clip render with Seedance 2.5 in the Dreamina web interface.

Measured values come from the video-generation project, where this route was built and priced
(character_video_generation_settings.py there, measurements of 2026-08-14 and 2026-08-30), except
the price of each resolution tier, measured in this project on 2026-09-28.
"""

DREAMINA_SEEDANCE_2_5_MODEL_LABEL = "Dreamina Seedance 2.5"
# Mode in which the clip starts exactly on the uploaded frame; label as the page shows it.
DREAMINA_START_FRAME_MODE_LABEL = "First and last frames"
# Frame shapes a landing needs: wide for the desktop, tall for the phone.
WIDE_ASPECT_RATIO_LABEL = "16:9"
TALL_ASPECT_RATIO_LABEL = "9:16"
SUPPORTED_ASPECT_RATIO_LABELS = (WIDE_ASPECT_RATIO_LABEL, TALL_ASPECT_RATIO_LABEL)
# Asking for this value makes the driver pick the highest tier the page offers (Ivan, 2026-09-28).
HIGHEST_OFFERED_RESOLUTION = "highest"
# The interface accepts whole seconds inside these bounds.
SEEDANCE_2_5_DURATION_MIN_SECONDS = 4
SEEDANCE_2_5_DURATION_MAX_SECONDS = 30
DREAMINA_RENDER_POLL_INTERVAL_SECONDS = 15
# A 5-second clip took about 3 minutes; this bound only catches a queue that never returns.
DREAMINA_RENDER_TIMEOUT_SECONDS = 40 * 60
# Full price per second of clip with only pictures on the input, by resolution tier. Measured free on
# 2026-09-28 in the composer (Seedance 2.5, First and last frames, 5 s, no frame uploaded, nothing
# submitted): 480P showed 85, 720P showed 185 struck through beside a discounted 80, 1080P showed 455.
# The struck-through number is the full price; 480P and 1080P showed no discount. Per-second rates
# assume the price grows with length in step, as the 720P runs of video-generation showed (5 s cost
# 185, 8 s cost 296). The credit check prices the tier the run renders; a tier missing from the table
# stops the run before anything is charged.
DREAMINA_CREDITS_PER_SECOND_AT_480P_WITHOUT_VIDEO_INPUT = 17
DREAMINA_CREDITS_PER_SECOND_AT_720P_WITHOUT_VIDEO_INPUT = 37
DREAMINA_CREDITS_PER_SECOND_AT_1080P_WITHOUT_VIDEO_INPUT = 91
DREAMINA_FULL_CREDITS_PER_SECOND_WITHOUT_VIDEO_INPUT_BY_RESOLUTION = {
    "480P": DREAMINA_CREDITS_PER_SECOND_AT_480P_WITHOUT_VIDEO_INPUT,
    "720P": DREAMINA_CREDITS_PER_SECOND_AT_720P_WITHOUT_VIDEO_INPUT,
    "1080P": DREAMINA_CREDITS_PER_SECOND_AT_1080P_WITHOUT_VIDEO_INPUT,
}
# A video on the input doubles the rate (measured at 720P in video-generation); landing clips never
# take one, the copied preflight still asks.
DREAMINA_VIDEO_INPUT_CREDIT_MULTIPLIER = 2
