# 香港交通控制中心 ULTIMATE9

ULTIMATE9 is a full layout redesign, not a patch to the previous page.

Design goals:
- Mobile-first iPhone portrait layout.
- No large railway map / no railway overview section.
- Clear hierarchy: live arrivals -> traffic now -> latest alerts -> voice controls.
- Compact header and clock that cannot overflow.
- Tuen Ma Line and Light Rail remain real-time modules.
- Uses the existing Cloudflare proxy configuration.
- No KMB ETA module.

Upload to GitHub:
index.html
style.css
app.js
manifest.json
README.md

Do not change the old `mtr-eta-proxy` Worker.
