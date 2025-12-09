## 🎵 Hybrid Audio Architecture

HITBACK uses a sophisticated dual-source audio system:

### Audio Priority System:
1. **Local Audio Files** (Primary Source)
   - Full-length tracks stored locally
   - Guaranteed availability and performance
   - No API dependencies or rate limits
   - Used for 14 core tracks

2. **Deezer API Integration** (Fallback Source)
   - Automatic fallback when local files unavailable
   - 30-second preview clips via Deezer API
   - No authentication required
   - Includes rich metadata (album art, artist info)

### Technical Implementation:
```javascript