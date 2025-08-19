const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function createPlaceholderMedia() {
    const mediaDir = path.join(__dirname, 'media');
    
    console.log('Creating placeholder media files...');
    
    // Create placeholder image files for the corrupted ones
    const imageFiles = [
        '1755293335619_Image_20250816_004022_952.png',
        '1755293430545_Image_20250816_004022_952.png'
    ];
    
    const videoFiles = [
        '1755293339037_Video_20250816_004035_409.mp4',
        '1755293432522_Video_20250816_004035_409.mp4'
    ];
    
    const pdfFiles = [
        '1755293342163_macbookbill.pdf',
        '1755293434379_macbookbill.pdf'
    ];
    
    // Create placeholder images using sharp
    for (const fileName of imageFiles) {
        const filePath = path.join(mediaDir, fileName);
        console.log(`Creating placeholder image: ${fileName}`);
        
        await sharp({
            create: {
                width: 400,
                height: 300,
                channels: 4,
                background: { r: 220, g: 220, b: 220, alpha: 1 }
            }
        })
        .png()
        .composite([{
            input: Buffer.from(
                `<svg width="400" height="300">
                    <rect width="400" height="300" fill="#f0f0f0" stroke="#ccc" stroke-width="2"/>
                    <text x="200" y="140" text-anchor="middle" font-family="Arial" font-size="16" fill="#666">
                        📷 Sample Image
                    </text>
                    <text x="200" y="170" text-anchor="middle" font-family="Arial" font-size="12" fill="#999">
                        ${fileName.substring(0, 30)}...
                    </text>
                </svg>`
            )
        }])
        .toFile(filePath);
    }
    
    // Create placeholder video files (small MP4 files)
    for (const fileName of videoFiles) {
        const filePath = path.join(mediaDir, fileName);
        console.log(`Creating placeholder video: ${fileName}`);
        
        // Create a minimal valid MP4 file header
        const mp4Header = Buffer.from([
            0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, // ftyp box
            0x69, 0x73, 0x6F, 0x6D, 0x00, 0x00, 0x02, 0x00,
            0x69, 0x73, 0x6F, 0x6D, 0x69, 0x73, 0x6F, 0x32,
            0x61, 0x76, 0x63, 0x31, 0x6D, 0x70, 0x34, 0x31,
            0x00, 0x00, 0x00, 0x08, 0x66, 0x72, 0x65, 0x65 // free box
        ]);
        
        fs.writeFileSync(filePath, mp4Header);
    }
    
    // Create placeholder PDF files
    for (const fileName of pdfFiles) {
        const filePath = path.join(mediaDir, fileName);
        console.log(`Creating placeholder PDF: ${fileName}`);
        
        // Create a minimal valid PDF
        const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj

3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj

4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj

5 0 obj
<< /Length 100 >>
stream
BT
/F1 12 Tf
100 700 Td
(Sample PDF Document - ${fileName}) Tj
0 -20 Td
(This is a placeholder PDF file.) Tj
ET
endstream
endobj

xref
0 6
0000000000 65535 f 
0000000015 00000 n 
0000000068 00000 n 
0000000125 00000 n 
0000000270 00000 n 
0000000338 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
500
%%EOF`;
        
        fs.writeFileSync(filePath, pdfContent);
    }
    
    console.log('✅ Placeholder media files created successfully!');
    console.log('Files created:');
    console.log('  Images:', imageFiles.length);
    console.log('  Videos:', videoFiles.length);
    console.log('  PDFs:', pdfFiles.length);
}

createPlaceholderMedia().catch(console.error);
