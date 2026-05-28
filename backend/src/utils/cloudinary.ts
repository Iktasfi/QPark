import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function uploadPhotoToCloudinary(base64Image: string, folder = 'qpark'): Promise<string> {
  const result = await cloudinary.uploader.upload(base64Image, {
    folder,
    resource_type: 'image',
    transformation: [{ width: 800, crop: 'limit', quality: 'auto' }],
  });
  return result.secure_url;
}
