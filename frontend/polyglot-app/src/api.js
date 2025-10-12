import { API_CONFIG } from './config';

// Generate unique filename
const generateFileName = () => {
  return `recordings/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.webm`;
};

// Upload audio blob to S3
// Upload audio blob to S3
export const uploadAudioToS3 = async (audioBlob, mimeType = 'audio/webm') => {
  try {
    console.log('Uploading audio to S3...');
    console.log('MIME type:', mimeType);
    
    // Determine file extension based on MIME type
    let extension = 'webm';
    if (mimeType.includes('mp4')) extension = 'mp4';
    else if (mimeType.includes('ogg')) extension = 'ogg';
    else if (mimeType.includes('wav')) extension = 'wav';
    
    const fileName = `recordings/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${extension}`;
    
    // Get pre-signed URL from Lambda
    const presignResponse = await fetch(`${API_CONFIG.API_URL}/upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        bucket: API_CONFIG.BUCKET,
        key: fileName,
        contentType: mimeType
      })
    });
    
    const { uploadUrl } = await presignResponse.json();
    
    // Upload directly to S3 using pre-signed URL
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      body: audioBlob,
      headers: {
        'Content-Type': mimeType
      }
    });
    
    // Check if upload was successful
    if (!uploadResponse.ok) {
      throw new Error(`S3 upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
    }
    
    console.log('Upload successful:', fileName);
    return fileName;
    
  } catch (error) {
    console.error('Upload error:', error);
    throw error;
  }
};

export const translateAudio = async (bucket, key, userLanguage = 'en') => {
  try {
    console.log('Calling API...');
    
    const response = await fetch(`${API_CONFIG.API_URL}/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        bucket: bucket,
        key: key,
        userLanguage: userLanguage  // Pass user's language
      })
    });
    
    const data = await response.json();
    console.log('API Response:', data);
    
    return data;
    
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
};

// Save message to room
// Save message to room
export const saveMessage = async (roomId, message) => {
  try {
    console.log('Sending save request to API...');
    const response = await fetch(`${API_CONFIG.API_URL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'save',  // ✅ ADD THIS
        roomId: roomId,
        speaker: message.speaker,
        speakerLanguage: message.speakerLanguage,
        original: message.original,
        translations: message.translations,
        audioUrls: message.audioUrls
      })
    });
    const result = await response.json();
    console.log('Save response:', result);
  } catch (error) {
    console.error('Error saving message:', error);
  }
};

// Get messages for a room
export const getRoomMessages = async (roomId) => {
  try {
    const response = await fetch(`${API_CONFIG.API_URL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'get',  // ✅ ADD THIS for clarity
        roomId: roomId
      })
    });
    
    const data = await response.json();
    return data.messages || [];
  } catch (error) {
    console.error('Error getting messages:', error);
    return [];
  }
};