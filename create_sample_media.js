const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

async function createSampleMediaFiles() {
    const mediaDir = path.join(__dirname, 'media');
    const thumbnailDir = path.join(__dirname, 'media/thumbnails');
    
    // Ensure directories exist
    await fs.mkdir(mediaDir, { recursive: true });
    await fs.mkdir(thumbnailDir, { recursive: true });
    
    console.log('Creating sample media files...');
    
    // Create a sample image using Sharp
    const imagePath = path.join(mediaDir, 'sample_image.jpg');
    await sharp({
        create: {
            width: 800,
            height: 600,
            channels: 3,
            background: { r: 100, g: 150, b: 200 }
        }
    })
    .png()
    .composite([
        {
            input: Buffer.from(
                `<svg width="800" height="600">
                    <rect width="800" height="600" fill="rgb(100,150,200)"/>
                    <text x="400" y="300" font-family="Arial" font-size="48" fill="white" text-anchor="middle">
                        Sample Image
                    </text>
                    <text x="400" y="360" font-family="Arial" font-size="24" fill="white" text-anchor="middle">
                        800 x 600 pixels
                    </text>
                </svg>`
            ),
            top: 0,
            left: 0,
        }
    ])
    .jpeg({ quality: 80 })
    .toFile(imagePath);
    
    // Create thumbnail for the image
    const imageThumbnailPath = path.join(thumbnailDir, 'thumb_sample_image.jpg');
    await sharp(imagePath)
        .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(imageThumbnailPath);
    
    // Create a sample document (simple text file)
    const documentPath = path.join(mediaDir, 'sample_document.txt');
    await fs.writeFile(documentPath, `Sample Document Content

This is a sample text document for testing the media preview functionality.

The document contains multiple lines of text to demonstrate how documents are handled in the chat interface.

Created: ${new Date().toISOString()}
`);

    // Create a sample PDF-like content (we'll simulate it as a text file with PDF extension)
    const pdfPath = path.join(mediaDir, 'sample_document.pdf');
    await fs.writeFile(pdfPath, 'This is a sample PDF file content for testing purposes.');
    
    console.log('Sample media files created:');
    console.log('- Image:', imagePath);
    console.log('- Image thumbnail:', imageThumbnailPath);
    console.log('- Text document:', documentPath);
    console.log('- PDF document:', pdfPath);
    
    // Return file info for database update
    return [
        {
            filename: 'sample_image.jpg',
            localPath: imagePath,
            mimeType: 'image/jpeg',
            mediaType: 'image',
            isImage: true,
            thumbnailPath: imageThumbnailPath,
            fileSize: (await fs.stat(imagePath)).size
        },
        {
            filename: 'sample_document.txt',
            localPath: documentPath,
            mimeType: 'text/plain',
            mediaType: 'document',
            isDocument: true,
            fileSize: (await fs.stat(documentPath)).size
        },
        {
            filename: 'sample_document.pdf',
            localPath: pdfPath,
            mimeType: 'application/pdf',
            mediaType: 'document',
            isDocument: true,
            fileSize: (await fs.stat(pdfPath)).size
        }
    ];
}

// Run if called directly
if (require.main === module) {
    createSampleMediaFiles()
        .then((files) => {
            console.log('\n✅ Sample media files created successfully!');
            console.log('Files created:', files.length);
        })
        .catch((error) => {
            console.error('❌ Error creating sample media files:', error);
            process.exit(1);
        });
}

module.exports = createSampleMediaFiles;
