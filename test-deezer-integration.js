require('dotenv').config();
const deezerService = require('../services/DeezerService');

async function testDeezerIntegration() {
  console.log('\n🎵 HITBACK - Deezer Integration Test\n');
  console.log('='.repeat(70));

  const tracks = [
    { id: '001', title: 'Despacito', artist: 'Luis Fonsi', hasLocal: true },
    { id: '002', title: 'Bohemian Rhapsody', artist: 'Queen', hasLocal: true },
    { id: '004', title: 'Uptown Funk', artist: 'Bruno Mars', hasLocal: false },
    { id: '005', title: 'Shape of You', artist: 'Ed Sheeran', hasLocal: false },
    { id: '006', title: 'Blinding Lights', artist: 'The Weeknd', hasLocal: false }
  ];

  let withPreview = 0;
  let withoutPreview = 0;

  for (const track of tracks) {
    console.log(`\n🎵 TRACK ${track.id}: "${track.title}" by ${track.artist}`);
    console.log('-'.repeat(70));

    // Local status
    console.log(`📁 Local Audio: ${track.hasLocal ? '✅ Available' : '❌ Not available'}`);

    // Deezer search
    try {
      const deezerResult = await deezerService.searchTrack(track.title, track.artist);

      if (deezerResult) {
        console.log(`🎵 Deezer: ✅ FOUND`);
        console.log(`   Title: ${deezerResult.title}`);
        console.log(`   Artist: ${deezerResult.artist}`);
        console.log(`   Album: ${deezerResult.album}`);
        console.log(`   Duration: ${deezerResult.duration}s (full track)`);
        console.log(`   Preview: ${deezerResult.previewUrl ? '✅ YES (30s)' : '❌ NO'}`);
        console.log(`   Cover: ${deezerResult.cover.large ? '✅' : '❌'}`);
        console.log(`   Deezer Link: ${deezerResult.link}`);

        if (deezerResult.previewUrl) {
          console.log(`   🔗 Preview URL: ${deezerResult.previewUrl.substring(0, 50)}...`);
          withPreview++;
        } else {
          withoutPreview++;
        }

        // Decision final
        console.log(`\n📊 FINAL DECISION:`);
        if (track.hasLocal) {
          console.log(`   ✅ Use LOCAL audio + Deezer metadata`);
        } else if (deezerResult.previewUrl) {
          console.log(`   ✅ Use DEEZER preview (no local available)`);
        } else {
          console.log(`   ⚠️  NO AUDIO (no local, no preview)`);
        }
      } else {
        console.log(`🎵 Deezer: ❌ NOT FOUND`);
        withoutPreview++;
      }
    } catch (error) {
      console.log(`🎵 Deezer: ❌ ERROR - ${error.message}`);
      withoutPreview++;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('📊 SUMMARY:');
  console.log(`   ✅ Tracks with Deezer preview: ${withPreview}/${tracks.length}`);
  console.log(`   ⚠️  Tracks without preview: ${withoutPreview}/${tracks.length}`);
  console.log('='.repeat(70));

  if (withPreview > 0) {
    console.log('\n🎉 SUCCESS! Deezer API is working!');
    console.log('💡 You can use Deezer as fallback for missing local files.\n');
  } else {
    console.log('\n⚠️  No previews found. Possible reasons:');
    console.log('   1. Regional restrictions (less common than Spotify)');
    console.log('   2. API temporary issue');
    console.log('   3. Tracks not in Deezer catalog\n');
  }
}

testDeezerIntegration();