const axios = require("axios");
const fs = require("fs");

const fileupload = async (file) => {
  try {
    const filePath = file.path;
    const fileStream = fs.createReadStream(filePath);
    const originalFilename = file.originalname.replace(/\s/g, '');
    const uniqueFilename = `${Date.now()}-${file.filename}-${originalFilename}`;
    const yourStorageZone = process.env.BUNNY_STORAGE_ZONE;
    const apiKey = process.env.BUNNY_API_KEY;
    const url = `https://storage.bunnycdn.com/${yourStorageZone}/${uniqueFilename}`;
    const headers = {
      AccessKey: apiKey, 
      "Content-Type": file.mimetype,
    };

    console.log("url-----", url); // Log response data for more info
    const response = await axios.put(url, fileStream, { headers });

    console.log("response-----", response); // Log response data for more info
    if (response.status === 201 || response.status === 200) {
      console.log("File uploaded successfully", response.data); // Log response data for more info
      return {
        message: "File uploaded successfully",
        mime: file.mimetype,
        filename: uniqueFilename,
        url: `https://capitallogisticmanagement.b-cdn.net/${uniqueFilename}`,
        file: file,
        size: file.size,
      };
    } else {
      console.error(`Upload failed with status: ${response.status}`, response.data); // Log response data for errors
      return false;
    }
  } catch (error) {
    console.error(`Upload error: ${error}`);
    return false;
  } finally {
    // Clean up the temporary file after attempting upload
    if (file && file.path) {
      fs.unlink(file.path, (err) => {
        if (err) {
          console.error("Error deleting temporary file:", err);
        } else {
          console.log("Temporary file deleted:", file.path);
        }
      });
    }
  }
};

module.exports = fileupload;