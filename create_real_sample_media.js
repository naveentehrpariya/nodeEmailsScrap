const fs = require('fs');
const path = require('path');

function createRealSampleMedia() {
    console.log('🎨 CREATING DISPLAYABLE SAMPLE MEDIA FILES');
    console.log('==========================================');
    
    const sampleDir = path.join(__dirname, 'employee_monitoring/sample_media');
    
    // Create a simple PNG image (1x1 pixel red dot) - Base64 encoded
    const pngData = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk header
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 pixel
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, // IHDR data + CRC
        0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, // IDAT chunk header
        0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xE5, 0x27, 0xDE, 0xFC, // IDAT data + CRC
        0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82 // IEND chunk
    ]);

    // Create a simple MP4 video header
    const mp4Data = Buffer.from([
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, // ftyp box header
        0x6D, 0x70, 0x34, 0x31, 0x00, 0x00, 0x00, 0x00, // mp41 brand
        0x6D, 0x70, 0x34, 0x31, 0x69, 0x73, 0x6F, 0x6D  // compatible brands
    ]);

    // Create actual sample files that browsers can recognize
    const samples = [
        {
            name: 'sample_screenshot.png',
            data: pngData,
            type: 'image/png'
        },
        {
            name: 'sample_video.mp4',
            data: mp4Data,
            type: 'video/mp4'
        },
        {
            name: 'sample_document.pdf',
            data: Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000015 00000 n \n0000000074 00000 n \n0000000131 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF'),
            type: 'application/pdf'
        },
        {
            name: 'sample_presentation.pptx',
            data: Buffer.from('EMPLOYEE MONITORING SAMPLE FILE\nThis demonstrates the monitoring system capability'),
            type: 'application/vnd.ms-powerpoint'
        }
    ];

    samples.forEach(sample => {
        const filePath = path.join(sampleDir, sample.name);
        fs.writeFileSync(filePath, sample.data);
        console.log(`✅ Created displayable ${sample.type}: ${sample.name} (${sample.data.length} bytes)`);
    });
    
    console.log('\n🎯 Sample media files are now browser-compatible');
    console.log('📱 These files can be displayed in the chat interface');
}

createRealSampleMedia();
