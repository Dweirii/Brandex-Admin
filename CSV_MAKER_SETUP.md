# CSV Maker with AI Vision - Setup Guide

## 🎉 Feature Overview

The CSV Maker uses OpenAI Vision API to automatically generate product data from images. Simply provide image URLs, select a category, set a price, and the AI will generate product names, descriptions, and keywords.

## ✨ Features

- **AI-Powered Product Generation**: Uses OpenAI GPT-4 Vision to analyze images
- **Bulk Processing**: Process multiple images at once
- **Direct Import**: Import products directly to database without CSV download
- **CSV Export**: Download generated products as CSV for manual review
- **Smart Defaults**: Automatically sets downloadUrl same as imageUrl
- **Error Handling**: Continues processing even if some images fail

## 🚀 Setup Instructions

### 1. Add OpenAI API Key

Add your OpenAI API key to your `.env` file:

```env
OPENAI_API_KEY=sk-your-openai-api-key-here
```

**Important**: 
- Get your API key from https://platform.openai.com/api-keys
- Make sure you have credits/billing set up in your OpenAI account
- The feature uses GPT-4o model (vision-capable)

### 2. Access the Feature

1. Navigate to your store dashboard
2. Click on **"Bulk Import"** in the sidebar
3. You'll see two tabs:
   - **Bulk Import**: Traditional CSV import
   - **CSV Maker (AI)**: New AI-powered CSV generator

## 📖 How to Use

### Step 1: Add Image URLs
- Enter image URLs one by one (must start with `http://` or `https://`)
- Click "Add" or press Enter to add each URL
- You can add multiple images at once
- Remove images by clicking the X button

### Step 2: Select Category
- Choose a category from the dropdown
- All generated products will use this category

### Step 3: Set Price
- Enter the price (will be applied to all products)
- Use decimal format: `29.99`

### Step 4: Generate Products
- Click "Generate Products from Images"
- The AI will analyze each image and generate:
  - Product name (under 100 characters)
  - Product description (under 1000 characters)
  - Keywords (comma-separated)

### Step 5: Review & Import
- Review the generated products in the table
- **Download CSV**: Export as CSV file for manual review/editing
- **Import Directly**: Import products directly to your database (no CSV needed!)

## 🔧 Technical Details

### API Endpoint
- **Route**: `/api/[storeId]/products/generate-from-images`
- **Method**: POST
- **Model**: GPT-4o (OpenAI Vision)

### Request Format
```json
{
  "imageUrls": ["https://example.com/image1.jpg", "https://example.com/image2.jpg"],
  "categoryId": "550e8400-e29b-41d4-a716-446655440000",
  "price": 29.99
}
```

### Response Format
```json
{
  "success": true,
  "products": [
    {
      "name": "Product Name",
      "description": "Product description...",
      "price": "29.99",
      "categoryId": "550e8400-e29b-41d4-a716-446655440000",
      "imageUrl": "https://example.com/image1.jpg",
      "downloadUrl": "https://example.com/image1.jpg",
      "keywords": ["keyword1", "keyword2"]
    }
  ],
  "generated": 2,
  "total": 2
}
```

## ⚙️ Configuration

### OpenAI Model
Currently uses `gpt-4o` model. To change, edit:
`app/api/[storeId]/products/generate-from-images/route.ts` line 45

### Prompt Customization
The AI prompt can be customized in the same file (line 48-58) to change how products are generated.

## 🐛 Troubleshooting

### "OpenAI API key not configured"
- Make sure `OPENAI_API_KEY` is set in your `.env` file
- Restart your dev server after adding the key

### "Failed to generate any products"
- Check that image URLs are accessible (public URLs)
- Verify your OpenAI API key has credits
- Check server logs for detailed error messages

### Images not loading in preview
- Ensure image URLs are publicly accessible
- Check CORS settings if images are on different domains
- Some URLs may require authentication (not supported)

### Products generated but import fails
- Check that categoryId exists in your database
- Verify price format is valid
- Check server logs for validation errors

## 💡 Tips

1. **Image Quality**: Higher quality images produce better descriptions
2. **Batch Processing**: Process images in batches of 10-20 for best results
3. **Review Before Import**: Always review generated products before importing
4. **Edit CSV**: Download CSV, edit manually, then use Bulk Import if needed
5. **Keywords**: AI-generated keywords can be edited in the CSV before import

## 🔒 Security Notes

- OpenAI API key should NEVER be exposed to the client
- All API calls are server-side only
- Image URLs are sent to OpenAI - ensure you're okay with this
- Consider rate limiting for production use

## 📊 Cost Estimation

- GPT-4o Vision pricing: ~$0.01-0.03 per image (varies by image size)
- Processing 100 images: ~$1-3
- Check OpenAI pricing page for current rates

## 🎯 Future Enhancements

Potential improvements:
- [ ] Batch processing with progress bar
- [ ] Image upload instead of URLs
- [ ] Custom prompt templates
- [ ] Price per product (not just global)
- [ ] Keyword editing before import
- [ ] Image preview before generation
- [ ] Retry failed generations


