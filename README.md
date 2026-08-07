# Assets folder

Drop your real files here — nothing in the app is hardcoded, it just looks
for these exact paths:

    /assets/icons/qris.png       <- your QRIS image (high-res, min ~600x600px so it still scans after PNG/PDF export)
    /assets/icons/logo.png       <- optional, for future use
    /assets/icons/favicon.png    <- optional, for future use
    /assets/fonts/JetBrainsMono-Regular.ttf
    /assets/fonts/JetBrainsMono-Bold.ttf

If qris.png is missing, the receipt just hides that section — export still
works fine, nothing breaks.

If the JetBrains Mono font files are missing, the browser silently falls
back to 'Courier New'/monospace (declared in the font-family stack), so the
receipt still renders correctly, just with a stock monospace font instead.

Download JetBrains Mono (free, open source) from:
https://www.jetbrains.com/lp/mono/
